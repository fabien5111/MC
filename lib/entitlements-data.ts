// Droits d'abonnement — accès aux données (serveur uniquement).
//
// Pendant de `lib/entitlements.ts`, qui est pur : ce fichier importe
// `lib/supabase/server` (donc `next/headers`) et ne doit jamais être tiré par
// un Client Component — même séparation que `ideas.ts` / `ideas-data.ts` et
// `projects.ts` / `projects-data.ts`, sans quoi le build du bundle client
// échoue.
//
// **Deux natures de lecture, deux caches différents, à ne jamais confondre :**
//
// - la **grille** (plans, versions, fonctionnalités, droits) est identique
//   pour tout le monde : elle passe par `lib/data/reference.ts`, donc par
//   `unstable_cache`, partagé entre requêtes ET entre visiteurs ;
// - l'**abonnement d'un membre** dépend de l'utilisateur : `cache()` React
//   par requête, jamais `unstable_cache`, qui lit au rôle `anon` et servirait
//   les droits d'un membre à un autre. C'est exactement la régression décrite
//   dans docs/note-regression-cache.md.
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import {
  getCurrentPlanFeatures,
  getCurrentPlanVersions,
  getFeatureRows,
  getPlanRows,
} from '@/lib/data/reference';
import { quotaFailure, type QuotaFailure } from '@/lib/entitlements';
import type {
  Entitlements,
  Grid,
  GridFeature,
  GridPlan,
  GridRight,
  LimitType,
  RightValue,
} from '@/lib/entitlements';

// ── Grille ──────────────────────────────────────────────────

const asLimitType = (v: string): LimitType =>
  v === 'STOCK' || v === 'FLOW' ? v : 'NONE';

const asRightValue = (v: string): RightValue =>
  v === 'YES' || v === 'LIMIT' ? v : 'NO';

/**
 * La grille complète, sous la forme qu'attendent la page publique, le
 * back-office et le composant de blocage.
 *
 * Quatre lectures de référence déjà en cache, recomposées en mémoire — motif
 * « une lecture par table, plusieurs formes en sortie » de
 * `lib/data/reference.ts`. Aucune requête supplémentaire n'est émise ici.
 */
export const getGrid = cache(async (): Promise<Grid> => {
  const [planRows, versionRows, featureRows, rightRows] = await Promise.all([
    getPlanRows(),
    getCurrentPlanVersions(),
    getFeatureRows(),
    getCurrentPlanFeatures(),
  ]);

  const versionByPlan = new Map(versionRows.map((v) => [v.plan_id, v]));
  const planByVersion = new Map<number, string>();

  const plans: GridPlan[] = planRows.map((p) => {
    const v = versionByPlan.get(p.id);
    if (v) planByVersion.set(v.id, p.code);
    return {
      code: p.code,
      label: p.label,
      tagline: p.tagline,
      orderIndex: p.order_index,
      isDefault: p.is_default,
      trialAllowed: p.trial_allowed,
      active: p.active,
      priceMonthly: v?.price_monthly ?? null,
      priceYearly: v?.price_yearly ?? null,
      currency: v?.currency ?? 'EUR',
    };
  });

  const features: GridFeature[] = featureRows.map((f) => ({
    key: f.key,
    label: f.label,
    description: f.description,
    section: f.section,
    sectionOrder: f.section_order,
    orderIndex: f.order_index,
    limitType: asLimitType(f.limit_type),
    unit: f.unit,
    visible: f.visible,
  }));

  const keyById = new Map(featureRows.map((f) => [f.id, f.key]));
  const rights: Record<string, Record<string, GridRight>> = {};
  for (const plan of plans) rights[plan.code] = {};
  for (const r of rightRows) {
    const planCode = planByVersion.get(r.plan_version_id);
    const featureKey = keyById.get(r.feature_id);
    if (!planCode || !featureKey) continue;
    rights[planCode][featureKey] = {
      value: asRightValue(r.value),
      limitValue: r.limit_value,
      unlimited: r.unlimited,
    };
  }

  return { plans, features, rights };
});

// ── Droits d'une version de plan spécifique ─────────────────

/**
 * Droits portés par UNE version de plan précise — jamais « la version
 * courante » (`getGrid()`). Sert exclusivement au calcul « ce que le membre
 * a réellement perdu » à l'expiration (§10) : la version à laquelle il était
 * réellement souscrit peut différer de la version courante du même plan si
 * la grille a changé entre-temps, et c'est celle-là qui doit compter, pas la
 * grille d'aujourd'hui.
 */
export async function getRightsForVersion(planVersionId: number): Promise<Record<string, GridRight>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('plan_features')
    .select('value, limit_value, unlimited, features!inner(key)')
    .eq('plan_version_id', planVersionId);
  const out: Record<string, GridRight> = {};
  for (const r of data ?? []) {
    out[r.features.key] = {
      value: asRightValue(r.value),
      limitValue: r.limit_value,
      unlimited: r.unlimited,
    };
  }
  return out;
}

// ── Droits d'un membre ──────────────────────────────────────

/**
 * Droits effectifs, tels que `mc_effective_rights` les calcule.
 *
 * La règle du maximum entre version souscrite et version courante n'est PAS
 * reproduite ici : elle vit en SQL, parce que c'est elle que les triggers
 * appliquent à l'écriture. En avoir une seconde version en TypeScript
 * garantirait qu'un jour les deux divergent, et que l'interface autorise ce
 * que la base refuse.
 *
 * Mémoïsé par requête : plusieurs composants d'une même page peuvent
 * l'appeler sans multiplier les allers-retours.
 */
