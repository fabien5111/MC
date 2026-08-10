import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getPlanning, getShoppingLists } from '@/lib/profile';
import { formatDate, formatTime } from '@/lib/format';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { PlanningIcon, DISC } from '@/components/PlanningIcon';
import { ArchivedShoppingLists } from '@/components/cuisine/ArchivedShoppingLists';

export const metadata: Metadata = { title: 'Archives | En cuisine | Je pâtisse !' };
export const dynamic = 'force-dynamic';

// Ce que « En cuisine » ne montre plus une fois qu'on en a fini :
//  - les recettes **retirées du planning alors qu'une session leur était déjà
//    liée** — archivées (`planning.status = 'archive'`) plutôt que supprimées,
//    car `executions.planning_id` est en `ON DELETE RESTRICT` (cf. CLAUDE.md
//    « Recettes planifiées »). Rien ne les relisait nulle part avant cet écran.
//  - les listes de courses **entièrement cochées** — pas de colonne dédiée en
//    base, l'archivage est purement une lecture : une liste dont tous les
//    articles sont cochés est considérée terminée.
export default async function ArchivesPage() {
  const user = await requireUser('/en-cuisine/archives');

  const [archivedPlans, shoppingLists] = await Promise.all([
    getPlanning(user.id, 'archive'),
    getShoppingLists(user.id),
  ]);
  const archivedLists = shoppingLists.filter((l) => {
    const items = l.shopping_list_items || [];
    return items.length > 0 && items.every((i) => i.checked);
  });

  return (
    <>
      <Header current="cuisine" />
      <main className="mx-auto mb-24 max-w-[1200px] px-margin-mobile md:px-margin-desktop">
        <div className="pb-2 pt-12">
          <Link href="/en-cuisine" className="font-label-md text-label-md text-on-surface-variant hover:text-primary flex items-center gap-1 mb-4">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span> En cuisine
          </Link>
          <p className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">En cuisine</p>
          <h1 className="font-headline-lg text-[30px] leading-tight text-primary md:text-[42px]">Archives</h1>
        </div>

        <section id="planning" className="mt-12">
          <h2 className="mb-6 flex items-center gap-3 font-headline-md text-primary">
            <PlanningIcon size={24} discFill={DISC.surface} /> Recettes planifiées archivées
          </h2>
          {archivedPlans.length > 0 ? (
            <div className="max-w-3xl space-y-4">
              {archivedPlans.map((p) => {
                const timeTxt =
                  p.recipes?.total_time || p.recipes?.prep_time
                    ? formatTime(p.recipes.total_time || p.recipes.prep_time)
                    : '';
                return (
                  <Link
                    key={p.id}
                    href={`/recette/${p.recipes?.id || p.recipe_id}?plan=${p.id}`}
                    className="flex items-center gap-4 rounded-lg border border-outline-variant bg-white p-6 transition-colors hover:bg-surface-container"
                  >
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-container-high">
                      {p.recipes?.hero_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                        <img src={p.recipes.hero_image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant">cake</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-label-md text-primary">{p.recipes?.title || ''}</p>
                      <p className="font-body-md text-[12px] text-on-surface-variant">
                        {[p.planned_date ? 'Prévu pour ' + formatDate(p.planned_date) : '', timeTxt]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="italic text-on-surface-variant">Aucune recette planifiée archivée.</p>
          )}
        </section>

        <section id="courses" className="mt-14 border-t border-outline-variant pt-10">
          <h2 className="mb-6 flex items-center gap-3 font-headline-md text-primary">
            <span className="material-symbols-outlined">shopping_bag</span> Listes de courses archivées
          </h2>
          <ArchivedShoppingLists lists={archivedLists} />
        </section>
      </main>
      <Footer />
      <MobileNav current="cuisine" />
    </>
  );
}
