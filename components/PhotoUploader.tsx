'use client';

// Sélection de photos, compressées côté client (`lib/images.ts`, motif déjà
// utilisé pour les recettes) et rendues en data-URL — jamais transmises à un
// service externe (docs/contact-jira.md §15). Extrait de `ContactForm.tsx`
// (lot 10) pour être réutilisé par le formulaire de réponse membre
// (`MaDemandeDetail.tsx`) sans dupliquer la logique de compression/aperçu.
//
// Contrôlé : le parent porte le tableau de data-URL (`photos`/`onChange`),
// ce composant ne fait qu'ajouter ou retirer. `onBusyChange` prévient le
// parent pendant la compression, pour qu'il désactive son propre bouton
// d'envoi le temps que toutes les photos soient prêtes.
import { useState } from 'react';
import { isAcceptedImage, isHeic, resizeImageToDataUrl } from '@/lib/images';
import { CONTACT_PHOTOS_MAX } from '@/lib/contact';

export function PhotoUploader({
  photos,
  onChange,
  onBusyChange,
  max = CONTACT_PHOTOS_MAX,
  helpText = "Utile pour montrer un problème d'affichage — visible uniquement par notre équipe, jamais transmise à un service externe.",
}: {
  photos: string[];
  onChange: (photos: string[]) => void;
  onBusyChange?: (busy: boolean) => void;
  max?: number;
  helpText?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ajouter(fichiers: FileList | null) {
    if (!fichiers || fichiers.length === 0) return;
    setError(null);
    const place = max - photos.length;
    if (place <= 0) {
      setError(`Vous ne pouvez joindre que ${max} photos au maximum.`);
      return;
    }
    setBusy(true);
    onBusyChange?.(true);
    try {
      const nouvelles: string[] = [];
      for (const fichier of Array.from(fichiers).slice(0, place)) {
        if (isHeic(fichier)) {
          setError("Le format HEIC (photos iPhone) n'est pas lisible par le navigateur : exportez d'abord la photo en JPEG.");
          continue;
        }
        if (!isAcceptedImage(fichier)) {
          setError('Format de fichier non pris en charge.');
          continue;
        }
        try {
          nouvelles.push(await resizeImageToDataUrl(fichier));
        } catch {
          setError("Une photo n'a pas pu être lue et a été ignorée.");
        }
      }
      if (nouvelles.length) onChange([...photos, ...nouvelles]);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  function retirer(index: number) {
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
    <div>
      <label className="font-label-md text-label-md text-on-surface-variant mb-2 block">
        Photo <span className="text-outline">(facultatif, {max} maximum)</span>
      </label>
      <p className="mb-2 text-[12.5px] text-on-surface-variant">{helpText}</p>

      {photos.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-3">
          {photos.map((src, i) => (
            <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border border-outline-variant">
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL */}
              <img src={src} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => retirer(i)}
                aria-label="Retirer cette photo"
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface/90 text-on-surface transition-colors hover:bg-error hover:text-on-error"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length < max && (
        <label
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] transition-colors ${
            busy
              ? 'cursor-wait border-outline-variant text-outline'
              : 'cursor-pointer border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">add_photo_alternate</span>
          {busy ? 'Traitement…' : 'Ajouter une photo'}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            multiple
            disabled={busy}
            onChange={(e) => {
              ajouter(e.target.files);
              e.target.value = '';
            }}
            className="sr-only"
          />
        </label>
      )}

      {error && (
        <p role="alert" aria-live="polite" className="mt-2 text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  );
}
