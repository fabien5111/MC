'use client';

// Modale d'édition d'une photo déjà déposée dans un `ImageSlot` : zoom,
// rotation (pas de 90°) et repositionnement dans le cadre cible (16:9 pour la
// photo principale, carré pour les photos d'étape). L'aperçu interactif se
// fait en CSS (transform sur l'<img>, pas de canvas) pour rester fluide au
// doigt ; à la validation, la même transformation est rejouée sur un canvas
// par `cropRotateImageToDataUrl` (lib/images.ts) pour produire la data-URL
// finale — les deux calculs partagent `coverScale`/`rotatedDims` pour rester
// identiques.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { coverScale, cropRotateImageToDataUrl, rotatedDims, type Rotation90 } from '@/lib/images';

const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function PhotoEditorModal({
  src,
  aspectRatio,
  maxWidth,
  mime = 'image/jpeg',
  onCancel,
  onSave,
}: {
  src: string;
  /** Rapport largeur/hauteur du cadre cible (16/9 pour le hero, 1 pour une photo d'étape). */
  aspectRatio: number;
  maxWidth: number;
  mime?: 'image/jpeg' | 'image/webp';
  onCancel: () => void;
  onSave: (dataUrl: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [rotation, setRotation] = useState<Rotation90>(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setFrameSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const baseScale = useMemo(() => {
    if (!natural || !frameSize.w || !frameSize.h) return 1;
    const eff = rotatedDims(natural.w, natural.h, rotation);
    return coverScale(eff.w, eff.h, frameSize.w, frameSize.h);
  }, [natural, frameSize, rotation]);

  const renderedScale = baseScale * zoom;

  // Recadre l'offset dans les bornes valides après un changement de zoom, de
  // rotation (qui échange largeur/hauteur) ou de mesure du cadre.
  useEffect(() => {
    if (!natural) return;
    const eff = rotatedDims(natural.w, natural.h, rotation);
    const maxX = Math.max(0, (eff.w * renderedScale - frameSize.w) / 2);
    const maxY = Math.max(0, (eff.h * renderedScale - frameSize.h) / 2);
    setOffset((prev) => ({ x: clamp(prev.x, -maxX, maxX), y: clamp(prev.y, -maxY, maxY) }));
  }, [natural, renderedScale, rotation, frameSize.w, frameSize.h]);

  // Ref (pas de state) pour le suivi des pointeurs actifs : un doigt = glisser,
  // deux doigts = pincer/zoomer ; pas besoin de déclencher de rendu par frame.
  const dragRef = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    pinchStartDist: 0,
    pinchStartZoom: 1,
  });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const d = dragRef.current;
    d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (d.pointers.size === 2) {
      const pts = Array.from(d.pointers.values());
      d.pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      d.pinchStartZoom = zoom;
    }
  }, [zoom]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    const prev = d.pointers.get(e.pointerId);
    if (!prev) return;
    d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (d.pointers.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
    } else if (d.pointers.size === 2 && d.pinchStartDist > 0) {
      const pts = Array.from(d.pointers.values());
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      setZoom(clamp((d.pinchStartZoom * dist) / d.pinchStartDist, 1, MAX_ZOOM));
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    d.pointers.delete(e.pointerId);
    if (d.pointers.size < 2) d.pinchStartDist = 0;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => clamp(z - e.deltaY * 0.0015, 1, MAX_ZOOM));
  }, []);

  const rotate = useCallback((dir: 1 | -1) => {
    setRotation((r) => ((r + dir * 90 + 360) % 360) as Rotation90);
  }, []);

  const reset = useCallback(() => {
    setRotation(0);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const save = useCallback(async () => {
    if (!natural || !frameSize.w || !frameSize.h) return;
    setSaving(true);
    try {
      const dataUrl = await cropRotateImageToDataUrl(
        src,
        { rotation, zoom, offsetX: offset.x, offsetY: offset.y, frameWidth: frameSize.w, frameHeight: frameSize.h },
        maxWidth,
        aspectRatio,
        mime,
      );
      onSave(dataUrl);
    } finally {
      setSaving(false);
    }
  }, [natural, frameSize, src, rotation, zoom, offset, maxWidth, aspectRatio, mime, onSave]);

  const iconBtn = 'w-10 h-10 rounded-full bg-surface-container text-on-surface flex items-center justify-center hover:bg-surface-container-high transition-colors';

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-background/70 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        // Toujours stoppée : la modale est un descendant DOM du conteneur
        // cliquable d'ImageSlot (le `position: fixed` ne change pas l'arbre
        // React/DOM), qui ouvrirait sinon le sélecteur de fichier derrière.
        e.stopPropagation();
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-lg bg-surface-container-low border border-outline-variant rounded-xl p-5 shadow-lg">
        <p className="font-title-md text-title-md text-on-surface mb-4">Ajuster la photo</p>

        <div
          ref={frameRef}
          className="relative mx-auto w-full overflow-hidden rounded-lg bg-black touch-none select-none"
          style={{ aspectRatio: String(aspectRatio), maxWidth: 480 }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
        >
          {natural && (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL, positionnement piloté par transform CSS
            <img
              src={src}
              alt=""
              draggable={false}
              className="absolute top-1/2 left-1/2 max-w-none pointer-events-none"
              style={{
                width: natural.w,
                height: natural.h,
                marginLeft: -natural.w / 2,
                marginTop: -natural.h / 2,
                transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${renderedScale})`,
                transformOrigin: 'center center',
              }}
            />
          )}
        </div>

        <div className="flex items-center justify-center gap-2 mt-4">
          <button type="button" onClick={() => rotate(-1)} title="Pivoter à gauche" className={iconBtn}>
            <span className="material-symbols-outlined text-[20px]">rotate_left</span>
          </button>
          <button type="button" onClick={() => rotate(1)} title="Pivoter à droite" className={iconBtn}>
            <span className="material-symbols-outlined text-[20px]">rotate_right</span>
          </button>
          <button type="button" onClick={() => setZoom((z) => clamp(z - ZOOM_STEP, 1, MAX_ZOOM))} title="Dézoomer" className={iconBtn}>
            <span className="material-symbols-outlined text-[20px]">zoom_out</span>
          </button>
          <button type="button" onClick={() => setZoom((z) => clamp(z + ZOOM_STEP, 1, MAX_ZOOM))} title="Zoomer" className={iconBtn}>
            <span className="material-symbols-outlined text-[20px]">zoom_in</span>
          </button>
          <button type="button" onClick={reset} title="Réinitialiser" className={iconBtn}>
            <span className="material-symbols-outlined text-[20px]">restart_alt</span>
          </button>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !natural}
            className="px-5 py-2 rounded-full font-label-md text-label-md bg-primary text-on-primary hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
