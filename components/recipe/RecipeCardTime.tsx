// Temps d'une carte recette (JEP-19) : préparation, total entre parenthèses,
// puis le picto « se prépare à l'avance » quand une étape le permet. Rendu pur,
// partagé par les trois cartes (RecipeCardLayout, MineCard, OtherCard) — c'est
// parce que chacune affichait son temps à sa façon que le picto avait d'abord
// manqué au carnet.
import { effectiveTimes, peutSePreparerAvance, tempsCarte } from '@/lib/recipe-view';

type Recette = Parameters<typeof effectiveTimes>[0] & Parameters<typeof peutSePreparerAvance>[0];

export function RecipeCardTime({ recipe }: { recipe: Recette }) {
  const temps = tempsCarte(effectiveTimes(recipe));
  const avance = peutSePreparerAvance(recipe);
  if (!temps && !avance) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-on-surface-variant">
      {temps && <span title={temps.titre}>{temps.texte}</span>}
      {/* Picto seul, l'explication est dans l'infobulle : la ligne est déjà
          serrée (difficulté, type, temps). */}
      {avance && (
        <span
          className="material-symbols-outlined text-[13px] leading-none text-primary"
          title="Certaines étapes peuvent être préparées à l'avance"
          aria-label="Certaines étapes peuvent être préparées à l'avance"
          role="img"
        >
          event_upcoming
        </span>
      )}
    </span>
  );
}
