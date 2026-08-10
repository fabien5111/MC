'use client';

// Rangée défilante horizontale — utilisée par « Chez les pâtissiers que vous
// suivez » et « Dernières créations » (cf. README du handoff « Les rangées
// défilantes »).
//
// Trois cartes visibles au bureau, deux sous 900 px, une sous 640 px (85 %
// de large, pour laisser deviner la suivante) — cf. les classes posées sur
// chaque enfant par l'appelant (`ROW_CARD` ci-dessous, exporté pour ça).
//
// Deux détails du README ne sont pas négociables :
//  - `scroll-snap-type: x proximity`, jamais `mandatory` : `mandatory`
//    interromprait un défilement démarré par les flèches avant qu'il
//    n'atteigne sa cible.
//  - Le défilement des flèches se fait par affectation directe de
//    `scrollLeft`, jamais `scrollBy({behavior:'smooth'})` — testé dans la
//    maquette, l'animation native est annulée par l'accrochage.
// Pas de bouton « Charger plus » sous une rangée défilante : ça ferait
// doublon avec le défilement lui-même.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';

// Classes à poser sur chaque carte enfant pour qu'elle respecte la largeur
// attendue à chaque palier — un seul endroit à changer si les paliers
// évoluent, plutôt que de les recopier dans chaque grille appelante.
export const ROW_CARD = 'flex-[0_0_85%] min-w-0 sm:flex-[0_0_calc((100%-32px)/2)] sm:min-w-[280px] row:flex-[0_0_calc((100%-64px)/3)]';

export function RailSection({
  title,
  viewAllHref,
  viewAllLabel,
  children,
}: {
  title: string;
  viewAllHref: string;
  viewAllLabel: string;
  children: ReactNode;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const updateEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    updateEdges();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
    };
  }, [updateEdges]);

  function scroll(dir: 1 | -1) {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-row-card]');
    const step = card ? card.getBoundingClientRect().width + 32 : el.clientWidth;
    el.scrollLeft += step * dir;
  }

  return (
    <section className="mb-16">
      <div className="flex items-end justify-between gap-4 border-b border-outline-variant pb-4 mb-8">
        <div>
          <h2 className="font-headline-lg text-headline-lg text-primary">{title}</h2>
          <div className="h-1 w-12 bg-secondary mt-1.5" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => scroll(-1)}
            disabled={atStart}
            aria-label="Précédent"
            className="w-9 h-9 rounded-full border border-outline-variant flex items-center justify-center text-primary hover:bg-surface-container transition-colors disabled:opacity-30 disabled:cursor-default"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            disabled={atEnd}
            aria-label="Suivant"
            className="w-9 h-9 rounded-full border border-outline-variant flex items-center justify-center text-primary hover:bg-surface-container transition-colors disabled:opacity-30 disabled:cursor-default"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
          <Link href={viewAllHref} className="font-label-md text-label-md text-secondary hover:text-primary whitespace-nowrap shrink-0 ml-1">
            {viewAllLabel}
          </Link>
        </div>
      </div>
      <div
        ref={trackRef}
        className="flex gap-8 overflow-x-auto pb-1.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden motion-safe:[scroll-snap-type:x_proximity]"
      >
        {children}
      </div>
    </section>
  );
}
