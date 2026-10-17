// Modération des membres (JEP-272, lot 2) — effets de bord d'une action de
// modération, côté SERVEUR uniquement et toujours avec la clé service_role :
// lecture de l'abonnement, gestes Stripe choisis par l'admin, recalcul des
// notes moyennes. Appelé par `POST /api/admin/membres/[id]/moderation`.
//
// Rien ne part sans le choix explicite de l'admin dans la fenêtre de
// confirmation ; la route revalide ce choix contre l'état lu ici
// (`validerActionAbonnement`, `lib/moderation.ts`).
import type { SupabaseClient } from '@supabase/supabase-js';
import { appelStripe, MissingStripeConfigError } from '@/lib/billing-data';
import { cleIdempotence } from '@/lib/billing';
import type { ActionAbonnement, EtatAbonnement } from '@/lib/moderation';

type Db = SupabaseClient;
const vers = (client: unknown): Db => client as Db;

type SubscriptionStripe = {
  status?: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  pause_collection?: unknown;
  schedule?: unknown;
  items?: { data?: { current_period_end?: number }[] };
};

export type AbonnementModere = {
  etat: EtatAbonnement | null;
  /** Identifiant Stripe de l'abonnement, quand il y en a un. */
  subscriptionId: string | null;
};

function finDePeriode(sub: SubscriptionStripe): string | null {
  const unix = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  return typeof unix === 'number' ? new Date(unix * 1000).toISOString() : null;
}

/** Libellé du plan dans la jointure `plan_versions(plans(label))`, objet ou tableau selon PostgREST. */
function libellePlan(planVersions: unknown): string | null {
  const version = Array.isArray(planVersions) ? planVersions[0] : planVersions;
  const plan = (version as { plans?: unknown } | null)?.plans;
  const p = Array.isArray(plan) ? plan[0] : plan;
  const label = (p as { label?: unknown } | null)?.label;
  return typeof label === 'string' && label ? label : null;
}

