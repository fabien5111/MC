import { describe, expect, it } from 'vitest';
import { etapeDuJalon, etapeInitiale, etapesOrdonnees, etapeTerminee, ingredientsEtapeCuisine } from '@/lib/patisser-focus';
import type { BatchIngredientRow, BatchJalon, BatchStepRow, BatchSubstepRow } from '@/lib/recipe-plan';

type Etape = BatchStepRow & { batch_substeps: BatchSubstepRow[] };

const sous = (id: number, p: Partial<BatchSubstepRow> = {}) =>
  ({ id, done: false, excluded_when_done: true, order_index: id, texte: 's' + id, ...p }) as BatchSubstepRow;
const etape = (id: number, p: Partial<Etape> = {}) =>
  ({ id, done: false, replaced_by_recipe_id: null, day_offset: 0, order_index: id, batch_substeps: [], ...p }) as Etape;
const ing = (id: number, stepId: number, p: Partial<BatchIngredientRow> = {}) =>
  ({ id, batch_step_id: stepId, done: false, removed: false, excluded_when_done: true, expanded_into_recipe_id: null, ...p }) as BatchIngredientRow;

describe('ingredientsEtapeCuisine', () => {
  it('écarte les lignes retirées à la main et celles des autres étapes', () => {
    const batch = { batch_ingredients: [ing(1, 10), ing(2, 10, { removed: true }), ing(3, 11)] };
    expect(ingredientsEtapeCuisine(batch, etape(10)).map((i) => i.id)).toEqual([1]);
  });
  it("ne rend rien pour une étape remplacée par une recette", () => {
    const batch = { batch_ingredients: [ing(1, 10)] };
    expect(ingredientsEtapeCuisine(batch, etape(10, { replaced_by_recipe_id: 'r' } as Partial<Etape>))).toEqual([]);
  });
});

describe('etapeTerminee', () => {
  it("est fausse tant que l'étape n'est pas cochée, même si tout est coché", () => {
    expect(etapeTerminee(etape(1, { batch_substeps: [sous(1, { done: true })] }), [ing(1, 1, { done: true })])).toBe(false);
  });
  it('est vraie pour une étape cochée dont tout est exclu par « déjà réalisée »', () => {
    expect(etapeTerminee(etape(1, { done: true, batch_substeps: [sous(1)] }), [ing(1, 1)])).toBe(true);
  });
  it('reste fausse quand une ligne gardée (exclusion décochée) reste à faire', () => {
    expect(etapeTerminee(etape(1, { done: true }), [ing(1, 1, { excluded_when_done: false })])).toBe(false);
    expect(etapeTerminee(etape(1, { done: true, batch_substeps: [sous(1, { excluded_when_done: false })] }), [])).toBe(false);
  });
  it('devient vraie quand la ligne gardée est cochée', () => {
    expect(etapeTerminee(etape(1, { done: true }), [ing(1, 1, { excluded_when_done: false, done: true })])).toBe(true);
  });
});

describe('étape affichée', () => {
  const j0 = { offset: 1, steps: [etape(1, { done: true }), etape(2)] } as BatchJalon;
  const j1 = { offset: 0, steps: [etape(3), etape(4)] } as BatchJalon;
  const batch = { batch_ingredients: [] as BatchIngredientRow[] };
  const etapes = etapesOrdonnees(batch, [j0, j1]);

  it("ordonne les étapes par jour et note leur jour", () => {
    expect(etapes.map((e) => [e.step.id, e.jalon, e.terminee])).toEqual([
      [1, 0, true],
      [2, 0, false],
      [3, 1, false],
      [4, 1, false],
    ]);
  });
  it("ouvre sur la première étape qui reste à faire", () => {
    expect(etapeInitiale(etapes)).toBe(2);
  });
  it("ouvre sur l'étape visée par l'adresse si elle existe", () => {
    expect(etapeInitiale(etapes, 4)).toBe(4);
    expect(etapeInitiale(etapes, 99)).toBe(2);
  });
  it('ouvre sur la première étape quand tout est terminé, et sur rien sans étape', () => {
    const toutFait = etapesOrdonnees(batch, [{ offset: 0, steps: [etape(5, { done: true }), etape(6, { done: true })] } as BatchJalon]);
    expect(etapeInitiale(toutFait)).toBe(5);
    expect(etapeInitiale([])).toBeNull();
  });
  it("choisit dans un jour la première étape à faire, sinon la première", () => {
    expect(etapeDuJalon(etapes, 0)).toBe(2);
    expect(etapeDuJalon(etapes, 1)).toBe(3);
    expect(etapeDuJalon(etapesOrdonnees(batch, [{ offset: 0, steps: [etape(7, { done: true })] } as BatchJalon]), 0)).toBe(7);
    expect(etapeDuJalon(etapes, 5)).toBeNull();
  });
});
