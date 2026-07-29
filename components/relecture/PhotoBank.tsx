'use client';

// Banque de photos d'un import PDF : les images extraites du fichier qui ne
// sont rattachées à aucune étape. Elles se glissent dans n'importe quel
// emplacement photo de l'écran de relecture (`ImageSlot` accepte le type
// `PHOTO_DND_TYPE`), et une photo retirée d'un emplacement revient ici — c'est
// ce qui permet de la déplacer d'une étape à une autre.
import { PHOTO_DND_TYPE } from '@/components/ImageSlot';

export type PhotoBanque = { url: string; page: number | null };

export function PhotoBank({
  photos,
  onSupprimer,
}: {
  photos: PhotoBanque[];
  onSupprimer: (url: string) => void;
}) {
  if (!photos.length) return null;

  return (
    <section className="mb-8 bg-surface-container-low border border-outline-variant rounded-xl p-6">
      <h2 className="font-headline-md text-[22px] text-primary mb-1">Photos extraites du PDF</h2>
      <p className="text-sm text-on-surface-variant mb-4">
        Ces photos n&apos;ont pas été rattachées à une étape. Glissez-en une sur un emplacement pour la
        placer ; une photo retirée d&apos;un emplacement revient ici.
      </p>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {photos.map((p) => (
          <div
            key={p.url}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(PHOTO_DND_TYPE, p.url);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            title={p.page ? `Page ${p.page} du PDF` : 'Photo du PDF'}
            className="relative aspect-square rounded-lg overflow-hidden border border-outline-variant bg-surface-container cursor-grab active:cursor-grabbing"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data-URL */}
            <img src={p.url} alt="" className="w-full h-full object-cover pointer-events-none" />
            {p.page ? (
              <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-surface/90 text-[10px] font-label-md text-on-surface-variant">
                p. {p.page}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onSupprimer(p.url)}
              title="Écarter cette photo"
              className="absolute top-1 right-1 w-7 h-7 rounded-full bg-surface/90 text-error flex items-center justify-center shadow hover:bg-error hover:text-on-error transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
