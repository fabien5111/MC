'use client';

// Contenu réduit à sa première ligne, « Tout afficher » pour le reste.
// Le bouton n'apparaît que si le contenu dépasse réellement une ligne (mesuré,
// et remesuré quand le contenu ou la largeur change). Sert au bloc « Ma note »
// et aux retours de fournée de la vue « une étape à la fois ».
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function ReplieUneLigne({
  children,
  // Hauteur de la première ligne visible, en pixels.
  hauteur = 24,
  className = '',
  libelle = 'Tout afficher',
}: {
  children: ReactNode;
  hauteur?: number;
  className?: string;
  libelle?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [deborde, setDeborde] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || ouvert) return;
    const mesurer = () => setDeborde(el.scrollHeight > el.clientHeight + 1);
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    return () => ro.disconnect();
  }, [ouvert, children]);

  return (
    <div className={`flex items-start gap-2 empty:hidden ${ouvert ? 'flex-col' : ''} ${className}`}>
      <div ref={ref} className={`min-w-0 flex-1 ${ouvert ? 'w-full' : 'overflow-hidden'}`} style={ouvert ? undefined : { maxHeight: hauteur }}>
        {children}
      </div>
      {(deborde || ouvert) && (
        <button
          type="button"
          aria-expanded={ouvert}
          onClick={() => setOuvert((o) => !o)}
          className={`no-print shrink-0 font-label-md text-[13px] text-primary underline underline-offset-2 ${ouvert ? 'self-end' : ''}`}
          style={ouvert ? undefined : { lineHeight: `${hauteur}px` }}
        >
          {ouvert ? 'Réduire' : `… ${libelle}`}
        </button>
      )}
    </div>
  );
}
