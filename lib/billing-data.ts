// Stripe — accès réseau et base. Serveur uniquement (importe le client
// Supabase à privilèges et lit des secrets d'environnement).
//
// Même séparation que `ideas.ts` / `ideas-data.ts` et `projects.ts` /
// `projects-data.ts` : la logique pure vit dans `lib/billing.ts`, qu'un
// composant client peut importer sans tirer `next/headers` ni la clé
// service_role dans le bundle.
//
// **Ce module ne décide rien.** Il transporte : il passe à
// `mc_apply_stripe_subscription` le statut Stripe BRUT, et c'est la fonction
// SQL qui le traduit en `ACTIVE` / `CANCELLED`. Écrire cette traduction ici
// aussi en ferait deux implémentations d'une même règle, qui divergeraient au
// premier changement — exactement ce que le §5 de `docs/abonnements.md`
// interdit pour le calcul des droits.
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  STRIPE_API_BASE,
  codeErreurStripe,
  encoderFormulaireStripe,
  identifiantEcheancier,
  lirePhasesEcheancier,
  messageErreurStripe,
  modeStripe,
  phaseCourante,
  type ModeStripe,
} from '@/lib/billing';

const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 500;

export class MissingStripeConfigError extends Error {
  constructor(nom: string) {
    super(`Paiement indisponible : la variable ${nom} n'est pas configurée sur le serveur.`);
    this.name = 'MissingStripeConfigError';
  }
}

export type ConfigStripe = { cleSecrete: string; mode: ModeStripe };

/**
 * Lève plutôt que de rendre `null` : une route de paiement sans clé ne doit
 * pas se dégrader en silence, contrairement à la modération IA ou à l'e-mail.
 * Un abonnement qui échoue à moitié coûte de l'argent réel.
 */
export function configStripe(): ConfigStripe {
  const cleSecrete = process.env.STRIPE_SECRET_KEY;
  if (!cleSecrete) throw new MissingStripeConfigError('STRIPE_SECRET_KEY');
  return { cleSecrete, mode: modeStripe(cleSecrete) };
}

// `code` porte le code d'erreur Stripe brut (`card_declined`,
// `authentication_required`…) : `message` est fait pour les journaux, `code`
// pour brancher dessus — un refus de carte et une authentification demandée
// n'appellent pas le même message côté membre.
export type ReponseStripe<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; code: string | null };

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Appel à l'API Stripe. Timeout de 10 s et un seul retry sur les échecs
 * transitoires (réseau, 429, 5xx) — même politique que `lib/jira.ts`.
 *
 * **`idempotencyKey` sur toute écriture**, sans exception : un retry sur un
 * `POST` de création est indiscernable, côté Stripe, d'une seconde demande.
 * Sans cette clé, le retry ci-dessus créerait un deuxième abonnement — donc
 * un deuxième prélèvement. C'est la raison pour laquelle le paramètre est
 * requis dès qu'un corps est fourni, et non optionnel.
 */
export async function appelStripe<T>(
  chemin: string,
  options: { methode?: 'GET' | 'POST'; corps?: Record<string, unknown>; idempotencyKey?: string } = {},
): Promise<ReponseStripe<T>> {
  const { cleSecrete } = configStripe();
  const methode = options.methode ?? (options.corps ? 'POST' : 'GET');

  if (options.corps && !options.idempotencyKey) {
    throw new Error('appelStripe : une écriture exige une idempotencyKey.');
  }

  const tentative = async (): Promise<{ status: number; body: unknown }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const reponse = await fetch(`${STRIPE_API_BASE}${chemin}`, {
        method: methode,
        signal: controller.signal,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${cleSecrete}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        },
        body: options.corps ? encoderFormulaireStripe(options.corps) : undefined,
      });
      return { status: reponse.status, body: await reponse.json().catch(() => null) };
    } finally {
      clearTimeout(timer);
    }
  };

  const transitoire = (status: number) => status === 429 || status >= 500;

  let resultat: { status: number; body: unknown };
  try {
    resultat = await tentative();
    if (transitoire(resultat.status)) {
      await attendre(RETRY_DELAY_MS);
      resultat = await tentative();
    }
  } catch (e) {
    await attendre(RETRY_DELAY_MS);
    try {
      resultat = await tentative();
    } catch (e2) {
      const message = (e2 as Error)?.message || (e as Error)?.message || 'appel impossible';
      return { ok: false, status: 0, message: `Appel Stripe impossible : ${message}`, code: null };
    }
  }

  if (resultat.status >= 400) {
    return {
      ok: false,
      status: resultat.status,
      message: messageErreurStripe(resultat.body),
      code: codeErreurStripe(resultat.body),
    };
  }
  return { ok: true, data: resultat.body as T };
}

