// Tableau de bord des abonnements (spec §8.4) — lectures d'ensemble pour
// l'administrateur, jamais mises en cache : c'est un instantané, il doit
// refléter l'instant de la consultation, contrairement à la grille (référentiel)
// ou aux droits d'un membre (mémoïsés par requête).
import { createClient } from '@/lib/supabase/server';

export type PlanShare = { code: string; label: string; count: number; percent: number };

export type TrialInProgress = {
  userId: string;
  email: string;
  fullName: string | null;
  planCode: string;
  endsAt: string;
  daysLeft: number;
};

export type ExpiringSoon = {
  userId: string;
  email: string;
  fullName: string | null;
  planCode: string;
  type: string;
  endsAt: string;
  daysLeft: number;
};

export type TrialConversion = { ended: number; converted: number; ratePercent: number | null };

export type PlanChangeEvent = {
  id: number;
  createdAt: string;
  adminName: string | null;
  action: string;
  targetId: string | null;
  reason: string | null;
};

export type PendingRequestRow = {
  id: number;
  userId: string;
  email: string;
  fullName: string | null;
  planCode: string;
  periodicity: string;
  createdAt: string;
};

export type SubscriptionDashboard = {
  totalMembers: number;
  distribution: PlanShare[];
  trialsInProgress: TrialInProgress[];
  expiringSoon: ExpiringSoon[];
  trialConversion: TrialConversion;
  planChanges: PlanChangeEvent[];
  pendingRequests: PendingRequestRow[];
};

const joursRestants = (endsAt: string, maintenant: number) =>
  Math.max(0, Math.ceil((new Date(endsAt).getTime() - maintenant) / 86_400_000));

