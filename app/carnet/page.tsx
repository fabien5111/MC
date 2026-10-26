import type { Metadata } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { getCarnetData, applyCarnetFilters, compteursStatut } from '@/lib/carnet';
import { getAllergensWithPicto } from '@/lib/recipes';
import { getFavoriteIds } from '@/lib/favorites';
import { countImportsEnAttente } from '@/lib/imports';
import { getBookSharesGiven } from '@/lib/shares-data';
import { cheminPartageCarnet } from '@/lib/book-link';
import { getRecipeDefaultPhoto } from '@/lib/site';
import Link from 'next/link';
import { canAccess, getLimit } from '@/lib/entitlements';
import { getItemsCap, getItemsDeListe } from '@/lib/carnet-cap-data';
import { getIdsListe, getListesDuMembre } from '@/lib/recipe-lists-data';
import { DROIT_LISTES_PERSO, LISTE_KIND_PERSO } from '@/lib/recipe-lists';
import { getEntitlements } from '@/lib/entitlements-data';
import { parseCarnetParams, carnetParamsToQueryString, type Scope } from '@/lib/carnet-params';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { CarnetProvider } from '@/components/carnet/CarnetProvider';
import { CarnetToolbar } from '@/components/carnet/CarnetToolbar';
import { CarnetContent } from '@/components/carnet/CarnetContent';
import { ImportsEnAttente } from '@/components/carnet/ImportsEnAttente';
import { ShareBookButton } from '@/components/carnet/ShareBookButton';
import { InvitationScreen } from '@/components/invitation/InvitationScreen';
import { CreateMenuButton } from '@/components/carnet/CreateMenuButton';

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
  cap: 'Votre liste CAP est vide. Le bouton « Listes » d’une fiche recette l’y ajoute.',
  listes: 'Cette liste est vide. Le bouton « Listes » d’une fiche recette y range une recette.',
  proj: 'Aucun projet en cours. Un projet est un dessert composé de plusieurs recettes de base, mis au point essai après essai.',
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

  const parsed = parseCarnetParams(await searchParams);
  const [readOnly, { items, counts, statusCounts, sharedStatusCounts }, favIds, importsEnAttente, bookSharesGiven, defaultPhoto, allergenRefs, droits, toutesListes] =
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
      // JEP-130 : le bouton « Projet » se grise sans le droit plutôt que de
      // laisser découvrir le refus après le clic. Lecture déjà mémoïsée par
      // requête (`cache()`), sans coût ajouté pour les pages qui l'appellent
      // déjà.
      getEntitlements(user.id),
      // Listes de recettes (JEP-376) : une lecture légère (noms et compteurs),
      // qui sert la pastille « Mes listes » sur toutes les portées.
      getListesDuMembre(user.id),
    ]);
  // Rubrique « Carnet CAP » (JEP-6) : droit `carnet_cap` (plan Pro). Sans lui,
  // `?scope=cap` retombe sur « Tout » et la pastille n'existe pas.
  const peutCap = canAccess(droits, 'carnet_cap');
  // « Mes listes » (JEP-376) : droit `listes_recettes`. Sans lui, la portée
  // reste ouverte tant que le membre a des listes (rétrogradation : on consulte
  // et on fait le ménage), verrouillée sinon.
  const peutListes = canAccess(droits, DROIT_LISTES_PERSO);
  const listesPerso = toutesListes.filter((l) => l.kind === LISTE_KIND_PERSO);
  const listesOuvertes = peutListes || listesPerso.length > 0;
  const params =
    (!peutCap && parsed.scope === 'cap') || (!listesOuvertes && parsed.scope === 'listes')
      ? { ...parsed, scope: 'all' as const, liste: '' }
      : parsed;
  // Identifiant inconnu (liste supprimée, lien périmé) : la première liste.
  const listeChoisie =
    params.scope === 'listes' ? (listesPerso.find((l) => l.id === params.liste) ?? listesPerso[0] ?? null) : null;
  const deListe = listeChoisie ? await getItemsDeListe(await getIdsListe(user.id, listeChoisie.id), items, user.id) : null;
  // Une lecture de plus, réservée à ceux qui ont la rubrique : elle sert au
  // compteur de la pastille autant qu'à la grille.
  const cap = peutCap ? await getItemsCap(user.id, items) : null;
  const source =
    params.scope === 'cap' && cap ? cap.items : params.scope === 'listes' ? (deListe?.items ?? []) : items;
  const filtered = applyCarnetFilters(source, params);
  // Barre de statut sur toutes les portées (JEP-6) : « Tout » et « Mes
  // recettes » gardent leurs compteurs d'origine, « Partagées » les siens, les
  // autres comptent leurs propres recettes (avant filtre de statut et de
  // recherche).
  const statusCountsAffiches =
    params.scope === 'shared'
      ? sharedStatusCounts
      : params.scope === 'fav' || params.scope === 'sub' || params.scope === 'proj' || params.scope === 'cap' || params.scope === 'listes'
        ? compteursStatut(applyCarnetFilters(source, { ...params, statut: 'all', q: '' }))
        : statusCounts;
  const countsAffiches = { ...counts, ...(cap ? { cap: cap.items.length } : {}), listes: listesPerso.length };
  const verrouilles = [...(peutCap ? [] : ['cap' as const]), ...(listesOuvertes ? [] : ['listes' as const])];
  const lienImpression = `/carnet/cap?choisir=1&liste=cap${params.q ? `&q=${encodeURIComponent(params.q)}` : ''}`;
  const lienPartage = cheminPartageCarnet(user.id);

  return (
    <>
      <Header current="carnet" />
      <main className="mx-auto mb-24 max-w-[1200px] px-margin-mobile rail:px-margin-desktop">
        <div className="flex flex-wrap items-end justify-between gap-5 pb-9 pt-12">
          <h1 className="font-headline-lg text-[26px] font-bold leading-tight text-primary rail:text-[38px]">
            Mon carnet de recettes
          </h1>
          {/* Masqué en session « en tant que » lecture seule. Un seul menu
              « Créer » (recette, import, projet) : cf. CreateMenuButton. */}
          {!readOnly && (
            <div className="flex w-full items-center justify-center gap-3 rail:w-auto rail:justify-start">
              {/* Masqué ici sous 1024 px : le partage rejoint la feuille de
                  réglages de CarnetToolbar (même instance de composant
                  dupliquée, cf. CarnetFiltersSheet.tsx). */}
              <div className="hidden lg:flex">
                <ShareBookButton ownerId={user.id} given={bookSharesGiven} lienPartage={lienPartage} />
              </div>
              <CreateMenuButton peutProjet={canAccess(droits, 'mode_projet')} />
            </div>
          )}
        </div>
        <CarnetProvider>
          <CarnetToolbar
            params={params}
            counts={countsAffiches}
            verrouilles={verrouilles}
            listes={{
              liste: listesPerso,
              selectionId: listeChoisie?.id ?? null,
              peut: peutListes,
              max: getLimit(droits, DROIT_LISTES_PERSO),
            }}
            statusCounts={statusCountsAffiches}
            shareButton={!readOnly ? <ShareBookButton ownerId={user.id} given={bookSharesGiven} lienPartage={lienPartage} /> : null}
          />
          {params.scope === 'cap' && cap && (
            // Ordre voulu (JEP-6) : imports en attente d'abord, puis l'information
            // de la rubrique, sur toute la largeur. Sur cette portée, la grille ne
            // remontre pas le bandeau d'imports (`importsEnAttente={0}` plus bas).
            <div className="mt-6 flex flex-col gap-4">
              <ImportsEnAttente nombre={importsEnAttente} />
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-lg border border-outline-variant bg-surface-container-low px-5 py-4">
                <div className="min-w-0 flex-1 basis-[28rem] text-[14px] text-on-surface">
                  <p className="font-semibold text-primary">Ma liste CAP</p>
                  <p className="mt-1 text-on-surface-variant">
                    Les recettes que vous y avez rangées avec le bouton « Listes » d’une fiche recette — les vôtres comme celles des
                    autres. Imprimées pour le CAP, seuls leurs ingrédients et quantités figurent sur la feuille.
                  </p>
                  {cap.indisponibles > 0 && (
                    <p className="mt-1 text-on-surface-variant">
                      {cap.indisponibles === 1
                        ? '1 recette de la liste n’est plus accessible (supprimée, dépubliée ou devenue privée).'
                        : `${cap.indisponibles} recettes de la liste ne sont plus accessibles (supprimées, dépubliées ou devenues privées).`}
                    </p>
                  )}
                </div>
                {filtered.length > 0 && (
                  <Link
                    href={lienImpression}
                    prefetch={false}
                    className="flex shrink-0 items-center gap-1.5 rounded-pill bg-primary px-5 py-2.5 text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden>
                      print
                    </span>
                    Imprimer ({filtered.length})
                  </Link>
                )}
              </div>
            </div>
          )}
          {params.scope === 'listes' && (deListe?.indisponibles ?? 0) > 0 && (
            <p className="mt-4 text-[13px] text-on-surface-variant">
              {deListe!.indisponibles === 1
                ? '1 recette de cette liste n’est plus accessible (supprimée, dépubliée ou devenue privée).'
                : `${deListe!.indisponibles} recettes de cette liste ne sont plus accessibles (supprimées, dépubliées ou devenues privées).`}
            </p>
          )}
          <CarnetContent
            key={carnetParamsToQueryString(params)}
            items={filtered}
            favIds={[...favIds]}
            importsEnAttente={params.scope === 'cap' && cap ? 0 : importsEnAttente}
            allergenRefs={allergenRefs}
            emptyMessage={
              params.q || params.statut !== 'all'
                ? 'Aucune recette ne correspond à ce filtre.'
                : params.scope === 'listes' && !listeChoisie
                  ? 'Vous n’avez pas encore de liste. Créez-en une depuis « Mes listes » → « Nouvelle liste », ou depuis le bouton « Listes » d’une recette.'
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
