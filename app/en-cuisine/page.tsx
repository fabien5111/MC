import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { getBatches, getActiveBatches, getShoppingLists } from '@/lib/profile';
import { canAccess } from '@/lib/entitlements';
import { getEntitlements } from '@/lib/entitlements-data';
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

  const [planning, batchesTerminees, activeBatches, shoppingLists, entitlements] = await Promise.all([
    getBatches(user.id, 'actives'),
    getBatches(user.id, 'terminees'),
    getActiveBatches(user.id),
    getShoppingLists(user.id),
    getEntitlements(user.id),
  ]);
  // Droits d'abonnement (§4) : calculés une fois ici, jamais recalculés plus
  // bas dans l'arbre de composants.
  const droits = {
    fusionListes: canAccess(entitlements, 'fusion_listes_courses'),
    reordonnancement: canAccess(entitlements, 'reordonnancement_etapes'),
  };

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
          batchesTerminees={batchesTerminees}
          activeBatches={activeBatches}
          shoppingLists={shoppingLists}
          droits={droits}
        />
      </main>
      <Footer />
      <MobileNav current="cuisine" />
    </>
  );
}
