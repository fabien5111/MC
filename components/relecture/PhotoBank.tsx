'use client';

// Banque de photos d'un import PDF : les images extraites du fichier qui ne
// sont rattachées à aucune étape. Elles se glissent dans n'importe quel
// emplacement photo de l'écran de relecture (`ImageSlot` accepte le type
// `PHOTO_DND_TYPE`), et une photo retirée d'un emplacement revient ici — c'est
// ce qui permet de la déplacer d'une étape à une autre. Le même geste permet
// aussi de réordonner la banque elle-même (`PHOTO_REORDER_DND_TYPE`, posé en
// plus de `PHOTO_DND_TYPE` sur le même `dragstart`) : selon que la photo est
// déposée sur un emplacement d'étape ou sur une autre position de la banque,
// c'est l'un ou l'autre type que le récepteur lit.
import { PHOTO_DND_TYPE } from '@/components/ImageSlot';
import { PHOTO_REORDER_DND_TYPE } from '@/lib/photo-reorder';

export type PhotoBanque = { url: string; page: number | null };

export function PhotoBank({
  photos,
  onSupprimer,
  onReorder,
}: {
  photos: PhotoBanque[];
  onSupprimer: (url: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  if (!photos.length) return null;

  return (
    <section className="mb-8 bg-surface-container-low border border-outline-variant rounded-xl p-6">
      <h2 className="font-headline-md text-[22px] text-primary mb-1">Photos extraites du PDF</h2>
      <p className="text-sm text-on-surface-variant mb-4">
        Ces photos n&apos;ont pas été rattachées à une étape. Glissez-en une sur un emplacement pour la
        placer (ou sur une autre position ici pour réordonner) ; une photo retirée d&apos;un emplacement
        revient ici.
      </p>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {photos.map((p, i) => (
          <div
            key={p.url}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(PHOTO_DND_TYPE, p.url);
              e.dataTransfer.setData(PHOTO_REORDER_DND_TYPE, String(i));
              e.dataTransfer.effectAllowed = 'copyMove';
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(PHOTO_REORDER_DND_TYPE)) e.preventDefault();
            }}
            onDrop={(e) => {
              const raw = e.dataTransfer.getData(PHOTO_REORDER_DND_TYPE);
              if (!raw) return;
              e.preventDefault();
              const from = Number(raw);
              if (!Number.isNaN(from) && from !== i) onReorder(from, i);
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