// ── Correspondance prix ↔ plan ──────────────────────────────

export type Periodicite = 'MONTHLY' | 'YEARLY';

/**
 * Identifiant de prix Stripe d'un plan, dans le mode de la clé en vigueur.
 *
 * Passe par le client à privilèges : `billing_prices` n'a qu'une policy
 * administrateur, un membre ordinaire y lirait zéro ligne. Ce n'est pas une
 * donnée secrète, mais elle n'a aucune raison d'être exposée — seule une
 * route serveur la résout.
 *
 * `null` quand le plan n'a pas de prix dans ce mode : c'est ce qui rend
 * `PRO_ESSAI` invendable sans qu'aucun code ne connaisse son nom, et ce qui
 * garde la formule annuelle fermée tant qu'aucune ligne `YEARLY` n'existe.
 */
export async function resoudrePrixStripe(planCode: string, periodicite: Periodicite): Promise<string | null> {
  const { mode } = configStripe();
  const admin = createAdminClient();
  // Le plan est résolu par son CODE, comme partout ailleurs dans le chantier
  // (`mc_admin_grant_subscription`, `mc_start_trial`, `mc_simulate_subscribe`
  // prennent tous `p_plan_code`) — un `plan_id` obligerait chaque appelant à
  // le résoudre d'abord. Deux lectures plutôt qu'un filtre sur ressource
  // embarquée : c'est le geste que fait déjà `app/plans/page.tsx`, et ça
  // reste lisible. Le coût ne compte pas ici — on est sur un clic d'achat,
  // pas sur un rendu de page.
  const { data: plan } = await admin.from('plans').select('id').eq('code', planCode).maybeSingle();
  if (!plan) return null;

  const { data } = await admin
    .from('billing_prices')
    .select('external_price_id')
    .eq('plan_id', plan.id)
    .eq('mode', mode)
    .eq('periodicity', periodicite)
    .eq('provider', 'stripe')
    .maybeSingle();
  return data?.external_price_id ?? null;
}

export type ChangementProgramme = { planLabel: string; effectiveAt: string };

/**
 * Changement de formule déjà programmé (descente en gamme, §
 * `app/api/abonnement/changer/route.ts`) — lu en DIRECT chez Stripe, jamais
 * mis en cache ni dupliqué en base.
 *
 * Même arbitrage que `getUserIdentities()` sur ce même écran
 * (`lib/auth.ts`) : un appel externe assumé sur une page rare (`/reglages`),
 * plutôt qu'une colonne de plus à tenir synchronisée à chaque webhook qui
 * touche l'abonnement (une seconde descente qui remplace la première, une
 * montée qui l'annule et la remet en place si elle échoue, son application
 * à l'échéance...). Découvert le 22/09 en testant une descente Pro → Plus :
 * la confirmation était un message ponctuel, sans aucune trace ensuite —
 * un membre ne pouvait pas revérifier qu'un changement était bien programmé.
 *
 * Confort d'affichage seulement, jamais une source de vérité pour les
 * droits : `null` s'il n'y a rien de programmé OU en cas de panne Stripe.
 */
export async function getChangementProgramme(subscriptionId: string): Promise<ChangementProgramme | null> {
  const abo = await appelStripe<{ schedule?: unknown }>(`/subscriptions/${subscriptionId}`);
  if (!abo.ok) return null;
  const echeancierId = identifiantEcheancier(abo.data.schedule);
  if (!echeancierId) return null;

  const echeancier = await appelStripe<unknown>(`/subscription_schedules/${echeancierId}`);
  if (!echeancier.ok) return null;

  const phases = lirePhasesEcheancier(echeancier.data);
  const courante = phaseCourante(echeancier.data, phases);
  // Jamais « la phase qui n'est pas la courante » : une fois la bascule
  // appliquée, la phase courante EST déjà la cible, et « l'autre » phase
  // n'est plus celle à venir — c'est celle d'AVANT, déjà révolue. Stripe ne
  // libère l'échéancier qu'à la fin de la dernière phase (un cycle complet
  // de plus, cf. le correctif `phases[iterations]`), donc cette fenêtre où
  // la cible est déjà en place mais l'échéancier encore attaché dure tout un
  // mois — constaté le 22/09 : le message affichait « Pro programmé »,
  // Pro étant la phase révolue, pas la suivante. Seule une date de début
  // STRICTEMENT postérieure à la phase courante compte comme « à venir ».
  const debutCourante = courante?.startDate;
  const suivante =
    debutCourante === null || debutCourante === undefined
      ? undefined
      : phases.find((p) => p.startDate !== null && p.startDate > debutCourante);
  if (!suivante?.priceId || suivante.startDate === null) return null;

  // Même motif que `resoudrePrixStripe` juste au-dessus : deux lectures
  // plutôt qu'un filtre sur ressource embarquée, pour rester lisible — le
  // coût ne compte pas sur cette page rare.
  const admin = createAdminClient();
  const { data: prix } = await admin
    .from('billing_prices')
    .select('plan_id')
    .eq('external_price_id', suivante.priceId)
    .eq('provider', 'stripe')
    .maybeSingle();
  if (!prix) return null;
  const { data: plan } = await admin.from('plans').select('label').eq('id', prix.plan_id).maybeSingle();
  if (!plan) return null;

  return { planLabel: plan.label, effectiveAt: new Date(suivante.startDate * 1000).toISOString() };
}

