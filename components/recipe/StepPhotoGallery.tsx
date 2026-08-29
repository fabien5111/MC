'use client';

// Grille des photos d'une étape, cliquable : ouvre un diaporama plein écran
// (flèches, clavier ← → Échap) pour parcourir les autres photos de la même
// étape sans revenir à la grille. Le wrapper de chaque vignette reste un
// `<div>` (pas un `<button>`) : la mise en page d'impression
// (`.print-step-photos > div`, app/globals.css) cible ce tag directement.
import { useCallback, useEffect, useState } from 'react';
import { AiPhotoBadge } from '@/components/AiPhotoBadge';

type StepPhoto = { url: string; ai_retouched: boolean };

const overlayIconBtn =
  'w-11 h-11 rounded-full bg-surface-container/90 text-on-surface flex items-center justify-center hover:bg-surface-container-high transition-colors';

export function StepPhotoGallery({
  photos,
  // Grille sur 2 colonnes fixes, sans passer à 4 en desktop : pour un usage
  // dans un conteneur volontairement étroit (galerie d'un avis, 2 photos
  // max), où `md:grid-cols-4` réduirait les vignettes à une poignée de
  // pixels plutôt que d'élargir la grille (le conteneur, lui, ne s'élargit
  // pas avec le viewport).
  compact = false,
}: {
  photos: StepPhoto[];
  compact?: boolean;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const close = useCallback(() => setOpenIndex(null), []);
  const prev = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i - 1 + photos.length) % photos.length)),
    [photos.length],
  );
  const next = useCallback(
    () => setOpenIndex((i) => (i === null ? null : (i + 1) % photos.length)),
    [photos.length],
  );

  useEffect(() => {
    if (openIndex === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openIndex, close, prev, next]);

  if (photos.length === 0) return null;

  return (
    <>
      <div className={`print-step-photos grid grid-cols-2 ${compact ? '' : 'md:grid-cols-4'} gap-4`}>
        {photos.map((p, k) => (
          <div
            key={k}
            role="button"
            tabIndex={0}
            onClick={() => setOpenIndex(k)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setOpenIndex(k);
              }
            }}
            className="relative aspect-square bg-surface-container-high border border-outline-variant overflow-hidden cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin */}
            <img src={p.url} alt="" className="w-full h-full object-cover" />
            {p.ai_retouched && <AiPhotoBadge />}
          </div>
        ))}
      </div>

      {openIndex !== null && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-background/90 backdrop-blur-[2px] p-4 print:hidden"
          role="dialog"
          aria-modal="true"
          onClick={close}
        >
          <button type="button" onClick={close} title="Fermer" className={`absolute top-4 right-4 z-10 ${overlayIconBtn}`}>
            <span className="material-symbols-outlined">close</span>
          </button>

          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              title="Photo précédente"
              className={`absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-10 ${overlayIconBtn}`}
            >
              <span className="material-symbols-outlined">chevron_left</span>
            </button>
          )}

          <div className="relative" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin */}
            <img src={photos[openIndex].url} alt="" className="max-w-full max-h-[85vh] object-contain" />
            {photos[openIndex].ai_retouched && <AiPhotoBadge />}
          </div>

          {photos.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              title="Photo suivante"
              className={`absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-10 ${overlayIconBtn}`}
            >
              <span className="material-symbols-outlined">chevron_right</span>
            </button>
          )}

          {photos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 font-label-md text-label-md text-on-surface bg-surface-container/90 px-3 py-1 rounded-full">
              {openIndex + 1} / {photos.length}
            </div>
          )}
        </div>
      )}
    </>
  );
}
