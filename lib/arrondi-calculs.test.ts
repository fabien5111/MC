import { describe, expect, it } from 'vitest';
import { seuilsArrondi } from '@/lib/arrondi-unite';
import { arrondiQuantite } from '@/lib/batch-lecons';
import { scaledQuantityText } from '@/lib/projects';
import { scaleFromBase, materializeBatch, type MaterializableRecipe } from '@/lib/recipe-plan';

// JEP-389 : les quantités CALCULÉES s'arrondissent à l'unité à partir du seuil
// de leur unité (`units.round_from`) ; une quantité de l'auteur n'est jamais touchée.
const seuils = seuilsArrondi([
  { name: 'g', abbreviation: 'g', round_from: 10 },
  { name: 'ml', abbreviation: 'ml', round_from: 10 },
  { name: 'kg', abbreviation: 'kg', round_from: null },
]);

describe('scaleFromBase', () => {
  it('arrondit à l’unité au-delà du seuil', () => {
    expect(scaleFromBase(100, null, 1.234, 'g', seuils).quantity).toBe(123);
    expect(scaleFromBase(10, null, 1.234, 'g', seuils).quantity).toBe(12);
  });
  it('garde deux décimales sous le seuil ou sans seuil', () => {
    expect(scaleFromBase(5, null, 1.234, 'g', seuils).quantity).toBe(6.17);
    expect(scaleFromBase(100, null, 1.234, 'kg', seuils).quantity).toBe(123.4);
    expect(scaleFromBase(100, null, 1.234, 'g').quantity).toBe(123.4);
  });
  it('ne touche pas à une quantité à coefficient 1', () => {
    expect(scaleFromBase(12.4, null, 1, 'g', seuils).quantity).toBe(12.4);
  });
});

describe('scaledQuantityText (mode projet)', () => {
  it('arrondit à l’unité au-delà du seuil, en virgule française', () => {
    expect(scaledQuantityText(100, 1.234, 'g', seuils)).toBe('123');
    expect(scaledQuantityText(5, 1.234, 'g', seuils)).toBe('6,17');
  });
  it('garde l’ancien comportement sans seuils', () => {
    expect(scaledQuantityText(100, 1.234)).toBe('123,4');
  });
});

describe('arrondiQuantite', () => {
  it('suit les seuils du référentiel quand il y en a', () => {
    expect(arrondiQuantite(12.4, 'ml', seuils)).toBe(12);
    expect(arrondiQuantite(25.6, 'kg', seuils)).toBe(25.6);
  });
  it('garde l’ancienne règle sans seuils (colonne pas migrée)', () => {
    expect(arrondiQuantite(42.17, 'g', new Map())).toBe(42);
    expect(arrondiQuantite(4.26, 'g')).toBe(4.3);
  });
});

describe('materializeBatch', () => {
  const recette = {
    recipe_steps: [{ id: 1, order_index: 0, day_offset: 0 }],
    recipe_utensils: [],
    ingredient_groups: [
      { order_index: 0, scaling_mode: 'simple', ingredients: [{ order_index: 0, name: 'sucre', quantity: '100', unit: 'g' }] },
    ],
  } as unknown as MaterializableRecipe;
  it('arrondit les quantités ajustées avec les seuils fournis', () => {
    const q = materializeBatch(recette, { factor: 1.234, seuils }).steps[0].ingredients[0];
    expect(q.quantity).toBe(123);
    expect(q.base_quantity).toBe(100);
  });
  it('laisse la recette intacte à coefficient 1', () => {
    expect(materializeBatch(recette, { factor: 1, seuils }).steps[0].ingredients[0].quantity).toBe(100);
  });
});
