import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getCarnetData, applyCarnetFilters } from '@/lib/carnet';
import { getFavoriteIds } from '@/lib/favorites';
import { countImportsEnAttente } from '@/lib/imports';
import { parseCarnetParams, type Scope } from '@/lib/carnet-params';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { CarnetToolbar } from '@/components/carnet/CarnetToolbar';
import { CarnetContent } from '@/components/carnet/CarnetContent';

export const metadata: Metadata = { title: 'Mon carnet | Je pâtisse !' };
// Jamais de cache (edge/CDN inclus) : le carnet doit toujours refléter les
// dernières recettes, favoris et abonnements de l'utilisateur.
export const dynamic = 'force-dynamic';

const EMPTY_MESSAGES: Record<Scope, string> = {
  all: 'Votre carnet est vide. Créez votre première recette ou importez-en une.',
  mine: "Aucune création pour l'instant. Ouvrez « Créer » pour commencer.",
  import: 'Aucune recette importée pour le moment.',
  fav: 'Aucun favori. Le cœur sur une fiche recette l’ajoute ici.',
  sub: "Aucune publication récente chez les pâtissiers que vous suivez.",
};

type SearchParams = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function CarnetPage({ searchParams }: SearchParams) {
  // `requireUser` reste ici le temps que l'écran d'invitation existe : la
  // décision arrêtée est qu'un visiteur voie ce qu'il y a derrière plutôt
  // qu'un renvoi sec vers la connexion. Le jour où cet écran existe, cette
  // garde tombe **et** `/carnet` sort de PROTECTED_PREFIXES (lib/supabase/
  // middleware.ts) — les deux vont ensemble.
  const user = await requireUser('/carnet');
  const params = parseCarnetParams(await searchParams);

  const [{ items, counts, statusCounts }, favIds, importsEnAttente] = await Promise.all([
    getCarnetData(user.id),
    getFavoriteIds(),
    countImportsEnAttente(user.id),
  ]);
  const filtered = applyCarnetFilters(items, params);

  return (
    <>
      <Header current="carnet" />
      <main className="mx-auto mb-24 max-w-[1200px] px-margin-mobile md:px-margin-desktop">
        <div className="pb-9 pt-12">
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">Mon carnet</p>
          <h1 className="font-headline-lg text-[30px] leading-tight text-primary md:text-[42px]">
            Tout ce qui est une recette à moi
          </h1>
        </div>
        <CarnetToolbar params={params} counts={counts} statusCounts={statusCounts} />
        <CarnetContent
          items={filtered}
          favIds={[...favIds]}
          importsEnAttente={importsEnAttente}
          emptyMessage={
            params.q || params.statut !== 'all'
              ? 'Aucune recette ne correspond à ce filtre.'
              : EMPTY_MESSAGES[params.scope]
          }
        />
      </main>
      <Footer />
      <MobileNav current="carnet" />
    </>
  );
}
