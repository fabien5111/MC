import type { Metadata } from 'next';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { getCarnetData, applyCarnetFilters } from '@/lib/carnet';
import { getAllergensWithPicto } from '@/lib/recipes';
import { getFavoriteIds } from '@/lib/favorites';
import { countImportsEnAttente } from '@/lib/imports';
import { getBookSharesGiven } from '@/lib/shares-data';
import { getRecipeDefaultPhoto } from '@/lib/site';
import { parseCarnetParams, carnetParamsToQueryString, type Scope } from '@/lib/carnet-params';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { CarnetProvider } from '@/components/carnet/CarnetProvider';
import { CarnetToolbar } from '@/components/carnet/CarnetToolbar';
import { CarnetContent } from '@/components/carnet/CarnetContent';
import { ShareBookButton } from '@/components/carnet/ShareBookButton';
import { InvitationScreen } from '@/components/invitation/InvitationScreen';

export const metadata: Metadata = { title: 'Mon carnet | Je pâtisse !' };
// Jamais de cache (edge/CDN inclus) : le carnet doit toujours refléter les
// dernières recettes, favoris et abonnements de l'utilisateur.
export const dynamic = 'force-dynamic';

const EMPTY_MESSAGES: Record<Scope, string> = {
  all: 'Votre carnet est vide. Créez votre première recette ou importez-en une.',
  mine: 'Aucune recette pour l’instant. Créez-en une ou importez-en une.',
  fav: 'Aucun favori. Le cœur sur une fiche recette l’ajoute ici.',
  sub: "Aucune publication récente chez les pâtissiers que vous suivez.",
  shared: 'Personne n’a encore partagé son carnet ou une recette avec vous.',
};

type SearchParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CarnetPage({ searchParams }: SearchParams) {
  const user = await getCurrentUser();

  // Visiteur : ni renvoi sec vers la connexion, ni cadenas — on montre ce
  // qu'il y a derrière (README « Écran 4 — Invitation »). `/carnet` est donc
  // hors de PROTECTED_PREFIXES (lib/supabase/middleware.ts) : les deux vont
  // ensemble, l'un sans l'autre ne change rien.
  if (!user) {
    return (
      <>
        <Header current="carnet" />
        <InvitationScreen destination="carnet" />
        <Footer />
        <MobileNav current="carnet" />
      </>
    );
  }

  const params = parseCarnetParams(await searchParams);
  const [readOnly, { items, counts, statusCounts, sharedStatusCounts }, favIds, importsEnAttente, bookSharesGiven, defaultPhoto, allergenRefs] =
    await Promise.all([
      isReadOnlySession(),
      getCarnetData(user.id),
      getFavoriteIds(),
      countImportsEnAttente(user.id),
      getBookSharesGiven(user.id),
      getRecipeDefaultPhoto(),
      // Table de référence chargée une seule fois pour toute la grille — les
      // cartes ne portent que le nom de leurs allergènes (cf. lib/recipes.ts
      // withAllergenNames), le picto est résolu au rendu (CarnetContent).
      getAllergensWithPicto(),
    ]);
  const filtered = applyCarnetFilters(items, params);

  return (
    <>
      <Header current="carnet" />
      <main className="mx-auto mb-24 max-w-[1200px] px-margin-mobile md:px-margin-desktop">
        <div className="flex flex-wrap items-end justify-between gap-5 pb-9 pt-12">
          <h1 className="font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[38px]">
            Mon carnet de recettes
          </h1>
          {/* Masqués en session « en tant que » lecture seule — même garde que
              l'ancien bouton Créer de l'en-tête, dont c'est maintenant la
              seule maison (README « en-tête » : « les entrées de création
              sont masquées »). Importer avant Créer : l'import est le geste
              d'entrée dominant pour un carnet neuf. */}
          {!readOnly && (
            <div className="flex items-center gap-3">
              <ShareBookButton ownerId={user.id} given={bookSharesGiven} />
              <Link
                href="/importer"
                prefetch={false}
                className="flex items-center gap-1.5 rounded-pill border border-outline-variant px-4 py-2.5 text-[13px] font-semibold text-primary transition-colors hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-[18px]">upload_file</span> Importer
              </Link>
              <Link
                href="/creer"
                prefetch={false}
                className="flex items-center gap-1.5 rounded-pill bg-primary px-4 py-2.5 text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95"
              >
                <span className="material-symbols-outlined text-[18px]">add</span> Créer
              </Link>
            </div>
          )}
        </div>
        <CarnetProvider>
          <CarnetToolbar
            params={params}
            counts={counts}
            statusCounts={params.scope === 'shared' ? sharedStatusCounts : statusCounts}
          />
          <CarnetContent
            key={carnetParamsToQueryString(params)}
            items={filtered}
            favIds={[...favIds]}
            importsEnAttente={importsEnAttente}
            allergenRefs={allergenRefs}
            emptyMessage={
              params.q || params.statut !== 'all'
                ? 'Aucune recette ne correspond à ce filtre.'
                : EMPTY_MESSAGES[params.scope]
            }
            defaultPhoto={defaultPhoto}
          />
        </CarnetProvider>
      </main>
      <Footer />
      <MobileNav current="carnet" />
    </>
  );
}
