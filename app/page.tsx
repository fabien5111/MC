import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { HomeBanner } from '@/components/HomeBanner';
import { HomeRecipeGrid } from '@/components/HomeRecipeGrid';
import { HomeSearch } from '@/components/HomeSearch';
import { FavoriteHeart } from '@/components/FavoriteHeart';
import { MaryseIcon } from '@/components/MaryseIcon';
import { getRecipes, withAllergenPictos } from '@/lib/recipes';
import { getActiveFeaturedRecipe } from '@/lib/featured';
import { cardAllergenNames, effectiveTimes, cardHeroSrc } from '@/lib/recipe-view';
import { AllergenPictos } from '@/components/recipe/AllergenPictos';
import { PlanBadgeIcon } from '@/components/recipe/PlanBadgeIcon';
import { getFavoriteIds } from '@/lib/favorites';
import { getCurrentUser } from '@/lib/auth';
import { getSiteSettings } from '@/lib/site';
import { getHomeCategories } from '@/lib/taxonomy';
import { formatTime } from '@/lib/format';

const BANNER_FALLBACK =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAWeNG5dnk3GpfRdI3BMu2wvpe1eUt5K5j4DZt53I7Jx0zMq45AVhzce1OfSlpt6j83PTaXbYLAjsZFNWJ4mU_1itgi3GleQq4xpOS-EKQhutvgXT9r42BDT5K4vLrYdOOLSCiiIRyV51i1DZaYyUsOT8m223Rm6Vmf_ELF7Sr1Xi3lvPhXPZ3Pad5MeF3WwazJ9YK4k7RwDKt_CTEUaAvQWvzENmSue9skiUg3GxO-nPbBSeFD-AA--vZMdoJ07NYFqWe5S04cERU';

// Catégories affichées si aucune n'est encore définie dans le référentiel des
// tags (case « Afficher sur l'accueil » + picto). Sert de repli tant que
// l'admin n'a pas promu de tags en catégories, pour ne jamais laisser la
// section vide.
const FALLBACK_CATEGORIES = [
  { icon: 'cake', label: 'Gâteaux' },
  { icon: 'icecream', label: 'Entremets' },
  { icon: 'bakery_dining', label: 'Tartes' },
  { icon: 'cookie', label: 'Biscuits' },
  { icon: 'coffee', label: 'Petit-Déjeuner' },
  { icon: 'candle', label: 'Confiseries' },
  { icon: 'eco', label: 'Végétalien' },
  { icon: 'potted_plant', label: 'Sans Gluten' },
  { icon: 'kitchen', label: 'Frigo' },
  { icon: 'local_fire_department', label: 'Saisonniers' },
  { icon: 'restaurant', label: 'Bases' },
  { icon: 'bolt', label: 'Express' },
];

