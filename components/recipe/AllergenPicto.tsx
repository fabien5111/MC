// Picto d'allergène individuel, avec infobulle tactile (Popover API native) :
// le `title` HTML dont dépendait l'affichage du libellé ne se déclenche
// jamais sur mobile (pas de survol). Le popover s'ouvre au tap et se ferme au
// tap ailleurs (comportement natif « auto »), sans dépendance ni état React.
// Élément top-layer : il ne peut pas s'ancrer via un parent `position:
// relative`, d'où le repositionnement manuel (au clic, avant l'ouverture)
// sur les coordonnées du bouton.
//
// Invocation IMPÉRATIVE (togglePopover), pas l'attribut déclaratif
// `popoverTarget` : sur une carte recette, ce picto est rendu à l'intérieur
// du `<Link>` vers la fiche (RecipeCardLayout) — sans `preventDefault` sur le
// clic, le tap ouvrirait le popover ET naviguerait vers la recette. Or
// `preventDefault` annule aussi l'action par défaut du bouton lui-même :
// avec `popoverTarget`, ce serait le popover qui ne s'ouvrirait plus jamais
// (même drapeau `defaultPrevented`, sur le même clic). L'appel manuel à
// `togglePopover()` est indépendant de ce drapeau.
'use client';

import { useId, useRef } from 'react';

export function AllergenPicto({
  name,
  picto,
  iconClassName,
}: {
  name: string;
  picto: string;
  iconClassName: string;
}) {
  const popoverId = `allergen-popover-${useId()}`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect();
    pop.style.left = `${rect.left + rect.width / 2}px`;
    pop.style.top = `${rect.bottom + 6}px`;
    pop.togglePopover();
  }

  return (
    <span className="flex flex-col items-center gap-0.5">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={name}
        aria-describedby={popoverId}
        className={`${iconClassName} block appearance-none border-0 bg-transparent p-0 cursor-pointer`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL stockée en base */}
        <img src={picto} alt={name} title={name} className="w-full h-full object-contain" />
      </button>
      <div
        ref={popRef}
        id={popoverId}
        popover="auto"
        role="tooltip"
        className="inset-auto m-0 -translate-x-1/2 rounded-md border-0 bg-inverse-surface px-2 py-1 text-xs text-inverse-on-surface shadow-md"
      >
        {name}
      </div>
      {/* Libellé absent à l'écran (le nom est déjà dans le popover, au tap)
          mais indispensable au papier, où ni le tap ni le survol n'existent —
          même principe que la fiche recette. */}
      <span className="hidden print:block text-[9px] text-on-surface-variant">{name}</span>
    </span>
  );
}
