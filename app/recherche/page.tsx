// Page de résultats de recherche. La saisie (loupe du bandeau haut) est
// recherchée dans le titre des recettes, leurs ingrédients et le nom des
// auteurs. Les résultats reprennent le format « Dernières Créations » ; un
// bandeau publicitaire est intercalé toutes les deux lignes de recettes.
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { RecipeCard } from '@/components/RecipeCard';
import { searchRecipes } from '@/lib/recipes';
import { getFavoriteIds } from '@/lib/favorites';

// Grille en 3 colonnes (lg) → 2 lignes = 6 cartes entre deux publicités.
const CARDS_PER_BLOCK = 6;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function AdBanner() {
  return (
    <div className="ad-banner-placeholder w-full min-h-[160px] flex flex-col md:flex-row items-center justify-between gap-6 rounded-xl overflow-hidden px-8 py-6">
      <div className="flex flex-col gap-1 text-center md:text-left">
        <span className="font-label-md text-on-tertiary-container uppercase tracking-[0.2em] text-[10px] opacity-60">
          Publicité
        </span>
        <h3 className="font-headline-md text-headline-md text-primary">Coffrets &amp; ustensiles signés Maryse</h3>
        <p className="text-secondary italic">Le matériel des chefs, livré chez vous pour réussir vos entremets.</p>
      </div>
      <button className="whitespace-nowrap border border-primary px-8 py-3 font-label-md text-label-md text-primary hover:bg-primary hover:text-on-primary transition-all uppercase tracking-widest">
        Découvrir
      </button>
    </div>
  );
}

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = '' } = await searchParams;
  const query = q.trim();

  const [recipes, favIds] = query
    ? await Promise.all([searchRecipes(query), getFavoriteIds()])
    : [[], new Set<string>()];

  const blocks = chunk(recipes, CARDS_PER_BLOCK);

  return (
    <>
      <Header />

      <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-12">
        <section className="mb-10">
          <h1 className="font-headline-lg text-headline-lg text-primary">Résultats de recherche</h1>
          <div className="h-1 w-12 bg-secondary mt-1" />
          {query ? (
            <p className="mt-4 text-on-surface-variant">
              {recipes.length} résultat{recipes.length > 1 ? 's' : ''} pour «&nbsp;{query}&nbsp;»
            </p>
          ) : (
            <p className="mt-4 text-on-surface-variant italic">
              Saisissez un terme dans la loupe pour rechercher une recette, un ingrédient ou un auteur.
            </p>
          )}
        </section>

        {query && recipes.length === 0 && (
          <p className="text-on-surface-variant italic">
            Aucune recette ne correspond à votre recherche.
          </p>
        )}

        {blocks.map((block, i) => (
          <section key={i} className="mb-12">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {block.map((r) => (
                <RecipeCard key={r.id} recipe={r} isFav={favIds.has(r.id)} />
              ))}
            </div>
            {/* Bandeau de pub après chaque bloc de 2 lignes, sauf le dernier. */}
            {i < blocks.length - 1 && (
              <div className="mt-12">
                <AdBanner />
              </div>
            )}
          </section>
        ))}
      </main>

      <Footer />
      <MobileNav />
    </>
  );
}
