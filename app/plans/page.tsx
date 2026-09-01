import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { PlansPage } from '@/components/plans/PlansPage';
import { getCurrentUser } from '@/lib/auth';
import { getPlanRows, getTrialDays } from '@/lib/data/reference';
import { getCurrentPlan, getGrid, hasConsumedTrial, getPendingRequest } from '@/lib/entitlements-data';

export const metadata: Metadata = { title: 'Nos formules | Je pâtisse !' };

// Page publique : accessible déconnecté (§9.1). La grille passe par le cache
// de référence (`lib/data/reference.ts`), partagé entre tous les visiteurs ;
// l'état du membre connecté (plan courant, essai consommé, demande en
// attente) est lu à part, jamais mis en cache entre visiteurs.
export default async function PlansPublicPage() {
  const user = await getCurrentUser();
  const [grid, planRows, trialDays, currentPlan, trialConsumed, pending] = await Promise.all([
    getGrid(),
    getPlanRows(),
    getTrialDays(),
    user ? getCurrentPlan(user.id) : null,
    user ? hasConsumedTrial(user.id) : false,
    user ? getPendingRequest(user.id) : null,
  ]);
  const planIds = Object.fromEntries(planRows.map((p) => [p.code, p.id]));

  return (
    <>
      <Header />
      <main className="mx-auto mb-24 max-w-[1200px] px-margin-mobile py-12 md:px-margin-desktop">
        <PlansPage
          grid={grid}
          planIds={planIds}
          connecte={!!user}
          currentPlanCode={currentPlan?.code ?? null}
          essaiActif={currentPlan?.type === 'TRIAL'}
          trialConsumed={trialConsumed}
          trialDays={trialDays}
          pending={pending}
        />
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
