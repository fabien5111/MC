'use client';

// Badge d'ingrédient de la recherche avancée.
//
// Le code couleur porte à lui seul le sens du critère : vert = doit être
// présent, rouge barré = doit être absent. C'est ce qui permet d'afficher les
// deux modes côte à côte dans le rappel des critères actifs sans les
// étiqueter un par un. Les couleurs sont des tokens du thème
// (`ingredient-include-*` / `ingredient-exclude-*`), pas des valeurs en dur.
import type { IngredientMode } from '@/lib/search-params';

export function IngredientBadge({
  label,
  mode,
  onRemove,
  size = 'md',
}: {
  label: string;
  mode: IngredientMode;
  onRemove?: () => void;
  size?: 'sm' | 'md';
}) {
  const tone =
    mode === 'inc'
      ? 'bg-ingredient-include text-ingredient-include-text border-ingredient-include-border'
      : 'bg-ingredient-exclude text-ingredient-exclude-text border-ingredient-exclude-border line-through decoration-[1.5px]';

  return (
    <span
      className={`inline-flex items-center gap-1 border rounded-full ${tone} ${
        size === 'sm' ? 'text-[11.5px] px-2 py-1' : 'text-[12.5px] px-3 py-1.5'
      }`}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer ${label}`}
          className="material-symbols-outlined text-[15px] no-underline hover:opacity-60 transition-opacity"
        >
          close
        </button>
      )}
    </span>
  );
}
