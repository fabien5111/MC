'use client';

// Remplaçant React du web component <image-slot> (image-slot.js).
// Le scaffold vanilla persistait dans un sidecar JSON (outil de design) ;
// ici, en production, l'utilisateur dépose/choisit une image, on la compresse
// en data-URL et on la remonte via onChange — au parent de la persister
// (profiles.avatar_url, recipes.hero_image_url…).
import { useCallback, useId, useRef, useState } from 'react';
import { isAcceptedImage, resizeImageToDataUrl } from '@/lib/images';
import { AiPhotoBadge } from '@/components/AiPhotoBadge';
import { PhotoEditorModal } from '@/components/PhotoEditorModal';
import { useDialog } from '@/components/Dialog';

type Shape = 'rect' | 'rounded' | 'circle' | 'pill';

/**
 * Type de données d'un glisser-déposer d'image *déjà compressée* entre deux
 * zones de la page (banque de photos d'un import PDF → emplacement d'étape).
 * Le glissement transporte la data-URL telle quelle : rien à recompresser,
 * contrairement au dépôt d'un fichier.
 */
export const PHOTO_DND_TYPE = 'application/x-mc-photo';

const SHAPE_RADIUS: Record<Shape, string> = {
  rect: '0',
  rounded: '12px',
  circle: '50%',
  pill: '9999px',
};

export type ImageSlotProps = {
  /** URL ou data-URL de l'image affichée. */
  src?: string | null;
  /** Appelée avec la data-URL compressée après un dépôt/choix. Sans onChange, le slot est en lecture seule. */
  onChange?: (dataUrl: string) => void;
  /**
   * Photo d'origine (non recadrée) connue pour ce cliché, si le parent la
   * conserve à part — l'éditeur s'ouvre dessus plutôt que sur `src` (déjà
   * recadrée), pour permettre d'ajuster à nouveau le cadrage sans repartir
   * d'une photo déjà rognée. Sans valeur, repli sur `src`.
   */
  originalSrc?: string | null;
  /**
   * Appelée avec la data-URL brute (avant tout recadrage) quand une photo
   * *nouvelle* arrive dans l'emplacement (choix de fichier, dépôt, ou
   * glissement depuis une banque de photos) — jamais quand l'éditeur
   * réenregistre un recadrage sur la photo déjà en place.
   */
  onOriginalChange?: (dataUrl: string) => void;
  /** Si fournie, affiche un bouton de suppression sur l'image ; appelée au clic. */
  onClear?: () => void;
  shape?: Shape;
  fit?: 'cover' | 'contain' | 'fill';
  placeholder?: string;
  alt?: string;
  /** Largeur max de compression (px). Avatar : 400 ; bannière/hero : 1400. */
  maxWidth?: number;
  /** Format d'encodage. `image/webp` préserve la transparence (pictos PNG sans fond) ; défaut `image/jpeg`. */
  mime?: 'image/jpeg' | 'image/webp';
  className?: string;
  style?: React.CSSProperties;
  /** Pastille crayon superposée (porté de profil.html : bannière/avatar). */
  editTitle?: string;
  editButtonClassName?: string;
  /** Affiche le filigrane « Photo retravaillée avec l'IA » (case cochée par l'utilisateur). */
  aiRetouched?: boolean;
  /**
   * Rapport largeur/hauteur du cadre cible (16/9 pour le hero, 1 pour une
   * photo d'étape). Sa présence conditionne l'affichage du bouton d'édition
   * (zoom/rotation/position) : sans cadre cible connu, rien à ajuster.
   */
  aspectRatio?: number;
  /**
   * Demande, juste après la validation d'un recadrage, si la photo a été
   * retravaillée avec l'IA (avertit qu'un filigrane sera apposé si oui) —
   * réservé aux photos de recette (hero, étapes), pas à l'avatar/bannière/
   * couverture de blog ou de liste, qui n'ont pas ce champ.
   */
  promptAiRetouched?: boolean;
  /** Réponse à la question ci-dessus. Requis si `promptAiRetouched`. */
  onAiRetouchedChange?: (value: boolean) => void;
};

