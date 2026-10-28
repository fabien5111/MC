'use client';

// Page Aide (JEP-373) : un panneau repliable par page d'aide, tous repliés à
// l'arrivée. Les pastilles du haut ouvrent le panneau visé et y amènent ; un
// lien `/aide#<page>` (ou un rechargement avec ancre) ouvre aussi le bon
// panneau. Chaque aide est elle-même repliable, repliée à l'arrivée : seul son
// titre se lit. Le contenu n'est monté qu'à l'ouverture.
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';
import { resumeAide, type StatutPage } from '@/lib/help-statut';

export type AideSection = {
  slug: string;
  label: string;
  blocs: { key: string; title: string; text: string | null; videoUrl: string | null }[];
};

const LIBELLE_STATUT: Record<StatutPage, string> = {
  active: 'Activée',
  partielle: 'Partiellement masquée',
  inactive: 'Désactivée',
};
const PASTILLE_STATUT: Record<StatutPage, string> = {
  active: 'bg-green-100 text-green-800',
  partielle: 'bg-amber-100 text-amber-900',
  inactive: 'bg-surface-container-high text-on-surface-variant',
};
const BTN =
  'rounded-pill border border-primary px-4 py-1.5 font-label-md text-[12.5px] text-primary transition-colors hover:bg-primary/5 disabled:opacity-60';

// `statuts` absent (visiteur) : aucun statut ni bouton d'activation.
export function AideSections({
  sections,
  statuts,
}: {
  sections: AideSection[];
  statuts?: Record<string, StatutPage>;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [envoi, setEnvoi] = useState(false);
  // Le voile reste jusqu'au retour du rendu serveur (cf. `useMutation`), sinon
  // les statuts s'afficheraient périmés un instant sur une interface active.
  const [pending, startTransition] = useTransition();
  const busy = envoi || pending;

  // Active ou désactive l'aide d'une page, ou de toutes (`page` absent), puis
  // relit les statuts côté serveur.
  async function agir(action: 'activer' | 'desactiver', page?: string) {
    if (busy) return;
    setEnvoi(true);
    try {
      const res = await fetch('/api/aide/masquages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, page }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || 'Modification impossible.');
      startTransition(() => router.refresh());
    } catch (e) {
      await dialog.alert((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  const resume = statuts ? resumeAide(statuts) : null;
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());
  // Aides ouvertes, par clé de bloc : toutes repliées à l'arrivée.
  const [aidesOuvertes, setAidesOuvertes] = useState<Set<string>>(new Set());

  const basculerAide = (cle: string) =>
    setAidesOuvertes((prev) => {
      const next = new Set(prev);
      if (next.has(cle)) next.delete(cle);
      else next.add(cle);
      return next;
    });

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
      <LoadingOverlay visible={busy} label="Mise à jour de l’aide…" />
      {resume && (
        <div className="mb-8 flex flex-col gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-5">
          <p className="font-label-md text-label-md text-on-surface" role="status">
            {resume.global === 'active' && 'Toute l’aide est activée.'}
            {resume.global === 'inactive' && 'Toute l’aide est désactivée.'}
            {resume.global === 'mixte' &&
              `L’aide est active sur ${resume.actives} page${resume.actives > 1 ? 's' : ''} sur ${resume.total}` +
                (resume.partielles ? `, partiellement masquée sur ${resume.partielles}` : '') +
                (resume.inactives ? `, désactivée sur ${resume.inactives}` : '') +
                '.'}
          </p>
          <p className="text-[13px] text-on-surface-variant">
            Une aide désactivée n&apos;apparaît plus en haut des écrans concernés. Elle reste lisible ici.
          </p>
          <div className="flex flex-wrap gap-3">
            {resume.global !== 'active' && (
              <button type="button" className={BTN} disabled={busy} onClick={() => void agir('activer')}>
                Activer toute l’aide
              </button>
            )}
            {resume.global !== 'inactive' && (
              <button type="button" className={BTN} disabled={busy} onClick={() => void agir('desactiver')}>
                Désactiver toute l’aide
              </button>
            )}
          </div>
        </div>
      )}

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
          const statut = statuts?.[s.slug];
          return (
            <section key={s.slug} id={s.slug} className="scroll-mt-28 rounded-xl border border-outline-variant bg-surface-container-lowest">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 p-5 md:px-6">
                <h2 className="min-w-0 flex-1 basis-64">
                  <button
                    type="button"
                    onClick={() => basculer(s.slug)}
                    aria-expanded={ouvert}
                    aria-controls={`${s.slug}-panneau`}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className="material-symbols-outlined shrink-0 text-[24px] text-on-surface-variant">
                      {ouvert ? 'expand_less' : 'expand_more'}
                    </span>
                    <span className="min-w-0">
                      <span className="font-headline-md text-headline-md text-primary">{s.label}</span>
                      <span className="ml-3 font-label-md text-[12px] text-on-surface-variant">
                        {s.blocs.length} aide{s.blocs.length > 1 ? 's' : ''}
                      </span>
                    </span>
                  </button>
                </h2>
                {statut && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-pill px-3 py-1 font-label-md text-[11.5px] ${PASTILLE_STATUT[statut]}`}>
                      {LIBELLE_STATUT[statut]}
                    </span>
                    {statut !== 'active' && (
                      <button type="button" className={BTN} disabled={busy} onClick={() => void agir('activer', s.slug)}>
                        Activer
                      </button>
                    )}
                    {statut !== 'inactive' && (
                      <button type="button" className={BTN} disabled={busy} onClick={() => void agir('desactiver', s.slug)}>
                        Désactiver
                      </button>
                    )}
                  </div>
                )}
              </div>
              {ouvert && (
                <div id={`${s.slug}-panneau`} className="flex flex-col gap-4 border-t border-outline-variant p-5 md:p-6">
                  {s.blocs.map((b) => {
                    const aideOuverte = aidesOuvertes.has(b.key);
                    return (
                      <article key={b.key} className="rounded-xl border border-secondary-container bg-secondary-container/30">
                        <h3>
                          <button
                            type="button"
                            onClick={() => basculerAide(b.key)}
                            aria-expanded={aideOuverte}
                            aria-controls={`aide-${b.key}`}
                            className="flex w-full items-center justify-between gap-4 p-4 text-left md:px-6"
                          >
                            <span className="min-w-0 font-label-md text-label-md font-semibold text-primary">{b.title}</span>
                            <span className="material-symbols-outlined shrink-0 text-[22px] text-on-surface-variant">
                              {aideOuverte ? 'expand_less' : 'expand_more'}
                            </span>
                          </button>
                        </h3>
                        {aideOuverte && (
                          <div id={`aide-${b.key}`} className="flex flex-col items-start gap-6 px-4 pb-5 md:flex-row md:px-6">
                            {b.text && (
                              <p className="min-w-0 flex-1 whitespace-pre-line font-body-md text-body-md text-on-surface">{b.text}</p>
                            )}
                            {b.videoUrl && (
                              <div className="w-full shrink-0 md:w-64">
                                <StepVideoPlayer url={b.videoUrl} />
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
