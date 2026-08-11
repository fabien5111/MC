import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { getPlanning, getShoppingLists } from '@/lib/profile';
import { getActiveExecutions, getActiveExecutionStepsForUser } from '@/lib/executions';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { CuisineContent } from '@/components/cuisine/CuisineContent';
import { InvitationScreen } from '@/components/invitation/InvitationScreen';

export const metadata: Metadata = { title: 'En cuisine | Je pâtisse !' };
export const dynamic = 'force-dynamic';

export default async function EnCuisinePage() {
  const user = await getCurrentUser();

  // Visiteur : ni renvoi sec vers la connexion, ni cadenas — on montre ce
  // qu'il y a derrière (README « Écran 4 — Invitation »). `/en-cuisine` est
  // donc hors de PROTECTED_PREFIXES (lib/supabase/middleware.ts) : les deux
  // vont ensemble, l'un sans l'autre ne change rien.
  if (!user) {
    return (
      <>
        <Header current="cuisine" />
        <InvitationScreen destination="cuisine" />
        <Footer />
        <MobileNav current="cuisine" />
      </>
    );
  }

  const [planning, archivedPlanning, activeSessions, runningExecSteps, shoppingLists] = await Promise.all([
    getPlanning(user.id),
    getPlanning(user.id, 'archive'),
    getActiveExecutions(user.id),
    getActiveExecutionStepsForUser(user.id),
    getShoppingLists(user.id),
  ]);

  return (
    <>
      <Header current="cuisine" />
      <main className="mx-auto mb-24 max-w-[1200px] px-margin-mobile md:px-margin-desktop">
        <div className="pb-2 pt-12">
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">En cuisine</p>
          {/* Une seule ligne, quelle que soit la largeur : coupé en deux, le
              titre perd son rythme. 26 px sur mobile, 38 px au bureau. */}
          <h1 className="whitespace-nowrap font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[38px]">
            À vos maryses, prêt(e)s&nbsp;? pâtissez&nbsp;!
          </h1>
        </div>
        <CuisineContent
          planning={planning}
          archivedPlanning={archivedPlanning}
          activeSessions={activeSessions}
          runningExecSteps={runningExecSteps}
          shoppingLists={shoppingLists}
        />
      </main>
      <Footer />
      <MobileNav current="cuisine" />
    </>
  );
}
