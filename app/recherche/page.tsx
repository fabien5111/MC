// Page de résultats — recherche avancée.
//
// Deux principes structurants :
//  1. Tous les critères vivent dans l'URL (cf. lib/search-params.ts) :
//     rechargement, partage de lien et retour arrière restituent la même
//     recherche. Les facettes réécrivent l'URL, ce Server Component re-rend.
//  2. Une seule grille, rendue ici : `RecipeCard` reste inchangé, les pictos
//     d'allergènes sont résolus côté serveur et le bandeau publicitaire est
//     toujours intercalé toutes les deux lignes de recettes.
//
// Compatibilité : le paramètre `?category=` des catégories de l'accueil est
// accepté comme alias de `cat` et fusionné avec lui — les liens existants
// continuent de fonctionner, sans redirection.
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { RecipeCard } from '@/components/RecipeCard';
import { AuthorCard } from '@/components/search/AuthorCard';
import { SearchProvider } from '@/components/search/SearchProvider';
import { SearchHeaderBar } from '@/components/search/SearchHeaderBar';
import { SearchFiltersPanel } from '@/components/search/SearchFiltersPanel';
import { SearchSummary } from '@/components/search/SearchSummary';
import { SearchResults } from '@/components/search/SearchResults';
import { SearchEmptyState } from '@/components/search/SearchEmptyState';
import { LoadMore } from '@/components/search/LoadMore';
import { PartnerSlot } from '@/components/PartnerSlot';
import type { FacetRefs } from '@/components/search/SearchFacets';
import { getActiveAds } from '@/lib/ads';
import { getFavoriteIds } from '@/lib/favorites';
import { getAllergensWithPicto } from '@/lib/recipes';
import { getCurrentUser } from '@/lib/auth';
import { relaxationSuggestions, searchAdvanced, type Relaxation } from '@/lib/search';
import { countActiveCriteria, hasAnySearch, parseSearchCriteria } from '@/lib/search-params';
import { getDifficulties, getRecipeTypes, getTags } from '@/lib/taxonomy';

