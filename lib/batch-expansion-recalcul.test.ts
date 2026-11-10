import { describe, expect, it } from 'vitest';
import { planifierRecalculAmont } from './batch-expansion-recalcul';
import type { BatchFull } from './recipe-plan';

// Praliné remplacé par une recette : utilisé dans les étapes 1 et 2 (100 g
// chacune), fabriqué par l'étape 3 (noisettes 120 g, sucre 80 g — ×2).
function fournee(enAmont: number[]): BatchFull {
  const praline = (id: number, step: number) => ({
    id, name: 'Praliné', quantity: 100, unit: 'g', batch_step_id: step, expanded_into_recipe_id: 'r1', removed: false, excluded_when_done: true,
  });
  return {
    batch_steps: [
      { id: 1, fait_en_amont: enAmont.includes(1), source_ingredient_id: null },
      { id: 2, fait_en_amont: enAmont.includes(2), source_ingredient_id: null },
      { id: 3, fait_en_amont: false, source_ingredient_id: 10 },
    ],
    batch_ingredients: [
      praline(10, 1),
      praline(11, 2),
      { id: 20, name: 'Noisettes', quantity: enAmont.length ? 60 : 120, unit: 'g', batch_step_id: 3, expanded_into_recipe_id: null, removed: false, excluded_when_done: true },
      { id: 21, name: 'Sucre', quantity: enAmont.length ? 40 : 80, unit: 'g', batch_step_id: 3, expanded_into_recipe_id: null, removed: false, excluded_when_done: true },
    ],
  } as unknown as BatchFull;
}

describe('planifierRecalculAmont', () => {
  it('une utilisation passe « en amont » : la sous-recette est réduite dans le même rapport', () => {
    const plan = planifierRecalculAmont(fournee([]), 1, true);
    expect(plan.expansions).toHaveLength(1);
    expect([plan.expansions[0].besoinAvant, plan.expansions[0].besoinApres]).toEqual([200, 100]);
    expect(plan.ecritures).toEqual([{ id: 20, quantity: 60 }, { id: 21, quantity: 40 }]);
    expect(plan.confirmation).toContain('200 g → 100 g');
  });

  it('décocher rétablit les quantités', () => {
    const plan = planifierRecalculAmont(fournee([1]), 1, false);
    expect(plan.ecritures).toEqual([{ id: 20, quantity: 120 }, { id: 21, quantity: 80 }]);
  });

  it('toutes les utilisations en amont : rien n’est écrit, avertissement', () => {
    const plan = planifierRecalculAmont(fournee([1]), 2, true);
    expect(plan.expansions[0].statut).toBe('plus-rien');
    expect(plan.ecritures).toEqual([]);
    expect(plan.confirmation).toContain('plus rien à fabriquer');
  });

  it('retour depuis « plus rien » : rapport indéfini, rien n’est écrit', () => {
    const plan = planifierRecalculAmont(fournee([1, 2]), 2, false);
    expect(plan.expansions[0].statut).toBe('sans-reference');
    expect(plan.ecritures).toEqual([]);
  });

  it('une étape sans utilisation du remplacement ne déclenche rien', () => {
    const plan = planifierRecalculAmont(fournee([]), 3, true);
    expect(plan.expansions).toEqual([]);
    expect(plan.confirmation).toBeNull();
  });

  it('une ligne décochée pour être gardée compte toujours dans le besoin', () => {
    const b = fournee([]);
    (b.batch_ingredients[0] as { excluded_when_done: boolean }).excluded_when_done = false;
    // L'étape 1 passe en amont mais le praliné y est gardé : le besoin ne change pas.
    expect(planifierRecalculAmont(b, 1, true).confirmation).toBeNull();
  });
});
