'use client';

// Tooltip unique du rail de navigation (components/recipe/RecipeToc.tsx),
// monté une fois au <body> via un portail React et repositionné en JS.
//
// Le rail replié fait 58px de large avec `overflow:hidden` (nécessaire au
// défilement interne de la liste de sections) : un tooltip positionné en CSS
// pur sur le bouton serait rogné par cet overflow. Le contourner suppose de
// sortir le tooltip du rail — d'où le portail en `position:fixed`, mesuré à
// chaque survol/focus via `getBoundingClientRect()`.
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

type TooltipState = { text: string; top: number; left: number };

export function useRailTooltip() {
  const [tip, setTip] = useState<TooltipState | null>(null);

  const show = useCallback((el: HTMLElement, text: string) => {
    const r = el.getBoundingClientRect();
    setTip({ text, top: r.top + r.height / 2, left: r.right + 8 });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  // Un redimensionnement peut déplacer le bouton (le rail est centré
  // verticalement à `top: 50%`) : la position mesurée au survol devient
  // fausse sans qu'aucun mouseleave ne se déclenche pour la corriger.
  useEffect(() => {
    if (!tip) return;
    window.addEventListener('resize', hide);
    return () => window.removeEventListener('resize', hide);
  }, [tip, hide]);

  const node =
    tip &&
    createPortal(
      <div
        role="tooltip"
        className="recipe-toc-tooltip"
        style={{ top: tip.top, left: tip.left }}
      >
        {tip.text}
      </div>,
      document.body,
    );

  return { show, hide, node };
}
