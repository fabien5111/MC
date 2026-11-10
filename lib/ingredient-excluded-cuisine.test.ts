import { describe, expect, it } from 'vitest';
import { batchIngredientExcluCuisine, batchIngredientExcluded } from './recipe-plan';

const etape = (done: boolean) => ({ done, replaced_by_recipe_id: null });
const ligne = (over: Record<string, unknown> = {}) => ({ removed: false, excluded_when_done: true, expanded_into_recipe_id: null, ...over });

describe('batchIngredientExcluCuisine', () => {
  it('un ingrédient remplacé reste à incorporer tant que l’étape n’est pas réalisée', () => {
    const praline = ligne({ expanded_into_recipe_id: 'r1' });
    expect(batchIngredientExcluCuisine(etape(false), praline)).toBe(false);
    // Les courses, elles, l’écartent toujours.
    expect(batchIngredientExcluded(etape(false), praline)).toBe(true);
  });

  it('un ingrédient remplacé sort avec son étape réalisée', () => {
    expect(batchIngredientExcluCuisine(etape(true), ligne({ expanded_into_recipe_id: 'r1' }))).toBe(true);
  });

  it('un ingrédient remplacé mais gardé reste à cocher dans une étape réalisée', () => {
    expect(batchIngredientExcluCuisine(etape(true), ligne({ expanded_into_recipe_id: 'r1', excluded_when_done: false }))).toBe(false);
  });

  it('une ligne retirée à la main reste exclue', () => {
    expect(batchIngredientExcluCuisine(etape(false), ligne({ removed: true }))).toBe(true);
  });
});