// ── Client Stripe d'un membre ───────────────────────────────

/**
 * Identifiant client Stripe du membre, s'il en a un.
 *
 * Mémoïsé par requête : la page des réglages l'utilise pour décider d'afficher
 * « Gérer mon abonnement », et la route du portail le relit juste après.
 *
 * Lu avec la session (policy `billing_customers_lecture`, propriétaire ou
 * admin) et non avec la clé service_role : c'est une lecture de page, elle
 * doit rester soumise à la RLS comme le reste du site.
 */
export const getIdClientStripe = cache(async (userId: string): Promise<string | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('billing_customers')
    .select('external_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.external_customer_id ?? null;
});

/**
 * Membre rattaché à un client Stripe — la lecture INVERSE de la précédente.
 *
 * Réservée au webhook, qui reçoit un identifiant client et doit retrouver le
 * compte : pas de session à cet endroit, donc le client à privilèges. Ce
 * n'est pas un contournement de RLS par confort — il n'y a personne dont on
 * pourrait emprunter les droits.
 */
export async function getIdClientStripeAdmin(customerId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('billing_customers')
    .select('user_id')
    .eq('provider', 'stripe')
    .eq('external_customer_id', customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

/**
 * Enregistre le client Stripe d'un membre. Écriture serveur exclusivement :
 * `billing_customers` n'a aucune policy d'écriture, pour personne — un membre
 * qui pourrait poser son `external_customer_id` pourrait désigner celui d'un
 * autre et ouvrir son portail de facturation.
 */
export async function enregistrerClientStripe(userId: string, customerId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('billing_customers').upsert(
    { user_id: userId, provider: 'stripe', external_customer_id: customerId, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`billing_customers : ${error.message}`);
}

// ── Idempotence des webhooks ────────────────────────────────

/**
 * Réserve un événement Stripe. `false` = déjà traité, ou en cours de
 * traitement ailleurs : la route répond 200 sans rien faire.
 *
 * Réserver et marquer en une seule opération, jamais un `select` puis un
 * `insert` — deux livraisons simultanées du même événement passeraient toutes
 * les deux entre les deux instructions. Même motif que `claimNotification` et
 * que `mc_consume`.
 */
export async function reserverEvenementStripe(id: string, type: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('mc_claim_billing_event', { p_id: id, p_type: type });
  if (error) throw new Error(`mc_claim_billing_event : ${error.message}`);
  return data === true;
}

/** Clôt un événement réservé. Un `FAILED` reste reprenable au prochain rejeu. */
export async function cloreEvenementStripe(
  id: string,
  statut: 'PROCESSED' | 'FAILED' | 'IGNORED',
  erreur?: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.rpc('mc_finish_billing_event', {
    p_id: id,
    p_status: statut,
    p_error: erreur,
  });
  // Un échec de clôture ne doit pas faire échouer le traitement lui-même :
  // l'événement retombera en reprise après cinq minutes, et l'abonnement,
  // déjà écrit, est correct.
  if (error) console.error('mc_finish_billing_event:', error.message);
}

// ── Écriture de l'abonnement ────────────────────────────────

export type AbonnementStripe = {
  customerId: string;
  subscriptionId: string;
  /**
   * Ligne d'article de l'abonnement (`si_…`), nécessaire au changement de
   * formule. Jamais nulle : un abonnement Stripe porte toujours au moins un
   * article, et l'appelant le lit sur l'objet `subscription` qu'il vient de
   * recevoir — le rendre optionnel ici ferait porter au SQL un cas que
   * l'API ne produit pas.
   */
  itemId: string;
  priceId: string;
  /** Statut Stripe BRUT (`active`, `past_due`, `canceled`…) — traduit en SQL. */
  statut: string;
  finPeriode: string;
  annulationProgrammee: boolean;
  /** Renseigné au premier rattachement seulement (métadonnée du Checkout). */
  userId?: string | null;
  renonciationLe?: string | null;
};

/**
 * Point d'écriture UNIQUE de l'abonnement, côté application.
 *
 * Tout passe par `mc_apply_stripe_subscription` : c'est elle qui porte la
 * clôture de la ligne précédente, le calcul de `renewal_anchor` et la
 * traduction du statut. Écrire `subscriptions` directement depuis ici
 * contournerait ces trois règles à la première évolution.
 */
export async function appliquerAbonnementStripe(abo: AbonnementStripe): Promise<number> {
  const admin = createAdminClient();
  // `p_user_id` et `p_waiver_accepted_at` sont OMIS plutôt que passés à
  // `null` : ce sont les deux seuls arguments à valeur par défaut côté SQL,
  // et un `undefined` disparaît à la sérialisation, laissant la fonction
  // appliquer son propre défaut.
  const { data, error } = await admin.rpc('mc_apply_stripe_subscription', {
    p_customer_id: abo.customerId,
    p_subscription_id: abo.subscriptionId,
    p_item_id: abo.itemId,
    p_price_id: abo.priceId,
    p_stripe_status: abo.statut,
    p_current_period_end: abo.finPeriode,
    p_cancel_at_period_end: abo.annulationProgrammee,
    p_user_id: abo.userId ?? undefined,
    p_waiver_accepted_at: abo.renonciationLe ?? undefined,
  });
  if (error) throw new Error(`mc_apply_stripe_subscription : ${error.message}`);
  return Number(data);
}

// ── Résiliation et portail (lot E) ──────────────────────────

export type AbonnementResiliable = {
  id: number;
  provider: string;
  externalSubscriptionId: string | null;
  type: string;
  endsAt: string | null;
};

/**
 * Abonnement `ACTIVE` non-`DEFAULT` du membre courant, tel qu'il faut le
 * connaître pour décider COMMENT le résilier — un `TRIAL` ou un `GIFT` n'ont
 * jamais d'objet Stripe, seul un `PAID` en `provider = 'stripe'` en a un.
 *
 * Lu avec la session (policy `subscriptions_lecture`), pas le client à
 * privilèges : c'est une lecture de page/route ordinaire, encore soumise à la
 * RLS comme le reste du site.
 */
export async function getAbonnementResiliable(userId: string): Promise<AbonnementResiliable | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('id, provider, external_subscription_id, type, ends_at')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .neq('type', 'DEFAULT')
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    provider: data.provider,
    externalSubscriptionId: data.external_subscription_id,
    type: data.type,
    endsAt: data.ends_at,
  };
}

export type AbonnementStripeCourant = {
  subscriptionId: string;
  planCode: string;
  planOrderIndex: number;
  /** Périodicité RÉELLE de l'abonnement — jamais celle affichée par la page. */
  periodicite: Periodicite;
};

/**
 * Abonnement Stripe actif du membre, avec le RANG de son plan dans la grille.
 *
 * C'est ce rang — `plans.order_index`, celui-là même qui ordonne les colonnes
 * de `/plans` — qui décide si un changement est une montée ou une descente.
 * Jamais le code du plan : la règle ESLint du dépôt l'interdit, et un palier
 * ajouté en back-office doit se placer tout seul.
 *
 * `null` quand l'abonnement courant n'est pas un abonnement Stripe (essai,
 * don administrateur, reliquat de l'ancienne simulation) : ceux-là n'ont rien
 * à changer chez Stripe, ils passent par la souscription normale.
 */
export async function getAbonnementStripeCourant(userId: string): Promise<AbonnementStripeCourant | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('external_subscription_id, periodicity, plan_versions!inner(plans!inner(code, order_index))')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .eq('provider', 'stripe')
    .neq('type', 'DEFAULT')
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const plan = data?.plan_versions?.plans;
  if (!data?.external_subscription_id || !plan) return null;
  return {
    subscriptionId: data.external_subscription_id,
    planCode: plan.code,
    planOrderIndex: plan.order_index,
    // Un changement de FORMULE ne change pas la PÉRIODICITÉ : la lire sur
    // l'abonnement, et non sur la bascule d'affichage de `/plans`, évite
    // qu'un abonné annuel se retrouve programmé sur un tarif mensuel (ou
    // qu'un mensuel soit débité d'une année au prorata) parce que la bascule
    // était du mauvais côté au moment du clic.
    periodicite: data.periodicity === 'YEARLY' ? 'YEARLY' : 'MONTHLY',
  };
}
