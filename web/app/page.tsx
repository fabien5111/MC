import { Header } from '@/components/Header';
import { getRecipes } from '@/lib/recipes';
import { formatTime } from '@/lib/format';

export default async function HomePage() {
  const recipes = await getRecipes({ limit: 6 });

  return (
    <>
      <Header current="/" />
      <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop py-12">
        <section className="mb-12">
          <p className="maryse-logo-font text-5xl text-primary mb-2">maryse club</p>
          <h1 className="font-headline-lg text-headline-lg text-primary mb-3">
            La haute pâtisserie à la maison
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
            Migration en cours vers Next.js. En-tête, navigation, composant image
            et accès données typés sont désormais partagés (Phase 1).
          </p>
        </section>

        {recipes.length > 0 && (
          <section>
            <h2 className="font-headline-md text-headline-md text-on-surface mb-6">
              Dernières recettes
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-gutter">
              {recipes.map((r) => (
                <article
                  key={r.id}
                  className="group bg-surface-container-lowest border border-outline-variant hover:shadow-lg transition-all duration-500 hover:-translate-y-1"
                >
                  <div className="aspect-[4/3] bg-surface-container overflow-hidden relative">
                    {r.hero_image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                      <img
                        src={r.hero_image_url}
                        alt={r.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                        <span className="material-symbols-outlined text-5xl">cake</span>
                      </div>
                    )}
                  </div>
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-label-md text-label-md text-secondary uppercase tracking-widest text-xs">
                        {r.recipe_types?.name || ''}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {formatTime(r.total_time || r.prep_time)}
                      </span>
                    </div>
                    <h3 className="font-headline-md text-xl text-on-surface mb-2 group-hover:text-primary transition-colors">
                      {r.title}
                    </h3>
                    <p className="text-sm text-on-surface-variant line-clamp-2">
                      {r.description || ''}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
