'use client';

// Flèches « monter / descendre » d'une ligne réordonnable, sur appareil tactile.
//
// Le glisser par la poignée ne marche pas au doigt sur iPad (Safari prend
// l'appui long pour une sélection de texte, le geste est annulé avant tout
// déplacement). Sur un écran tactile (`pointer: coarse`) la poignée est donc
// masquée au profit de ces deux boutons ; à la souris, rien ne change : la
// poignée et son glisser-déposer natif restent seuls.
export function FlechesDeplacement({
  index,
  count,
  onMove,
  label = 'cette ligne',
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  label?: string;
}) {
  if (count < 2) return null;
  const bouton =
    'flex h-9 w-9 items-center justify-center rounded-full text-secondary active:bg-surface-container-high disabled:opacity-30';
  return (
    <span className="no-print hidden shrink-0 flex-col [@media(pointer:coarse)]:!flex">
      <button type="button" disabled={index <= 0} onClick={() => onMove(index, index - 1)} title={`Monter ${label}`} aria-label={`Monter ${label}`} className={bouton}>
        <span className="material-symbols-outlined text-[22px]">arrow_upward</span>
      </button>
      <button type="button" disabled={index >= count - 1} onClick={() => onMove(index, index + 1)} title={`Descendre ${label}`} aria-label={`Descendre ${label}`} className={bouton}>
        <span className="material-symbols-outlined text-[22px]">arrow_downward</span>
      </button>
    </span>
  );
}
