// Page Aide (JEP-373) : rassemble les textes des blocs d'aide, tels qu'ils sont
// saisis dans Admin → Aide. Ouverte à tous (les textes n'ont rien de privé) ;
// le geste « Réafficher les aides » n'est proposé qu'à un membre connecté.
//
// Contenu lu dans le cache des référentiels (`getHelpBlocksReference`), sans
// masquage : un bloc fermé sur un écran reste lisible ici. L'emplacement du
// bloc (`adminLabel`) est un repère d'administration, jamais montré.
import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/MobileNav';
import { ReafficherAidesButton } from '@/components/help/ReafficherAidesButton';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';
import { getCurrentUser } from '@/lib/auth';
import { getHelpBlocksReference } from '@/lib/data/reference';
import { HELP_BLOCKS, HELP_PAGES } from '@/lib/help-blocks';

export const metadata: Metadata = { title: 'Aide | Je pâtisse !' };

export default async function AidePage() {
  const [contenus, user] = await Promise.all([getHelpBlocksReference(), getCurrentUser()]);
  const parCle = new Map(contenus.map((c) => [c.key, c]));

  const sections = HELP_PAGES.map((page) => ({
    ...page,
    blocs: HELP_BLOCKS.filter((b) => b.page === page.slug)
      .map((b) => ({ key: b.key, text: parCle.get(b.key)?.text?.trim() || null, videoUrl: parCle.get(b.key)?.video_url || null }))
      .filter((b) => b.text || b.videoUrl),
  })).filter((s) => s.blocs.length > 0);

  return (
    <>
      <Header />
      <main className="max-w-[900px] mx-auto pb-24 px-margin-mobile md:px-margin-desktop">
        <section className="pt-12 pb-8">
          <h1 className="font-headline-lg text-headline-lg text-primary">Aide</h1>
          <div className="h-1 w-12 bg-secondary mt-1 mb-4" />
          <p className="text-on-surface-variant max-w-[65ch]">
            Les conseils affichés en haut de certains écrans, rassemblés au même endroit. Une question qui n&apos;est pas
            traitée ici ? Écrivez-nous par la{' '}
            <Link href="/contact" className="text-primary underline underline-offset-2">
              page Contact
            </Link>
            .
          </p>
          {user && (
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <ReafficherAidesButton />
              <span className="text-[13px] text-on-surface-variant">
                Rétablit les blocs d&apos;aide que vous avez fermés sur les écrans.
              </span>
            </div>
          )}
        </section>

        {sections.length === 0 ? (
          <p className="text-on-surface-variant italic">Les textes d&apos;aide arrivent bientôt.</p>
        ) : (
          <>
            <nav aria-label="Thèmes d'aide" className="mb-10 flex flex-wrap gap-2">
              {sections.map((s) => (
                <a
                  key={s.slug}
                  href={`#${s.slug}`}
                  className="rounded-pill border border-outline-variant px-4 py-1.5 font-label-md text-[12.5px] text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                >
                  {s.label}
                </a>
              ))}
            </nav>

            <div className="flex flex-col gap-12">
              {sections.map((s) => (
                <section key={s.slug} id={s.slug} className="scroll-mt-28">
                  <h2 className="font-headline-md text-headline-md text-primary mb-4">{s.label}</h2>
                  <div className="flex flex-col gap-4">
                    {s.blocs.map((b) => (
                      <div
                        key={b.key}
                        className="flex flex-col md:flex-row gap-6 items-start rounded-xl border border-secondary-container bg-secondary-container/30 p-6"
                      >
                        {b.text && (
                          <p className="flex-1 min-w-0 font-body-md text-body-md text-on-surface whitespace-pre-line">{b.text}</p>
                        )}
                        {b.videoUrl && (
                          <div className="w-full md:w-64 shrink-0">
                            <StepVideoPlayer url={b.videoUrl} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </main>
      <Footer />
      <MobileNav />
    </>
  );
}