/** Échéancier attaché à l'abonnement (descente de formule programmée), rendu entier ou non. */
function identifiantEcheancier(valeur: unknown): string | null {
  if (typeof valeur === 'string') return valeur || null;
  const id = (valeur as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id ? id : null;
}

/**
 * Abonnement en cours du membre (hors plan par défaut), et son état réel chez
 * Stripe s'il est prélevé par Stripe. Une lecture Stripe impossible
 * (configuration absente, panne) rend `lectureStripe: 'echec'` : la fenêtre
 * n'offre alors aucun geste et renvoie vers le Dashboard.
 */
export async function lireAbonnementModere(admin: unknown, userId: string): Promise<AbonnementModere> {
  const { data, error } = await vers(admin)
    .from('subscriptions')
    .select('id, provider, external_subscription_id, type, ends_at, plan_versions(plans(label))')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .neq('type', 'DEFAULT')
    .order('starts_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) console.error('moderation (abonnement):', error.message);
  if (!data) return { etat: null, subscriptionId: null };

  const ligne = data as unknown as {
    provider: string | null;
    external_subscription_id: string | null;
    type: string;
    ends_at: string | null;
    plan_versions: unknown;
  };
  const libelle = libellePlan(ligne.plan_versions) ?? 'Abonnement';
  const subscriptionId = ligne.provider === 'stripe' && ligne.external_subscription_id ? ligne.external_subscription_id : null;

  const base: EtatAbonnement = {
    libelle,
    type: ligne.type,
    stripe: !!subscriptionId,
    finPeriode: ligne.ends_at,
    enPause: false,
    resiliationProgrammee: false,
    lectureStripe: subscriptionId ? 'echec' : 'sans_objet',
  };
  if (!subscriptionId) return { etat: base, subscriptionId: null };

  try {
    const lu = await appelStripe<SubscriptionStripe>(`/subscriptions/${subscriptionId}`);
    if (!lu.ok) {
      console.error('moderation (lecture Stripe):', lu.message);
      return { etat: base, subscriptionId };
    }
    return {
      subscriptionId,
      etat: {
        ...base,
        finPeriode: finDePeriode(lu.data) ?? ligne.ends_at,
        enPause: !!lu.data.pause_collection,
        resiliationProgrammee: lu.data.cancel_at_period_end === true,
        lectureStripe: 'ok',
      },
    };
  } catch (e) {
    if (e instanceof MissingStripeConfigError) {
      console.error('moderation (lecture Stripe):', e.message);
      return { etat: base, subscriptionId };
    }
    throw e;
  }
}

export type ResultatAbonnement = { ok: true; finPeriode: string | null } | { ok: false; message: string };

/**
 * Applique chez Stripe le geste choisi par l'admin. La table `subscriptions`
 * n'est pas réécrite ici : le webhook (`customer.subscription.updated`)
 * l'aligne, comme pour la résiliation en libre-service.
 *
 * - pause : `pause_collection[behavior]=void` — les factures émises pendant la
 *   pause sont annulées, rien n'est prélevé ; l'abonnement reste actif.
 * - reprendre : `pause_collection` vidé.
 * - résilier : à l'échéance (`cancel_at_period_end`), après libération d'un
 *   éventuel échéancier, qui bloquerait sinon la modification (même cas que
 *   `/api/abonnement/resilier`). Aucun remboursement : il reste un geste
 *   manuel du Dashboard Stripe.
 */
export async function appliquerActionAbonnement(
  subscriptionId: string,
  action: Exclude<ActionAbonnement, 'aucune'>,
  membreId: string,
): Promise<ResultatAbonnement> {
  try {
    if (action === 'resilier') {
      const lu = await appelStripe<SubscriptionStripe>(`/subscriptions/${subscriptionId}`);
      const echeancier = lu.ok ? identifiantEcheancier(lu.data.schedule) : null;
      if (echeancier) {
        const libere = await appelStripe<unknown>(`/subscription_schedules/${echeancier}/release`, {
          idempotencyKey: cleIdempotence('admin-liberer', membreId, echeancier),
          corps: {},
        });
        if (!libere.ok) return { ok: false, message: `Libération de l’échéancier refusée : ${libere.message}` };
      }
    }
    const corps: Record<string, unknown> =
      action === 'pause'
        ? { pause_collection: { behavior: 'void' } }
        : action === 'reprendre'
          ? { pause_collection: '' }
          : { cancel_at_period_end: true };
    const r = await appelStripe<SubscriptionStripe>(`/subscriptions/${subscriptionId}`, {
      idempotencyKey: cleIdempotence(`admin-${action}`, membreId, subscriptionId),
      corps,
    });
    if (!r.ok) return { ok: false, message: r.message };
    return { ok: true, finPeriode: finDePeriode(r.data) };
  } catch (e) {
    if (e instanceof MissingStripeConfigError) return { ok: false, message: e.message };
    throw e;
  }
}

/**
 * Recalcule la note moyenne des recettes que le membre a notées : à la
 * désactivation, ses avis disparaissent de l'affichage (RLS), et la note
 * stockée (`recipes.rating_avg` / `rating_count`) doit les exclure aussi ; à
 * la levée, les y remettre. Le calcul est fait en SQL par
 * `public.mc_recalculer_note(uuid)`, la même fonction que le trigger des
 * avis. Fonction absente (migration non jouée) : on s'arrête sans erreur.
 * Renvoie le nombre de recettes recalculées.
 */
export async function recalculerNotesDuMembre(admin: unknown, membreId: string): Promise<number> {
  const db = vers(admin);
  const { data, error } = await db
    .from('comments')
    .select('recipe_id')
    .eq('user_id', membreId)
    .eq('status', 'approved')
    .not('recipe_id', 'is', null);
  if (error) {
    console.error('moderation (notes):', error.message);
    return 0;
  }
  const recettes = [...new Set((data ?? []).map((l) => (l as { recipe_id: string }).recipe_id))];
  let faites = 0;
  for (const id of recettes) {
    const { error: e } = await db.rpc('mc_recalculer_note', { p_recipe: id });
    if (e) {
      console.error('moderation (recalcul de note):', e.message);
      break;
    }
    faites++;
  }
  return faites;
}
