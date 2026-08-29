// Gestion d'un abonnement, membre par membre (back-office, admin complet).
//
// Séparé de `lib/entitlements-data.ts` : ce module lit et écrit pour un
// membre CHOISI par l'administrateur, jamais pour l'utilisateur courant — la
// confusion serait dangereuse (afficher l'historique d'un autre membre à sa
// propre place). Les mutations passent exclusivement par les fonctions
// SECURITY DEFINER `mc_admin_*` : elles seules ferment l'abonnement actif
// avant d'en ouvrir un autre, tiennent le journal, et vérifient le rôle
// serveur-side (jamais un contrôle uniquement côté écran).
import { createClient } from '@/lib/supabase/server';
import { getUsageReport, type UsageLine } from '@/lib/entitlements-data';

export type SubscriptionRow = {
  id: number;
  planCode: string;
  planLabel: string;
  type: string;
  periodicity: string;
  startsAt: string;
  endsAt: string | null;
  status: string;
  reason: string | null;
  createdBy: string | null;
};

export type MemberSubscriptionOverview = {
  /** Ligne actuellement ACTIVE hors DEFAUT, ou la ligne DEFAUT si aucune. */
  current: SubscriptionRow | null;
  daysLeft: number | null;
  /** Toutes les lignes, triées de la plus récente à la plus ancienne. */
  history: SubscriptionRow[];
  usage: UsageLine[];
  trialConsumed: boolean;
  /** Plans actifs proposables depuis l'écran (attribuer / changer de plan). */
  availablePlans: { code: string; label: string }[];
};

function versLigne(r: {
  id: number;
  type: string;
  periodicity: string;
  starts_at: string;
  ends_at: string | null;
  status: string;
  reason: string | null;
  created_by: string | null;
  plan_versions: { plans: { code: string; label: string } };
}): SubscriptionRow {
  return {
    id: r.id,
    planCode: r.plan_versions.plans.code,
    planLabel: r.plan_versions.plans.label,
    type: r.type,
    periodicity: r.periodicity,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    status: r.status,
    reason: r.reason,
    createdBy: r.created_by,
  };
}

export async function getMemberSubscriptionOverview(userId: string): Promise<MemberSubscriptionOverview> {
  const supabase = await createClient();

  const [{ data: rows }, { data: trial }, { data: plans }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('id, type, periodicity, starts_at, ends_at, status, reason, created_by, plan_versions!inner(plans!inner(code, label))')
      .eq('user_id', userId)
      .order('starts_at', { ascending: false }),
    supabase.from('trials').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase.from('plans').select('code, label').eq('active', true).order('order_index'),
  ]);

  const history = (rows ?? []).map(versLigne);
  const maintenant = Date.now();
  const vivant = (l: SubscriptionRow) => l.endsAt === null || new Date(l.endsAt).getTime() > maintenant;

  const current =
    history.find((l) => l.status === 'ACTIVE' && l.type !== 'DEFAULT' && vivant(l)) ??
    history.find((l) => l.type === 'DEFAULT') ??
    null;

  const daysLeft =
    current?.endsAt == null ? null : Math.max(0, Math.ceil((new Date(current.endsAt).getTime() - maintenant) / 86_400_000));

  return {
    current,
    daysLeft,
    history,
    usage: await getUsageReport(userId),
    trialConsumed: !!trial,
    availablePlans: (plans ?? []).map((p) => ({ code: p.code, label: p.label })),
  };
}

/**
 * Plan actif, type et échéance de chaque membre — pour les colonnes de la
 * liste (§8.3). Une seule requête groupée plutôt qu'un aller-retour par
 * ligne : la liste peut compter des centaines de membres.
 */
type LigneActive = {
  user_id: string;
  type: string;
  ends_at: string | null;
  starts_at: string;
  status: string;
  // Le libellé (`label`) est celui affiché aux membres et modifiable en
  // back-office — c'est lui qu'il faut montrer ici, jamais le `code`
  // technique immuable (« FREE », « PRO »), qui n'a de sens que pour la
  // logique, jamais pour l'affichage (cf. CLAUDE.md « Contrainte forte »).
  plan_versions: { plans: { code: string; label: string } };
};

export async function getMembersSubscriptionSummaries(): Promise<
  Map<string, { planCode: string; planLabel: string; type: string; endsAt: string | null; trialConsumed: boolean }>
> {
  const supabase = await createClient();
  const [{ data: rows }, { data: trials }] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('user_id, type, ends_at, starts_at, status, plan_versions!inner(plans!inner(code, label))')
      .eq('status', 'ACTIVE')
      .order('starts_at', { ascending: false })
      .returns<LigneActive[]>(),
    supabase.from('trials').select('user_id'),
  ]);

  const trialSet = new Set((trials ?? []).map((t) => t.user_id).filter((v): v is string => !!v));
  const maintenant = Date.now();

  // Un membre a au plus deux lignes ACTIVE : sa ligne DEFAUT (permanente) et,
  // le cas échéant, UN abonnement payant/essai/offert (invariant §3.5). On
  // regroupe donc les deux par membre plutôt que de comparer au fil de l'eau.
  const parMembre = new Map<string, { defaut?: LigneActive; autre?: LigneActive }>();
  for (const r of rows ?? []) {
    const entree = parMembre.get(r.user_id) ?? {};
    if (r.type === 'DEFAULT') entree.defaut = r;
    else entree.autre = r;
    parMembre.set(r.user_id, entree);
  }

  const out = new Map<
    string,
    { planCode: string; planLabel: string; type: string; endsAt: string | null; trialConsumed: boolean }
  >();
  for (const [userId, { defaut, autre }] of parMembre) {
    const vivant = autre && (autre.ends_at === null || new Date(autre.ends_at).getTime() > maintenant);
    const retenue = vivant ? autre : defaut;
    if (!retenue) continue;
    out.set(userId, {
      planCode: retenue.plan_versions.plans.code,
      planLabel: retenue.plan_versions.plans.label,
      type: retenue.type,
      endsAt: retenue.ends_at,
      trialConsumed: trialSet.has(userId),
    });
  }
  return out;
}
