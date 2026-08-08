'use client';

// Feuille remontante partagée (« bottom sheet »).
//
// Deux tiroirs du produit reposent dessus : les critères de la recherche
// avancée (< 1024 px) et le sommaire de la fiche recette (< 701 px). Écrire la
// mécanique deux fois aurait donné deux feuilles divergentes — une seule sait
// piéger le focus, une seule pense à lever le verrou de défilement — pour un
// contenu qui, lui, n'a rien de commun. Seul le contenant est mutualisé.
//
// Ce que la feuille prend en charge, et que l'appelant n'a donc pas à refaire :
//  - le voile, la translation d'ouverture et `prefers-reduced-motion`
//    (cf. `.bottom-sheet` dans app/globals.css) ;
//  - le verrou de défilement de la page derrière la feuille ;
//  - la fermeture par le voile et par `Échap` ;
//  - le piège à focus, et la restitution du focus à l'élément déclencheur ;
//  - la mise hors d'atteinte du contenu quand la feuille est fermée (`inert`) :
//    la feuille reste montée pour pouvoir s'animer, mais ses commandes ne
//    doivent être ni tabulables ni annoncées.
//
// Ce qu'elle ne fait pas : le glissement vers le bas pour fermer. Le voile,
// `Échap` et le déclencheur suffisent, et un glissement se dispute le geste
// avec le défilement interne du contenu — à reprendre le jour où le besoin est
// avéré, ici pour les deux tiroirs à la fois.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

// Point de bascule au-dessus duquel la feuille n'a plus lieu d'être. Les deux
// expressions du même seuil (classe Tailwind pour le masquage, media query pour
// l'état) sont écrites côte à côte : c'est le seul endroit où elles doivent
// rester d'accord.
const BREAKPOINTS = {
  // Recherche avancée : au-dessus, les critères sont une colonne persistante.
  lg: { hide: 'lg:hidden', query: '(min-width: 1024px)' },
  // Sommaire de recette : au-dessus, c'est le rail latéral (`.recipe-toc`).
  rail: { hide: 'rail:hidden', query: '(min-width: 701px)' },
} as const;

export type BottomSheetBreakpoint = keyof typeof BREAKPOINTS;

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  open: boolean;
  // Appelé pour toute demande de fermeture (voile, Échap, passage au-dessus du
  // point de bascule). L'appelant reste maître de son état.
  onClose: () => void;
  // Point de bascule : la feuille est masquée au-dessus, et se referme d'elle
  // même en y passant — sans quoi son verrou de défilement figerait une page
  // où plus aucun tiroir n'est visible.
  breakpoint: BottomSheetBreakpoint;
  // `aria-label` du dialogue.
  label: string;
  // Classes de la feuille elle-même — sa hauteur, essentiellement.
  sheetClassName?: string;
  // Posé sur la feuille, pour l'`aria-controls` du bouton qui l'ouvre.
  id?: string;
  children: ReactNode;
};

export function BottomSheet({ open, onClose, breakpoint, label, sheetClassName = '', id, children }: Props) {
  const { hide, query } = BREAKPOINTS[breakpoint];
  const sheetRef = useRef<HTMLDivElement>(null);
  // Ref plutôt que dépendance d'effet : les appelants passent une lambda,
  // recréée à chaque rendu. En dépendance, l'effet se rejouerait sans cesse —
  // reposant le verrou de défilement et volant le focus à chaque frappe.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const [wide, setWide] = useState(false);
  const active = open && !wide;

  useEffect(() => {
    const mq = window.matchMedia(query);
    const apply = () => {
      setWide(mq.matches);
      if (mq.matches) closeRef.current();
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [query]);

  const focusables = useCallback(() => {
    const node = sheetRef.current;
    if (!node) return [] as HTMLElement[];
    // `offsetParent` nul = élément non rendu (section repliée, `display:none`) :
    // le piège doit suivre ce qui est réellement atteignable.
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  }, []);

  useEffect(() => {
    if (!active) return;
    const node = sheetRef.current;
    if (!node) return;

    const restoreTo = document.activeElement as HTMLElement | null;
    // On donne le focus au dialogue lui-même, pas à sa première commande :
    // focaliser un élément le ramène dans le champ de vision, ce qui
    // défilerait la liste interne — or le sommaire vient précisément d'y
    // positionner la section courante. `preventScroll` pour la même raison.
    node.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      // `node` compte comme « avant le premier » : c'est lui qui a le focus
      // quand la feuille n'a pas encore été parcourue.
      if (e.shiftKey && (current === first || current === node)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      // Le verrou est levé pendant le commit React, donc avant tout
      // `requestAnimationFrame` posté par l'appelant au même moment : un
      // défilement demandé à la fermeture (cf. le sommaire, qui ferme puis
      // rejoint la section) part sur une page à nouveau défilable.
      document.body.style.overflow = previousOverflow;
      restoreTo?.focus?.({ preventScroll: true });
    };
  }, [active, focusables]);

  return (
    // `no-print` : une feuille remontante n'a rien à faire sur une impression,
    // quelle que soit la largeur de la page au moment où elle est lancée.
    <div className={`${hide} no-print fixed inset-0 z-[60] ${active ? '' : 'pointer-events-none'}`}>
      <div className="bottom-sheet-scrim absolute inset-0 bg-black/45" data-open={active} onClick={() => onClose()} />
      <div
        ref={sheetRef}
        id={id}
        className={`bottom-sheet absolute left-0 right-0 bottom-0 bg-surface rounded-t-[22px] shadow-2xl flex flex-col ${sheetClassName}`}
        data-open={active}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        // `tabIndex` : cible de repli du piège à focus quand la feuille ne
        // contient aucune commande atteignable.
        tabIndex={-1}
        inert={!active}
      >
        {/* Poignée de préhension, purement indicative (le glissement n'est pas
            implémenté) : elle dit « ceci est une feuille » et rien d'autre.
            40 × 4 px, la mesure déjà en place sur le tiroir de recherche. */}
        <div className="pt-3 pb-1 flex justify-center shrink-0">
          <span className="w-10 h-1 rounded-full bg-outline-variant" />
        </div>
        {children}
      </div>
    </div>
  );
}