export const getEntitlements = cache(async (userId: string): Promise<Entitlements> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mc_effective_rights', { p_user_id: userId });
  if (error) {
    // Panne de lecture : on ne peut ni accorder (ce serait ouvrir les droits
    // payants) ni prétendre savoir. Droits vides = tout refusé côté
    // affichage ; la base, elle, reste seule juge à l'écriture.
    console.error('entitlements/effective_rights:', error.message);
    return {};
  }
  const out: Entitlements = {};
  for (const r of data ?? []) {
    out[r.feature_key] = {
      featureKey: r.feature_key,
      limitType: asLimitType(r.limit_type),
      allowed: r.allowed,
      unlimited: r.unlimited,
      limitValue: r.limit_value ?? null,
    };
  }
  return out;
});

export type UsageLine = {
  featureKey: string;
  limitType: LimitType;
  allowed: boolean;
  unlimited: boolean;
  limitValue: number | null;
  usage: number;
  /** Date de recharge, pour les quotas de flux uniquement. */
  periodEnd: string | null;
};

/**
 * Droits ET consommation ET date de recharge, en une requête
 * (`mc_usage_report`, motif de `list_ideas`).
 *
 * Coûteux : cinq comptages d'objets. Réservé aux écrans qui montrent des
 * jauges — le profil du membre et la fiche d'administration. **Jamais pour
 * un contrôle d'accès**, qui n'a besoin que de `getEntitlements`.
 */
export const getUsageReport = cache(async (userId: string): Promise<UsageLine[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mc_usage_report', { p_user_id: userId });
  if (error) {
    console.error('entitlements/usage_report:', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    featureKey: r.feature_key,
    limitType: asLimitType(r.limit_type),
    allowed: r.allowed,
    unlimited: r.unlimited,
    limitValue: r.limit_value ?? null,
    usage: r.usage,
    periodEnd: r.period_end ?? null,
  }));
});

export type CurrentPlan = {
  code: string;
  label: string;
  /** `DEFAULT`, `TRIAL`, `PAID` ou `GIFT`. */
  type: string;
  startsAt: string;
  endsAt: string | null;
  /** Jours restants, `null` quand l'abonnement n'expire pas. */
  daysLeft: number | null;
};

/**
 * Plan courant du membre — pour l'en-tête de la page des plans (« Votre
 * plan »), le bandeau d'essai et les messages de blocage.
 *
 * Lit l'abonnement payant/essai actif s'il existe, sinon la ligne `DEFAULT`.
 * Le tri et le repli reproduisent `mc_effective_rights`, mais sans enjeu :
 * c'est un libellé d'affichage, pas une décision d'accès — celle-là ne passe
 * que par `getEntitlements`.
 */
export const getCurrentPlan = cache(async (userId: string): Promise<CurrentPlan | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('type, starts_at, ends_at, plan_versions!inner(plans!inner(code, label))')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .order('starts_at', { ascending: false });
  if (error || !data?.length) return null;

  const maintenant = Date.now();
  const vivant = (l: (typeof data)[number]) =>
    l.ends_at === null || new Date(l.ends_at).getTime() > maintenant;

  const ligne = data.find((l) => l.type !== 'DEFAULT' && vivant(l)) ?? data.find((l) => l.type === 'DEFAULT');
  if (!ligne) return null;

  const plan = ligne.plan_versions.plans;
  return {
    code: plan.code,
    label: plan.label,
    type: ligne.type,
    startsAt: ligne.starts_at,
    endsAt: ligne.ends_at,
    daysLeft:
      ligne.ends_at === null
        ? null
        : Math.max(0, Math.ceil((new Date(ligne.ends_at).getTime() - maintenant) / 86_400_000)),
  };
});

// ── Page publique des plans ─────────────────────────────────

/** Essai déjà consommé par ce membre — tous plans confondus (§7.2). */
export const hasConsumedTrial = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.from('trials').select('id').eq('user_id', userId).maybeSingle();
  return !!data;
});

export type PendingRequest = { id: number; planCode: string; createdAt: string };

/**
 * Demande d'abonnement en attente de ce membre, s'il y en a une — au plus
 * une à la fois (index unique `subscription_requests_one_pending`). Sert à
 * afficher « Demande transmise » plutôt que de laisser cliquer une seconde
 * fois pour se heurter à la contrainte.
 */
export const getPendingRequest = cache(async (userId: string): Promise<PendingRequest | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('subscription_requests')
    .select('id, created_at, plans!inner(code)')
    .eq('user_id', userId)
    .eq('status', 'PENDING')
    .maybeSingle();
  if (!data) return null;
  return { id: data.id, planCode: data.plans.code, createdAt: data.created_at };
});

// ── Quotas de flux ──────────────────────────────────────────

/**
 * Consomme un crédit de flux. Vérifie ET incrémente sous verrou, en une
 * opération : appeler un contrôle puis un incrément laisserait deux requêtes
 * simultanées passer sur le dernier crédit.
 *
 * À appeler **après** le succès de l'action facturée quand c'est possible ;
 * quand l'action est longue (un appel IA), consommer avant et rendre le
 * crédit avec `refundQuota` en cas d'échec.
 */
export async function consumeQuota(key: string, n = 1): Promise<QuotaFailure | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mc_consume', { p_key: key, p_n: n });
  if (!error) return null;
  return quotaFailure(error) ?? { code: 'AUTRE', featureKey: key, usage: null, limit: null };
}

/**
 * Rend un crédit consommé pour une action qui a finalement échoué.
 * Silencieuse : l'échec qu'elle compense a déjà été signalé à l'appelant, et
 * un crédit non rendu ne doit pas se transformer en second message d'erreur.
 */
export async function refundQuota(key: string, n = 1): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc('mc_refund', { p_key: key, p_n: n });
  } catch (err) {
    console.error('entitlements/refund:', err);
  }
}
