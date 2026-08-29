import type { Metadata } from 'next';
import Link from 'next/link';
import { requireFullAdmin } from '@/lib/auth';
import { getSubscriptionDashboard } from '@/lib/subscriptions-dashboard';
import { SubscriptionDashboard } from '@/components/admin/SubscriptionDashboard';

export const metadata: Metadata = { title: 'Tableau de bord des abonnements | Admin — Je pâtisse !' };

// Instantané, jamais mis en cache (cf. lib/subscriptions-dashboard.ts) : admin
// complet uniquement, comme l'écran de paramétrage des plans dont il est le
// pendant « suivi » plutôt que « configuration ».
export default async function AdminAbonnementsTableauDeBordPage() {
  await requireFullAdmin();
  const dashboard = await getSubscriptionDashboard();
  return (
    <div className="p-6 lg:p-10">
      <Link href="/admin/abonnements" className="mb-6 inline-flex items-center gap-2 font-label-md text-[13px] text-on-surface-variant hover:text-primary">
        <span className="material-symbols-outlined text-base">arrow_back</span> Grille des plans
      </Link>
      <SubscriptionDashboard data={dashboard} />
    </div>
  );
}
