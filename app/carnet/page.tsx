import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getUserRecipes } from '@/lib/recipes';
import { getFavorites } from '@/lib/profile';
import { getFavoriteIds } from '@/lib/favorites';
import { countImportsEnAttente } from '@/lib/imports';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { CarnetContent } from '@/components/carnet/CarnetContent';

export const metadata: Metadata = { title: 'Mon carnet | Je pâtisse !' };
// Jamais de cache (edge/CDN inclus) : le carnet doit toujours refléter les
// dernières recettes et favoris de l'utilisateur, sans dépendre du seul appel
// implicite à cookies() pour désactiver la mise en cache.
export const dynamic = 'force-dynamic';

export default async function CarnetPage() {
  // `requireUser` reste ici le temps que l'écran d'invitation existe : la
  // décision arrêtée est qu'un visiteur voie ce qu'il y a derrière plutôt
  // qu'un renvoi sec vers la connexion. Le jour où cet écran est livré, cette
  // garde tombe **et** `/carnet` sort de PROTECTED_PREFIXES (lib/supabase/
  // middleware.ts) — les deux vont ensemble, l'une sans l'autre ne change rien.
  const user = await requireUser('/carnet');

  const [recipes, favorites, favIds, importsEnAttente] = await Promise.all([
    getUserRecipes(user.id),
    getFavorites(user.id),
    getFavoriteIds(),
    countImportsEnAttente(user.id),
  ]);

  return (
    <>
      <Header current="carnet" />
      <main className="mx-auto mb-24 max-w-[1200px] px-margin-mobile md:px-margin-desktop">
        <div className="pb-2 pt-12">
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">Mon carnet</p>
          <h1 className="font-headline-lg text-[30px] leading-tight text-primary md:text-[42px]">
            Tout ce qui est une recette à moi
          </h1>
        </div>
        <CarnetContent
          recipes={recipes}
          favorites={favorites}
          favIds={[...favIds]}
          importsEnAttente={importsEnAttente}
        />
      </main>
      <Footer />
      <MobileNav current="carnet" />
    </>
  );
}