export async function getSubscriptionDashboard(): Promise<SubscriptionDashboard> {
  const supabase = await createClient();
  const maintenant = Date.now();
  const dans30Jours = new Date(maintenant + 30 * 86_400_000).toISOString();
  const il30Jours = new Date(maintenant - 30 * 86_400_000).toISOString();

  const [
    { count: totalMembers },
    { data: plans },
    { data: actifs },
    { data: essaisTermines },
    { data: events },
    { data: demandes },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('plans').select('code, label, order_index').order('order_index'),
    // Toutes les lignes ACTIVE : au plus deux par membre (DEFAUT + un
    // abonnement payant/essai/offert, invariant §3.5) — largement lisible
    // d'un coup, même sur un parc de plusieurs milliers de membres.
    supabase
      .from('subscriptions')
      .select(
        'user_id, type, ends_at, status, plan_versions!inner(plans!inner(code, label)), profiles!subscriptions_user_id_fkey(email, full_name)',
      )
      .eq('status', 'ACTIVE'),
    // Essais terminés sur les 30 derniers jours, tous statuts confondus : le
    // cron peut les avoir déjà fait passer à EXPIRE, ce n'est pas le sujet ici.
    supabase
      .from('subscriptions')
      .select('user_id')
      .eq('type', 'TRIAL')
      .gte('ends_at', il30Jours)
      .lte('ends_at', new Date(maintenant).toISOString()),
    supabase
      .from('admin_events')
      .select('id, created_at, action, target_id, reason, profiles!admin_events_admin_id_fkey(full_name, email)')
      .in('action', ['PLAN_MODIFIE', 'PLAN_IDENTITE_MODIFIEE'])
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('subscription_requests')
      .select('id, user_id, periodicity, created_at, plans!inner(code), profiles!subscription_requests_user_id_fkey(email, full_name)')
      .eq('status', 'PENDING')
      .order('created_at', { ascending: true }),
  ]);

  // ── Répartition par plan ────────────────────────────────────
  // Un membre est compté sur son abonnement non-DEFAUT vivant s'il en a un,
  // sinon sur sa ligne DEFAUT — même règle de résolution que
  // `mc_effective_rights`, reproduite ici en lecture seule.
  const parMembre = new Map<string, { code: string; label: string }>();
  for (const r of actifs ?? []) {
    const vivant = r.ends_at === null || new Date(r.ends_at).getTime() > maintenant;
    const existante = parMembre.get(r.user_id);
    if (r.type !== 'DEFAULT' && vivant) {
      parMembre.set(r.user_id, r.plan_versions.plans);
    } else if (!existante) {
      parMembre.set(r.user_id, r.plan_versions.plans);
    }
  }
  const comptes = new Map<string, number>();
  for (const { code } of parMembre.values()) comptes.set(code, (comptes.get(code) ?? 0) + 1);
  const total = totalMembers ?? 0;
  const distribution: PlanShare[] = (plans ?? []).map((p) => {
    const count = comptes.get(p.code) ?? 0;
    return { code: p.code, label: p.label, count, percent: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 };
  });

  // ── Essais en cours / échéances proches ──────────────────────
  const trialsInProgress: TrialInProgress[] = [];
  const expiringSoon: ExpiringSoon[] = [];
  for (const r of actifs ?? []) {
    if (r.type === 'DEFAULT' || !r.ends_at) continue;
    const finMs = new Date(r.ends_at).getTime();
    if (finMs <= maintenant) continue;
    const profil = r.profiles;
    if (r.type === 'TRIAL') {
      trialsInProgress.push({
        userId: r.user_id,
        email: profil?.email ?? '',
        fullName: profil?.full_name ?? null,
        planCode: r.plan_versions.plans.code,
        endsAt: r.ends_at,
        daysLeft: joursRestants(r.ends_at, maintenant),
      });
    }
    if (r.ends_at <= dans30Jours) {
      expiringSoon.push({
        userId: r.user_id,
        email: profil?.email ?? '',
        fullName: profil?.full_name ?? null,
        planCode: r.plan_versions.plans.code,
        type: r.type,
        endsAt: r.ends_at,
        daysLeft: joursRestants(r.ends_at, maintenant),
      });
    }
  }
  trialsInProgress.sort((a, b) => a.daysLeft - b.daysLeft);
  expiringSoon.sort((a, b) => a.daysLeft - b.daysLeft);

  // ── Conversion des essais terminés ────────────────────────────
  // Best-effort assumé : un membre est compté « converti » s'il porte
  // AUJOURD'HUI un abonnement PAID/GIFT actif — pas de trace fine du
  // parcours (V1 n'a pas de facturation), mais un chiffre honnête plutôt
  // qu'un faux luxe de précision.
  const idsEssaisTermines = [...new Set((essaisTermines ?? []).map((e) => e.user_id))];
  let converted = 0;
  if (idsEssaisTermines.length > 0) {
    const { data: convertis } = await supabase
      .from('subscriptions')
      .select('user_id')
      .in('user_id', idsEssaisTermines)
      .eq('status', 'ACTIVE')
      .in('type', ['PAID', 'GIFT']);
    converted = new Set((convertis ?? []).map((c) => c.user_id)).size;
  }
  const ended = idsEssaisTermines.length;
  const trialConversion: TrialConversion = {
    ended,
    converted,
    ratePercent: ended > 0 ? Math.round((converted / ended) * 1000) / 10 : null,
  };

  // ── Historique des modifications de plans ────────────────────
  const planChanges: PlanChangeEvent[] = (events ?? []).map((e) => ({
    id: e.id,
    createdAt: e.created_at,
    adminName: e.profiles?.full_name ?? e.profiles?.email ?? null,
    action: e.action,
    targetId: e.target_id,
    reason: e.reason,
  }));

  // ── Demandes d'abonnement en attente ──────────────────────────
  const pendingRequests: PendingRequestRow[] = (demandes ?? []).map((d) => ({
    id: d.id,
    userId: d.user_id,
    email: d.profiles?.email ?? '',
    fullName: d.profiles?.full_name ?? null,
    planCode: d.plans.code,
    periodicity: d.periodicity,
    createdAt: d.created_at,
  }));

  return { totalMembers: total, distribution, trialsInProgress, expiringSoon, trialConversion, planChanges, pendingRequests };
}