// Grille en 3 colonnes (lg) → 2 lignes = 6 cartes entre deux publicités.
const CARDS_PER_BLOCK = 6;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const criteria = parseSearchCriteria(sp);
  // `?panel=1` — arrivée depuis « Critères avancés » de l'en-tête : le tiroir
  // s'ouvre d'emblée sur mobile (sans effet au-dessus de 1024 px, où la
  // colonne est déjà là).
  const panelOpen = (Array.isArray(sp.panel) ? sp.panel[0] : sp.panel) === '1';

  const [result, favIds, types, difficulties, tags, allergens, user, ads] = await Promise.all([
    searchAdvanced(criteria),
    getFavoriteIds(),
    getRecipeTypes(),
    getDifficulties(),
    getTags(),
    getAllergensWithPicto(),
    getCurrentUser(),
    getActiveAds(['search_list']),
  ]);

  const refs: FacetRefs = {
    types,
    difficulties: difficulties.map((d) => ({ id: d.id, name: d.name, level: d.level })),
    tags,
    allergens: allergens.map((a) => ({ id: a.id, name: a.name })),
  };

  // Recomptes d'assouplissement : uniquement quand le total est nul, et
  // seulement si les recettes font partie de la portée choisie (les
  // suggestions ne raisonnent que sur des facettes de recette, aucune n'a de
  // sens pour un résultat pâtissier).
  const relaxations: Relaxation[] =
    criteria.includeRecipes && result.total === 0 && hasAnySearch(criteria)
      ? await relaxationSuggestions(criteria)
      : [];

  // Titre : une catégorie seule (lien de l'accueil) garde son intitulé
  // d'origine, pour ne pas dérouter qui arrive de la page d'accueil.
  const soleCategory =
    !criteria.q && criteria.cat.length === 1 && countActiveCriteria(criteria) === 1
      ? (tags.find((t) => t.slug === criteria.cat[0])?.name ?? criteria.cat[0])
      : null;

  const blocks = chunk(result.recipes, CARDS_PER_BLOCK);

  return (
    <>
      <Header current="explorer" />

      <SearchProvider criteria={criteria} initialPanelOpen={panelOpen}>
        <main className="max-w-[1400px] mx-auto pb-24">
          <section className="px-margin-mobile md:px-margin-desktop pt-12 pb-6">
            <h1 className="font-headline-lg text-headline-lg text-primary">
              {soleCategory ? `Catégorie : ${soleCategory}` : 'Résultats de recherche'}
            </h1>
            <div className="h-1 w-12 bg-secondary mt-1" />
          </section>

          <SearchHeaderBar />

          <div className="flex flex-col lg:flex-row">
            <SearchFiltersPanel refs={refs} />

            <div className="flex-1 min-w-0 px-margin-mobile md:px-margin-desktop py-8">
              <SearchSummary total={result.total} authorTotal={result.authorTotal} refs={refs} />

              {criteria.includeRecipes && (
                <>
                  <SearchResults>
                    {result.error ? (
                      <div className="max-w-[560px] mx-auto py-12 text-center">
                        <span className="material-symbols-outlined text-[56px] text-outline-variant mb-5 block">
                          error_outline
                        </span>
                        <h2 className="font-headline-md text-[22px] text-primary mb-2.5">
                          La recherche n&apos;a pas pu aboutir
                        </h2>
                        <p className="text-[13.5px] text-on-surface-variant leading-relaxed">
                          Ce n&apos;est pas une recherche sans résultat : la requête elle-même a échoué.
                          Réessayez dans un instant.
                        </p>
                        {process.env.NODE_ENV !== 'production' && (
                          <p className="mt-5 text-[12px] text-error font-mono break-words">{result.error}</p>
                        )}
                      </div>
                    ) : result.total === 0 ? (
                      hasAnySearch(criteria) ? (
                        <SearchEmptyState criteria={criteria} relaxations={relaxations} />
                      ) : (
                        <p className="text-on-surface-variant italic">
                          Aucune recette publiée pour le moment.
                        </p>
                      )
                    ) : (
                      blocks.map((block, i) => (
                        <section key={i} className="mb-12">
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                            {block.map((r) => (
                              <RecipeCard
                                key={r.id}
                                recipe={r}
                                isFav={favIds.has(r.id)}
                                isOwner={!!user && r.author_id === user.id}
                                showPlan={!!user}
                              />
                            ))}
                          </div>
                          {/* Bandeau de pub après chaque bloc de 2 lignes, sauf le
                              dernier. `index` fait défiler les campagnes en cours
                              d'un bandeau à l'autre plutôt que de répéter la même. */}
                          {i < blocks.length - 1 && (
                            <PartnerSlot slot="search_list" ads={ads} index={i} className="mt-12" />
                          )}
                        </section>
                      ))
                    )}
                  </SearchResults>

                  <LoadMore shown={result.recipes.length} total={result.total} />
                </>
              )}

              {/* Pâtissiers — séparés des recettes, sous la grille. Masqués
                  sur la portée Recettes seule et sur la page vierge (pas de
                  recherche formulée) tant qu'il n'y a rien à annoncer. */}
              {criteria.includeAuthors && (result.authors.length > 0 || hasAnySearch(criteria)) && (
                <section className="mt-12">
                  <h2 className="font-headline-md text-[19px] text-primary mb-5">
                    Pâtissiers
                    {result.authorTotal > 0 && (
                      <span className="ml-2 text-[14px] font-normal text-on-surface-variant">
                        ({result.authorTotal})
                      </span>
                    )}
                  </h2>
                  {result.authors.length > 0 ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                      {result.authors.map((a) => (
                        <AuthorCard key={a.id} author={a} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-[13.5px] italic text-on-surface-variant">
                      Aucun pâtissier ne correspond à cette recherche.
                    </p>
                  )}
                </section>
              )}
            </div>
          </div>
        </main>
      </SearchProvider>

      <Footer />
      <MobileNav current="explorer" />
    </>
  );
}