export default async function HomePage() {
  const [recipes, activeFeatured, favIds, banners, homeCategories, user] = await Promise.all([
    getRecipes({ limit: 6 }),
    getActiveFeaturedRecipe(),
    getFavoriteIds(),
    getSiteSettings(['banner_home_web', 'banner_home_tablette', 'banner_home_mobile']),
    getHomeCategories(),
    getCurrentUser(),
  ]);
  // Repli sur la recette la plus récente si aucune plage de mise en avant ne
  // couvre aujourd'hui (ou si la recette programmée n'est plus publique) —
  // la section ne disparaît jamais de l'accueil.
  const featured = activeFeatured ?? recipes[0] ?? null;
  const featuredTimes = featured ? effectiveTimes(featured) : null;
  const featuredHeroSrc = featured ? cardHeroSrc(featured) : null;
  const featuredIsOwner = !!featured && !!user && featured.author_id === user.id;
  // Planifier se décale d'un cran (right-[4.25rem] → right-28) quand Éditer
  // s'intercale entre Favori (right-6) et lui — même principe que sur les
  // cartes de la grille (RecipeCardLayout).
  const featuredPlanPos = featuredIsOwner ? 'right-28' : 'right-[4.25rem]';
  const categories: { icon: string | null; picto: string | null; label: string; slug: string | null }[] =
    homeCategories.length
      ? homeCategories.map((c) => ({ icon: null, picto: c.category_picto, label: c.name, slug: c.slug }))
      : FALLBACK_CATEGORIES.map((c) => ({ icon: c.icon, picto: null, label: c.label, slug: null }));

  return (
    <>
      <Header current="/" />

      <HomeBanner
        web={banners.banner_home_web}
        tablette={banners.banner_home_tablette}
        mobile={banners.banner_home_mobile}
        fallback={BANNER_FALLBACK}
      />

      <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-12">
        {/* Publicité */}
        <section className="mb-16">
          <div className="ad-banner-placeholder w-full h-[120px] flex items-center justify-center rounded-xl overflow-hidden">
            <div className="text-center">
              <span className="block font-label-md text-on-tertiary-container uppercase tracking-[0.2em] mb-1 opacity-60">
                Partenaire Gastronomique
              </span>
              <p className="text-secondary italic">
                Découvrez la nouvelle collection d&apos;ustensiles Maryse
              </p>
            </div>
          </div>
        </section>

        {/* Recette de la semaine */}
        {featured && (
          <section className="mb-20">
            {/* Sur mobile, le libellé sort de la photo et se place au-dessus
                du bloc : posé en surimpression, il masquait le sujet de
                l'image sur une largeur d'écran étroite. */}
            <div className="md:hidden mb-3">
              <span className="inline-block bg-primary text-on-primary px-4 py-1.5 font-label-md text-label-md rounded-full shadow-xl">
                Recette de la Semaine
              </span>
            </div>
            <div className="luxury-shadow rounded-xl overflow-hidden bg-surface-container-lowest border border-primary/5 p-3">
              <div className="grid md:grid-cols-2 gap-0">
                <div className="relative h-[400px] md:h-auto overflow-hidden">
                  <Link href={`/recette/${featured.id}`} className="block group h-full">
                    <div className="w-full h-full bg-surface-container">
                      {featuredHeroSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element -- route image / cross-origin
                        <img
                          src={featuredHeroSrc}
                          alt={featured.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                          <span className="material-symbols-outlined text-6xl">cake</span>
                        </div>
                      )}
                    </div>
                    <div className="absolute top-6 left-6 hidden md:block">
                      <span className="bg-primary text-on-primary px-4 py-1.5 font-label-md text-label-md rounded-full shadow-xl">
                        Recette de la Semaine
                      </span>
                    </div>
                  </Link>
                  <FavoriteHeart
                    recipeId={featured.id}
                    initialFav={favIds.has(featured.id)}
                    className="top-6 right-6"
                  />
                  {featuredIsOwner && (
                    <Link
                      href={`/creer?id=${featured.id}`}
                      title="Éditer cette recette"
                      prefetch={false}
                      className="absolute top-6 right-[4.25rem] z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform"
                    >
                      <span className="material-symbols-outlined text-[20px] text-primary">edit_note</span>
                    </Link>
                  )}
                  <Link
                    href={`/recette/${featured.id}?planifier=1`}
                    title="Planifier cette recette"
                    prefetch={false}
                    className={`absolute top-6 ${featuredPlanPos} z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform`}
                  >
                    <PlanBadgeIcon />
                  </Link>
                </div>

                <div className="p-8 md:p-16 flex flex-col justify-center bg-surface-container-low">
                  <span className="font-label-md text-label-md text-secondary tracking-widest uppercase mb-3">
                    {featured.recipe_types?.name || 'Recette de la communauté'}
                  </span>
                  <h1 className="font-headline-md text-headline-md text-primary mb-6 leading-tight">
                    {featured.title}
                  </h1>
                  <p className="font-body-md text-on-surface-variant mb-8 leading-relaxed">
                    {featured.description || ''}
                  </p>
                  <div className="flex flex-wrap gap-8 mb-10">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-primary">schedule</span>
                      <span className="font-label-md text-label-md text-on-surface">
                        {formatTime(featuredTimes!.total || featuredTimes!.prep)}
                      </span>
                    </div>
                    {featured.difficulties?.name && (
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <MaryseIcon
                              key={i}
                              size={18}
                              className={
                                i <= (featured.difficulties?.level || 0)
                                  ? 'text-primary'
                                  : 'text-outline-variant'
                              }
                            />
                          ))}
                        </span>
                        <span className="font-label-md text-label-md text-on-surface">
                          {featured.difficulties.name}
                        </span>
                      </div>
                    )}
                  </div>
                  <AllergenPictos names={cardAllergenNames(featured)} className="mb-10 -mt-4" iconClassName="w-7 h-7" />
                  <Link
                    href={`/recette/${featured.id}`}
                    className="bg-primary text-on-primary px-10 py-4 rounded-full font-label-md text-label-md uppercase tracking-[0.15em] transition-all hover:shadow-xl active:scale-95 self-start"
                  >
                    Voir la recette
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Recherche — redirige vers la page de résultats /recherche */}
        <section className="mb-16">
          <div className="bg-surface-container-high rounded-xl p-8 md:py-16 flex flex-col items-center text-center">
            <h2 className="font-headline-lg text-headline-lg text-primary mb-6">
              Que souhaitez-vous préparer aujourd&apos;hui ?
            </h2>
            <HomeSearch />
          </div>
        </section>

        {/* Catégories */}
        <section className="mb-20">
          <div className="flex justify-between items-end mb-10 border-b border-outline-variant/20 pb-4">
            <div>
              <h2 className="font-headline-lg text-headline-lg text-primary">Explorer par Catégorie</h2>
              <div className="h-1 w-12 bg-secondary mt-1" />
            </div>
            <Link href="/" className="font-label-md text-label-md text-secondary hover:text-primary transition-colors">
              Voir tout
            </Link>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-6 gap-y-10">
            {categories.map((c) => {
              const inner = (
                <>
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-surface-container flex items-center justify-center mb-3 transition-all group-hover:bg-primary-fixed group-hover:shadow-lg overflow-hidden">
                    {c.picto ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data-URL stockée en base
                      <img src={c.picto} alt="" className="w-12 h-12 md:w-14 md:h-14 object-contain" />
                    ) : (
                      <span className="material-symbols-outlined text-4xl text-primary">{c.icon}</span>
                    )}
                  </div>
                  <span className="font-label-md text-label-md text-center group-hover:text-primary font-medium">
                    {c.label}
                  </span>
                </>
              );
              return c.slug ? (
                <Link
                  key={c.label}
                  href={`/recherche?category=${c.slug}`}
                  className="group flex flex-col items-center"
                >
                  {inner}
                </Link>
              ) : (
                <div key={c.label} className="group flex flex-col items-center">
                  {inner}
                </div>
              );
            })}
          </div>
        </section>

        {/* Publicité (entre Catégories et Dernières Créations) */}
        <section className="mb-20">
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
        </section>

        {/* Dernières créations */}
        <section className="mb-16">
          <div className="flex justify-between items-end mb-10">
            <div>
              <h2 className="font-headline-lg text-headline-lg text-primary">Dernières Créations</h2>
              <div className="h-1 w-12 bg-secondary mt-1" />
            </div>
          </div>
          {recipes.length > 0 ? (
            <HomeRecipeGrid initialRecipes={await withAllergenPictos(recipes)} initialFavIds={[...favIds]} currentUserId={user?.id} />
          ) : (
            <p className="text-on-surface-variant italic">
              Aucune recette publiée pour le moment.
            </p>
          )}
        </section>
      </main>

      <Footer />
      <MobileNav current="/" />
    </>
  );
}
