// Liste totale « une ligne par commentaire + total par ingrédient » (JEP-249) :
// fiche recette (`mergeIngredientLines`), fournée (`mergeAllBatchIngredients`)
// et regroupement avec total (`groupWithTotal`).
import { describe, expect, it } from 'vitest';
import { mergeIngredients, mergeIngredientLines } from '@/lib/recipe-view';
import { mergeAllBatchIngredients, mergedRowQtyText } from '@/lib/recipe-plan';
import { groupWithTotal } from '@/lib/ingredients-recap';
import type { RecipeFull } from '@/lib/recipes';
import type { BatchFull } from '@/lib/recipe-plan';

const ing = (name: string, quantity: string, unit: string, comment: string | null = null) => ({ name, quantity, unit, comment, ref_id: null });
const recipe = (...groups: ReturnType<typeof ing>[][]) =>
  ({ ingredient_groups: groups.map((ingredients, i) => ({ order_index: i, ingredients })) }) as unknown as RecipeFull;
const get = (m: { name: string; qty: string; unit: string; ref_id: number | null }) => ({ name: m.name, qty: m.qty, unit: m.unit, refId: m.ref_id });

describe('mergeIngredientLines — fiche recette', () => {
  const r = recipe([ing("Jaune d'œuf", '2', 'unité(s)'), ing('Jaunes d’œufs', '3', 'unité(s)', 'température ambiante')], [ing("jaune d'oeuf", '1', 'unité(s)')]);

  it('garde une ligne par commentaire, en additionnant les lignes de même commentaire', () => {
    const lines = mergeIngredientLines(r, [], []);
    expect(lines.map((l) => [l.qty, l.comment])).toEqual([
      ['3', null],
      ['3', 'température ambiante'],
    ]);
  });

  it('mergeIngredients (sans byComment) garde un total par ingrédient', () => {
    const merged = mergeIngredients(r, [], []);
    expect(merged).toHaveLength(1);
    expect(merged[0].qty).toBe('6');
  });

  it('un commentaire écrit avec une autre casse reste la même ligne', () => {
    const lines = mergeIngredientLines(recipe([ing('Sucre', '10', 'g', 'Fin'), ing('Sucre', '5', 'g', ' fin ')]), [], []);
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe('15');
  });
});

describe('groupWithTotal', () => {
  const r = recipe([ing("Jaune d'œuf", '2', 'unité(s)'), ing('Jaunes d’œufs', '3', 'unité(s)', 'ambiante'), ing('Lait', '500', 'ml')]);
  const groups = groupWithTotal(mergeIngredientLines(r, [], []), get, [], []);

  it('pose un total sur un ingrédient à plusieurs lignes', () => {
    expect(groups[0].lines).toHaveLength(2);
    expect(groups[0].subtotal).toEqual({ qty: '5', unit: 'unité(s)' });
  });

  it('ne pose pas de total sur une ligne seule', () => {
    expect(groups[1].name).toBe('Lait');
    expect(groups[1].subtotal).toBeNull();
  });

  it('n’invente pas de total sans conversion connue', () => {
    const g = groupWithTotal([{ name: 'Sel', qty: '2', unit: 'g', refId: null }, { name: 'Sel', qty: '1', unit: 'pincée', refId: null }], (x) => x, [], []);
    expect(g[0].subtotal).toEqual({ qty: '2 g + 1 pincée', unit: '' });
  });
});

describe('mergeAllBatchIngredients — fournée', () => {
  const row = (name: string, quantity: number, unit: string, comment: string | null) => ({
    name,
    quantity,
    base_quantity: quantity,
    quantity_text: null,
    unit,
    comment,
    added: false,
    removed: false,
    expanded_into_recipe_id: null,
    ref_id: null,
  });
  const batch = {
    batch_ingredients: [row("Jaune d'œuf", 2, 'unité(s)', null), row('Jaunes d’œufs', 3, 'unité(s)', 'ambiante'), row("jaune d'oeuf", 1, 'unité(s)', null)],
  } as unknown as BatchFull;

  it('une ligne par commentaire, sans concaténer les commentaires', () => {
    const rows = mergeAllBatchIngredients(batch);
    expect(rows.map((r) => [mergedRowQtyText(r), r.comment])).toEqual([
      ['3', null],
      ['3', 'ambiante'],
    ]);
  });

  it('le total de l’ingrédient se calcule par groupWithTotal', () => {
    const g = groupWithTotal(mergeAllBatchIngredients(batch), (r) => ({ name: r.name, qty: mergedRowQtyText(r), unit: r.unit, refId: r.ref_id }), [], []);
    expect(g).toHaveLength(1);
    expect(g[0].subtotal).toEqual({ qty: '6', unit: 'unité(s)' });
  });
});
