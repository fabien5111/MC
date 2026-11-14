'use client';

// Remplaçant React du web component <image-slot> (image-slot.js).
// Le scaffold vanilla persistait dans un sidecar JSON (outil de design) ;
// ici, en production, l'utilisateur dépose/choisit une image, on la compresse
// en data-URL et on la remonte via onChange — au parent de la persister
// (profiles.avatar_url, recipes.hero_image_url…).
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { isAcceptedImage, resizeImageToDataUrl } from '@/lib/images';
import { PHOTO_REORDER_DND_TYPE } from '@/lib/photo-reorder';
import { AiPhotoBadge } from '@/components/AiPhotoBadge';
import { PhotoEditorModal } from '@/components/PhotoEditorModal';
import { useDialog } from '@/components/Dialog';
import { DepuisStockage } from '@/components/stockage/DepuisStockage';
import { BoutonColler } from '@/components/BoutonColler';
import { rafraichirPressePapiers } from '@/lib/presse-papiers-client';
import { imagesDuPressePapiers, cibleEditable } from '@/lib/presse-papiers';

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
  /**
   * Reçoit tous les fichiers d'une sélection ou d'un dépôt groupé de
   * *plusieurs* fichiers (choix multiple dans le sélecteur système, ou dépôt
   * de plusieurs fichiers à la fois) — cet emplacement n'affichant qu'une
   * seule photo, c'est au parent de répartir le reste sur d'autres
   * emplacements de sa grille (cf. grilles de photos d'étape / d'avis). Une
   * sélection ou un dépôt d'un seul fichier suit toujours le chemin normal
   * (compression puis, si `aspectRatio` est fourni, recadrage), même quand
   * cette prop est renseignée. Sa seule présence active aussi la sélection
   * multiple dans le sélecteur de fichiers du système.
   */
  onFilesAdded?: (files: File[]) => void;
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
  onFilesAdded,
}: ImageSlotProps) {
  const dialog = useDialog();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(false);
  const readOnly = !onChange;
  const racineRef = useRef<HTMLDivElement>(null);
  const survole = useRef(false);

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

  // Plusieurs fichiers reçus d'un coup (sélection multiple, stockage en ligne,
  // collage) : même règle que le sélecteur de l'appareil.
  const recevoir = useCallback(
    (files: File[]) => {
      if (files.length > 1 && onFilesAdded) {
        onFilesAdded(files);
        return;
      }
      const file = files[0];
      if (file) void ingest(file);
    },
    [ingest, onFilesAdded],
  );

  // Coller une image (Ctrl+V / Cmd+V, JEP-408) dans l'emplacement survolé ou
  // qui a le focus. Ouvert à tous les plans : ce n'est pas un stockage en
  // ligne. Ignoré quand on colle dans un champ de saisie, et quand le
  // presse-papiers ne porte pas d'image (le collage suit alors son cours).
  useEffect(() => {
    if (readOnly) return;
    const coller = (e: ClipboardEvent) => {
      const racine = racineRef.current;
      if (!racine || cibleEditable(e.target)) return;
      const actif = racine.contains(document.activeElement);
      if (!actif && !survole.current) return;
      const images = imagesDuPressePapiers(e.clipboardData);
      if (!images.length) return;
      e.preventDefault();
      recevoir(images);
    };
    document.addEventListener('paste', coller);
    return () => document.removeEventListener('paste', coller);
  }, [readOnly, recevoir]);

  const radius = SHAPE_RADIUS[shape];

  return (
    <div
      ref={racineRef}
      tabIndex={readOnly ? undefined : 0}
      onPointerEnter={() => {
        survole.current = true;
        // Un survol relit le presse-papiers : le bouton « Coller » se met à
        // jour si une image vient d'être copiée (cf. lib/presse-papiers-client).
        void rafraichirPressePapiers();
      }}
      onPointerLeave={() => {
        survole.current = false;
      }}
      onKeyDown={
        readOnly
          ? undefined
          : (e) => {
              if (e.target !== e.currentTarget) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }
      }
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
              // Un glissement de réordonnancement (grille de photos d'étape/
              // d'avis, cf. `usePhotoDragReorder`) traverse forcément un
              // emplacement pour atteindre un autre : le halo de survol
              // propre à *ce* dépôt (bank/fichier) n'a pas à s'allumer, la
              // grille appelante affiche déjà le sien.
              if (e.dataTransfer.types.includes(PHOTO_REORDER_DND_TYPE)) return;
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
              recevoir(Array.from(e.dataTransfer.files || []));
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

      {!readOnly && !busy && shape !== 'circle' && shape !== 'pill' && (
        // Coller (ouvert à tous) et stockage en ligne (Plus et Pro) : deux
        // pastilles côte à côte, en haut à gauche. Pas sur les emplacements
        // ronds (avatar) : deux pastilles y recouvriraient la photo. Chacune
        // s'efface d'elle-même quand elle n'a pas lieu d'être (pas d'image
        // copiée, pas de source configurée, pas de fournisseur de contexte).
        <div className="absolute top-2 left-2 z-20 flex gap-2">
          <BoutonColler variante="pastille" onFichiers={recevoir} />
          <DepuisStockage
            usage="image"
            max={onFilesAdded ? 8 : 1}
            variante="pastille"
            onFichiers={recevoir}
          />
        </div>
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
          multiple={!!onFilesAdded}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = '';
            recevoir(files);
          }}
        />
      )}
    </div>
  );
}
