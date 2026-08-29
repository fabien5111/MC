// Lecture de la grille pour le back-office (serveur uniquement).
//
// **Pourquoi ne pas réutiliser `getGrid()` de `lib/entitlements-data.ts`** :
// celle-là est servie par le cache de référence, partagé entre visiteurs, et
// ne rend que les plans tels qu'ils sont diffusés. L'écran de paramétrage a
// besoin de l'inverse — l'état frais, immédiatement après une écriture, et
// les plans inactifs, qu'un administrateur doit pouvoir rouvrir. Lire en
// direct est ici la bonne réponse, pas un contournement : l'écran est rare et
// réservé à l'admin complet.
import { createClient } from '@/lib/supabase/server';
import type { Grid, GridFeature, GridPlan, GridRight, LimitType, RightValue } from '@/lib/entitlements';

export type AdminGrid = Grid & {
  /** Identifiants techniques, nécessaires à la publication d'une version. */
  planIds: Record<string, number>;
  /**
   * Nombre de membres que chaque plan gouverne aujourd'hui, pour le décompte
   * du récapitulatif avant enregistrement (§8.1).
   */
  subscribers: Record<string, number>;
};

const asLimitType = (v: string): LimitType => (v === 'STOCK' || v === 'FLOW' ? v : 'NONE');
const asRightValue = (v: string): RightValue => (v === 'YES' || v === 'LIMIT' ? v : 'NO');

export async function getAdminGrid(): Promise<AdminGrid> {
  const supabase = await createClient();

  const [plansRes, versionsRes, featuresRes, rightsRes] = await Promise.all([
    supabase.from('plans').select('id, code, label, tagline, order_index, is_default, trial_allowed, active').order('order_index'),
    supabase.from('plan_versions').select('id, plan_id, number, price_monthly, price_yearly, currency').eq('is_current', true),
    supabase
      .from('features')
      .select('id, key, label, description, section, section_order, order_index, limit_type, unit, visible')
      .order('section_order')
      .order('order_index'),
    supabase
      .from('plan_features')
      .select('plan_version_id, feature_id, value, limit_value, unlimited, plan_versions!inner(is_current)')
      .eq('plan_versions.is_current', true),
  ]);

  const planRows = plansRes.data ?? [];
  const versionRows = versionsRes.data ?? [];
  const featureRows = featuresRes.data ?? [];
  const rightRows = rightsRes.data ?? [];

  const versionByPlan = new Map(versionRows.map((v) => [v.plan_id, v]));
  const planByVersion = new Map<number, string>();
  const planIds: Record<string, number> = {};

  const plans: GridPlan[] = planRows.map((p) => {
    const v = versionByPlan.get(p.id);
    if (v) planByVersion.set(v.id, p.code);
    planIds[p.code] = p.id;
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
  for (const p of plans) rights[p.code] = {};
  for (const r of rightRows) {
    const code = planByVersion.get(r.plan_version_id);
    const key = keyById.get(r.feature_id);
    if (!code || !key) continue;
    rights[code][key] = {
      value: asRightValue(r.value),
      limitValue: r.limit_value,
      unlimited: r.unlimited,
    };
  }

  return { plans, features, rights, planIds, subscribers: await countSubscribers(supabase, plans) };
}

/**
 * Combien de membres chaque plan gouverne réellement.
 *
 * Le plan par défaut compte tous ceux qui n'ont **pas** d'abonnement actif
 * ailleurs — conséquence directe de l'arbitrage sur le grandfathering : une
 * modification de FREE les atteint tous, immédiatement. C'est précisément le
 * chiffre qu'un administrateur doit voir avant d'abaisser une limite.
 */
async function countSubscribers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  plans: GridPlan[],
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const p of plans) out[p.code] = 0;

  const [{ count: membres }, { data: actifs }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase
      .from('subscriptions')
      .select('user_id, plan_versions!inner(plans!inner(code))')
      .eq('status', 'ACTIVE')
      .neq('type', 'DEFAULT'),
  ]);

  const payants = new Set<string>();
  for (const s of actifs ?? []) {
    const code = s.plan_versions.plans.code;
    payants.add(s.user_id);
    out[code] = (out[code] ?? 0) + 1;
  }

  const defaut = plans.find((p) => p.isDefault);
  if (defaut) out[defaut.code] = Math.max(0, (membres ?? 0) - payants.size);
  return out;
}
