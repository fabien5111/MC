'use client';

// Remplaçant React du web component <image-slot> (image-slot.js).
// Le scaffold vanilla persistait dans un sidecar JSON (outil de design) ;
// ici, en production, l'utilisateur dépose/choisit une image, on la compresse
// en data-URL et on la remonte via onChange — au parent de la persister
// (profiles.avatar_url, recipes.hero_image_url…).
import { useCallback, useId, useRef, useState } from 'react';
import { isAcceptedImage, resizeImageToDataUrl } from '@/lib/images';

type Shape = 'rect' | 'rounded' | 'circle' | 'pill';

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
  shape?: Shape;
  fit?: 'cover' | 'contain' | 'fill';
  placeholder?: string;
  alt?: string;
  /** Largeur max de compression (px). Avatar : 400 ; bannière/hero : 1400. */
  maxWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Pastille crayon superposée (porté de profil.html : bannière/avatar). */
  editTitle?: string;
  editButtonClassName?: string;
};

export function ImageSlot({
  src,
  onChange,
  shape = 'rounded',
  fit = 'cover',
  placeholder = 'Déposez une image',
  alt = '',
  maxWidth = 1400,
  className = '',
  style,
  editTitle,
  editButtonClassName = 'bottom-3 right-3 w-9 h-9',
}: ImageSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
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
        const dataUrl = await resizeImageToDataUrl(file, maxWidth);
        onChange?.(dataUrl);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [maxWidth, onChange],
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
      ) : (
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
