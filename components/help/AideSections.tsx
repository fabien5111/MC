'use client';

// Page Aide (JEP-373) : un panneau repliable par page d'aide, tous repliés à
// l'arrivée. Les pastilles du haut ouvrent le panneau visé et y amènent ; un
// lien `/aide#<page>` (ou un rechargement avec ancre) ouvre aussi le bon
// panneau. Le contenu n'est monté qu'à l'ouverture, sauf pour l'impression des
// vidéos, qui n'en a pas besoin (`no-print` dans `StepVideoPlayer`).
import { useEffect, useState } from 'react';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';

export type AideSection = {
  slug: string;
  label: string;
  blocs: { key: string; title: string; text: string | null; videoUrl: string | null }[];
};

export function AideSections({ sections }: { sections: AideSection[] }) {
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  const basculer = (slug: string) =>
    setOuverts((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });

  function aller(slug: string) {
    setOuverts((prev) => new Set(prev).add(slug));
    // Le contenu s'ouvre au prochain rendu : attendre avant de défiler.
    requestAnimationFrame(() => document.getElementById(slug)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  useEffect(() => {
    const slug = window.location.hash.slice(1);
    if (!slug || !sections.some((s) => s.slug === slug)) return;
    setOuverts(new Set([slug]));
    requestAnimationFrame(() => document.getElementById(slug)?.scrollIntoView({ block: 'start' }));
  }, [sections]);

  return (
    <>
      <nav aria-label="Thèmes d'aide" className="mb-8 flex flex-wrap gap-2">
        {sections.map((s) => (
          <button
            key={s.slug}
            type="button"
            onClick={() => aller(s.slug)}
            className="rounded-pill border border-outline-variant px-4 py-1.5 font-label-md text-[12.5px] text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-3">
        {sections.map((s) => {
          const ouvert = ouverts.has(s.slug);
          return (
            <section key={s.slug} id={s.slug} className="scroll-mt-28 rounded-xl border border-outline-variant bg-surface-container-lowest">
              <h2>
                <button
                  type="button"
                  onClick={() => basculer(s.slug)}
                  aria-expanded={ouvert}
                  aria-controls={`${s.slug}-panneau`}
                  className="flex w-full items-center justify-between gap-4 p-5 text-left md:px-6"
                >
                  <span className="min-w-0">
                    <span className="font-headline-md text-headline-md text-primary">{s.label}</span>
                    <span className="ml-3 font-label-md text-[12px] text-on-surface-variant">
                      {s.blocs.length} aide{s.blocs.length > 1 ? 's' : ''}
                    </span>
                  </span>
                  <span className="material-symbols-outlined shrink-0 text-[24px] text-on-surface-variant">
                    {ouvert ? 'expand_less' : 'expand_more'}
                  </span>
                </button>
              </h2>
              {ouvert && (
                <div id={`${s.slug}-panneau`} className="flex flex-col gap-4 border-t border-outline-variant p-5 md:p-6">
                  {s.blocs.map((b) => (
                    <article key={b.key} className="rounded-xl border border-secondary-container bg-secondary-container/30 p-5 md:p-6">
                      <h3 className="mb-3 font-label-md text-label-md font-semibold text-primary">{b.title}</h3>
                      <div className="flex flex-col items-start gap-6 md:flex-row">
                        {b.text && (
                          <p className="min-w-0 flex-1 whitespace-pre-line font-body-md text-body-md text-on-surface">{b.text}</p>
                        )}
                        {b.videoUrl && (
                          <div className="w-full shrink-0 md:w-64">
                            <StepVideoPlayer url={b.videoUrl} />
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