export function ImageSlot({
  src,
  onChange,
  originalSrc,
  onOriginalChange,
  onClear,
  shape = 'rounded',
  fit = 'cover',
  placeholder = 'Déposez une image',
  alt = '',
  maxWidth = 1400,
  mime = 'image/jpeg',
  className = '',
  style,
  editTitle,
  editButtonClassName = 'bottom-3 right-3 w-9 h-9',
  aiRetouched = false,
  aspectRatio,
  promptAiRetouched = false,
  onAiRetouchedChange,
}: ImageSlotProps) {
  const dialog = useDialog();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const readOnly = !onChange;

  const ingest = useCallback(
    async (file: File) => {
      setError(null);
      if (!isAcceptedImage(file)) {
        setError('Format non supporté (PNG, JPEG, WebP ou AVIF).');
        return;
      }
      setBusy(true);
      try {
        const dataUrl = await resizeImageToDataUrl(file, maxWidth, mime);
        onChange?.(dataUrl);
        onOriginalChange?.(dataUrl);
        // Une photo tout juste chargée n'a pas encore été cadrée : on ouvre
        // l'édition par défaut plutôt que d'attendre un clic sur le crayon.
        if (aspectRatio) setEditingPhoto(true);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [maxWidth, mime, onChange, onOriginalChange, aspectRatio],
  );

  const radius = SHAPE_RADIUS[shape];

  return (
    <div
      className={`relative block overflow-hidden bg-surface-container ${
        readOnly ? '' : 'cursor-pointer'
      } ${dragOver ? 'ring-2 ring-primary' : ''} ${className}`}
      style={{ borderRadius: radius, ...style }}
      onClick={readOnly ? undefined : () => inputRef.current?.click()}
      onDragOver={
        readOnly
          ? undefined
          : (e) => {
              e.preventDefault();
              setDragOver(true);
            }
      }
      onDragLeave={readOnly ? undefined : () => setDragOver(false)}
      onDrop={
        readOnly
          ? undefined
          : (e) => {
              e.preventDefault();
              setDragOver(false);
              const dataUrl = e.dataTransfer.getData(PHOTO_DND_TYPE);
              if (dataUrl) {
                onChange?.(dataUrl);
                onOriginalChange?.(dataUrl);
                if (aspectRatio) setEditingPhoto(true);
                return;
              }
              const file = e.dataTransfer.files?.[0];
              if (file) void ingest(file);
            }
      }
      role={readOnly ? undefined : 'button'}
      aria-label={readOnly ? undefined : placeholder}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin variés
        <img
          src={src}
          alt={alt}
          className="w-full h-full"
          style={{ objectFit: fit }}
        />
      ) : null}
      {src && aiRetouched && <AiPhotoBadge />}
      {!src && (
        <div className="w-full h-full flex flex-col items-center justify-center text-center p-2 text-on-surface-variant">
          <span className="material-symbols-outlined text-3xl opacity-60">image</span>
          <span className="text-xs mt-1 opacity-80">{placeholder}</span>
        </div>
      )}

      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface/60 text-xs text-primary">
          Traitement…
        </div>
      )}
      {error && (
        <div className="absolute bottom-0 inset-x-0 bg-error text-on-error text-[11px] px-2 py-1">
          {error}
        </div>
      )}

      {!readOnly && editTitle && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            inputRef.current?.click();
          }}
          title={editTitle}
          className={`absolute ${editButtonClassName} rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md hover:scale-110 transition-transform z-20`}
        >
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
      )}

      {!readOnly && aspectRatio && src && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditingPhoto(true);
          }}
          title="Ajuster la photo (zoom, rotation, position)"
          className="absolute top-2 right-11 w-8 h-8 rounded-full bg-surface/90 text-on-surface flex items-center justify-center shadow-md hover:bg-primary hover:text-on-primary transition-colors z-20"
        >
          <span className="material-symbols-outlined text-[18px]">edit</span>
        </button>
      )}

      {!readOnly && onClear && src && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          title="Supprimer la photo"
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-surface/90 text-error flex items-center justify-center shadow-md hover:bg-error hover:text-on-error transition-colors z-20"
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      )}

      {!readOnly && editingPhoto && src && aspectRatio && (
        <PhotoEditorModal
          src={originalSrc || src}
          aspectRatio={aspectRatio}
          maxWidth={maxWidth}
          mime={mime}
          onCancel={() => setEditingPhoto(false)}
          onSave={(dataUrl) => {
            onChange?.(dataUrl);
            setEditingPhoto(false);
            if (promptAiRetouched) {
              // `choice` plutôt que `confirm` : le bouton par défaut (focus,
              // couleur primaire) doit être « Non » — présumer un filigrane
              // « IA » sur une simple validation de recadrage serait trompeur
              // pour l'auteur comme pour les lecteurs de la recette.
              dialog
                .choice(
                  "Cette photo a-t-elle été retravaillée avec l'IA ?\n\n" +
                    "Si oui, un filigrane « Photo retravaillée avec l'IA » sera apposé.",
                  [
                    { label: 'Oui', value: 'oui' },
                    { label: 'Non', value: 'non', variant: 'primary' },
                  ],
                )
                .then((value) => onAiRetouchedChange?.(value === 'oui'));
            }
          }}
        />
      )}

      {!readOnly && (
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/avif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void ingest(file);
            e.target.value = '';
          }}
        />
      )}
    </div>
  );
}
