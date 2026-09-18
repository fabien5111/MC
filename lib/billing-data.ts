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
  encoderFormulaireStripe,
  messageErreurStripe,
  modeStripe,
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

export type ReponseStripe<T> = { ok: true; data: T } | { ok: false; status: number; message: string };

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
      return { ok: false, status: 0, message: `Appel Stripe impossible : ${message}` };
    }
  }

  if (resultat.status >= 400) {
    return { ok: false, status: resultat.status, message: messageErreurStripe(resultat.body) };
  }
  return { ok: true, data: resultat.body as T };
}

// ── Correspondance prix ↔ plan ──────────────────────────────

// `billing_prices`, `billing_customers` et `billing_events` ne sont pas encore
// dans lib/database.types.ts tant que la migration n'a pas été suivie d'un
// `npm run gen:types` — accès non typés en attendant, même motif que
// `notifications` dans notifications-data.ts et `ads` dans PartnersManager.
// Les quatre casts de ce fichier sont à retirer d'un bloc à la régénération.
type PrixFiltre = {
  eq: (col: string, value: string) => PrixFiltre;
  maybeSingle: () => PromiseLike<{ data: { external_price_id: string } | null }>;
};
type PrixSelect = { select: (cols: string) => PrixFiltre };

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
  // Jointure sur `plans` plutôt qu'un identifiant numérique : le reste du
  // chantier raisonne en CODE de plan (`mc_admin_grant_subscription`,
  // `mc_start_trial`, `mc_simulate_subscribe` prennent tous `p_plan_code`),
  // et un `plan_id` obligerait chaque appelant à résoudre le plan d'abord.
  const { data } = await (admin.from('billing_prices' as never) as unknown as PrixSelect)
    .select('external_price_id, plans!inner(code)')
    .eq('plans.code', planCode)
    .eq('mode', mode)
    .eq('periodicity', periodicite)
    .eq('provider', 'stripe')
    .maybeSingle();
  return data?.external_price_id ?? null;
}

// ── Client Stripe d'un membre ───────────────────────────────

type ClientSelect = {
  select: (cols: string) => {
    eq: (col: string, value: string) => {
      maybeSingle: () => PromiseLike<{ data: { external_customer_id: string } | null }>;
    };
  };
};
type ClientUpsert = {
  upsert: (values: unknown, options: { onConflict: string }) => PromiseLike<{ error: { message: string } | null }>;
};

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
  const { data } = await (supabase.from('billing_customers' as never) as unknown as ClientSelect)
    .select('external_customer_id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.external_customer_id ?? null;
});

/**
 * Enregistre le client Stripe d'un membre. Écriture serveur exclusivement :
 * `billing_customers` n'a aucune policy d'écriture, pour personne — un membre
 * qui pourrait poser son `external_customer_id` pourrait désigner celui d'un
 * autre et ouvrir son portail de facturation.
 */
export async function enregistrerClientStripe(userId: string, customerId: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await (admin.from('billing_customers' as never) as unknown as ClientUpsert).upsert(
    { user_id: userId, provider: 'stripe', external_customer_id: customerId, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(`billing_customers : ${error.message}`);
}

// ── Idempotence des webhooks ────────────────────────────────

type RpcAppel = (fn: string, args: Record<string, unknown>) => PromiseLike<{
  data: unknown;
  error: { message: string } | null;
}>;

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
  const { data, error } = await (admin.rpc as unknown as RpcAppel)('mc_claim_billing_event', {
    p_id: id,
    p_type: type,
  });
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
  const { error } = await (admin.rpc as unknown as RpcAppel)('mc_finish_billing_event', {
    p_id: id,
    p_status: statut,
    p_error: erreur ?? null,
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
  itemId: string | null;
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
  const { data, error } = await (admin.rpc as unknown as RpcAppel)('mc_apply_stripe_subscription', {
    p_customer_id: abo.customerId,
    p_subscription_id: abo.subscriptionId,
    p_item_id: abo.itemId,
    p_price_id: abo.priceId,
    p_stripe_status: abo.statut,
    p_current_period_end: abo.finPeriode,
    p_cancel_at_period_end: abo.annulationProgrammee,
    p_user_id: abo.userId ?? null,
    p_waiver_accepted_at: abo.renonciationLe ?? null,
  });
  if (error) throw new Error(`mc_apply_stripe_subscription : ${error.message}`);
  return Number(data);
}
