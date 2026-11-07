'use client';

// Aide contextuelle (JEP-391) : un picto « ? » (standard de l'aide « comment
// faire » ; le « i » sert plutôt à un renseignement ou à un état), suivi du
// libellé « Aide » dès 768 px — picto seul sur téléphone. Le clic ouvre une
// fenêtre avec le titre, le texte et la vidéo du bloc. Remplace l'ancien
// encadré « Aides et Conseils », qui prenait trop de place.
//
// La fenêtre est portée dans `document.body` : un emplacement peut vivre dans
// une autre fenêtre (extraction d'étapes, `z-[95]`) ou sous un conteneur
// flouté, qui deviendrait le repère d'un `fixed`. `z-[105]` : au-dessus des
// fenêtres du site, sous les alertes de `Dialog` (`z-[110]`). La vidéo n'est
// montée qu'à l'ouverture, donc arrêtée à la fermeture.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';
import type { VisibleHelpBlock } from '@/lib/help';

export function HelpBlock({ block }: { block: VisibleHelpBlock }) {
  const [ouvert, setOuvert] = useState(false);
  const fermerRef = useRef<HTMLButtonElement>(null);
  const declencheurRef = useRef<HTMLButtonElement>(null);
  // Le voile ne ferme que si le clic y a commencé (une sélection de texte
  // relâchée au-dehors ne doit pas fermer la fenêtre).
  const appuiSurVoile = useRef(false);

  useEffect(() => {
    if (!ouvert) return;
    fermerRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ouvert]);

  function fermer() {
    setOuvert(false);
    declencheurRef.current?.focus();
  }

  if (!block.text && !block.videoUrl) return null;
  const titreId = `aide-${block.key.replace(/\W/g, '-')}`;

  return (
    <>
      <button
        ref={declencheurRef}
        type="button"
        onClick={() => setOuvert(true)}
        title={`Aide : ${block.title}`}
        aria-label={`Aide : ${block.title}`}
        aria-haspopup="dialog"
        className="no-print inline-flex items-center gap-1.5 rounded-pill border border-secondary-container bg-secondary-container/30 p-1.5 md:px-3 md:py-1 text-primary transition-colors hover:bg-secondary-container/60"
      >
        <span className="material-symbols-outlined text-[20px]">help_outline</span>
        <span className="hidden md:inline font-label-md text-label-md">Aide</span>
      </button>
      {ouvert &&
        createPortal(
          <div
            className="no-print fixed inset-0 z-[105] flex items-start justify-center overflow-y-auto bg-background/60 backdrop-blur-[2px] p-4 md:items-center"
            onPointerDown={(e) => {
              appuiSurVoile.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && appuiSurVoile.current) fermer();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titreId}
              className="my-8 w-full max-w-xl rounded-xl border border-secondary-container bg-surface-container-lowest p-5 shadow-xl sm:p-6"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 id={titreId} className="flex items-center gap-2 font-headline-md text-headline-md text-primary">
                  <span className="material-symbols-outlined shrink-0 text-[24px]">help_outline</span>
                  {block.title}
                </h2>
                <button
                  ref={fermerRef}
                  type="button"
                  onClick={fermer}
                  aria-label="Fermer l'aide"
                  title="Fermer"
                  className="-m-2 shrink-0 p-2 text-on-surface-variant transition-colors hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[22px]">close</span>
                </button>
              </div>
              <div className="flex flex-col gap-5">
                {block.text && (
                  <p className="whitespace-pre-line font-body-md text-body-md text-on-surface">{block.text}</p>
                )}
                {block.videoUrl && <StepVideoPlayer url={block.videoUrl} />}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
