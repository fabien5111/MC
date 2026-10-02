// Tests du regroupement d'un article dans une liste de courses (JEP-249) : un
// regroupement manqué laisse deux lignes, un regroupement abusif additionne
// deux choses différentes — les deux sont silencieux.
import { describe, expect, it } from 'vitest';
import { findSameItem, joinComments, mergeCandidates, mergePreview, mergeResult, shoppingKey, sumQuantities } from '@/lib/shopping-merge';

const liste = [
  { id: 1, name: 'Blancs d’œufs', unit: 'unité(s)' },
  { id: 2, name: 'Jaune d’œuf', unit: 'g' },
  { id: 3, name: 'Lait entier', unit: 'ml' },
];

describe('findSameItem', () => {
  it('retrouve le même ingrédient malgré pluriel, ligature et casse', () => {
    expect(findSameItem(liste, 'blanc d\'oeuf', 'unité(s)')?.id).toBe(1);
    expect(findSameItem(liste, 'BLANCS D’ŒUFS', ' Unité(s) ')?.id).toBe(1);
  });

  it('ne regroupe pas des unités différentes', () => {
    expect(findSameItem(liste, 'Jaune d’œuf', 'unité(s)')).toBeUndefined();
    expect(findSameItem(liste, 'Jaunes d’œufs', 'g')?.id).toBe(2);
  });

  it('ne regroupe pas deux ingrédients différents', () => {
    expect(findSameItem(liste, 'Lait', 'ml')).toBeUndefined();
    expect(findSameItem(liste, 'Blanc d’œuf entier', 'unité(s)')).toBeUndefined();
  });

  it('traite « sans unité » comme une unité', () => {
    const l = [{ id: 9, name: 'Œufs', unit: null }];
    expect(findSameItem(l, 'oeuf', '')?.id).toBe(9);
    expect(findSameItem(l, 'oeuf', 'g')).toBeUndefined();
  });

  it('ignore un nom sans contenu', () => {
    expect(findSameItem([{ id: 1, name: '', unit: null }], '  ', null)).toBeUndefined();
  });
});

describe('sumQuantities', () => {
  it('additionne les nombres, virgule comprise', () => {
    expect(sumQuantities('2', '3')).toBe('5');
    expect(sumQuantities('1,5', '2')).toBe('3.5');
  });
  it('réunit ce qui n’est pas numérique, sans rien perdre', () => {
    expect(sumQuantities('2', 'une pincée')).toBe('2 + une pincée');
    expect(sumQuantities(null, null)).toBeNull();
  });
});

describe('joinComments', () => {
  it('réunit sans répéter', () => {
    expect(joinComments('chaud', 'froid')).toBe('chaud ; froid');
    expect(joinComments('chaud', 'chaud')).toBe('chaud');
    expect(joinComments(null, 'froid')).toBe('froid');
    expect(joinComments('chaud', null)).toBe('chaud');
  });
});

describe('shoppingKey', () => {
  it('est identique pour les variantes d’un même article', () => {
    expect(shoppingKey('Jaunes d’œufs', 'unité(s)')).toBe(shoppingKey('jaune d\'oeuf', 'Unité(s)'));
  });
});

// Cas de la capture : 1 jaune d'œuf = 20 g (référence 7), unités 1 = « unité(s) », 2 = « g ».
const units = [
  { id: 1, name: 'unité(s)' },
  { id: 2, name: 'g' },
  { id: 3, name: 'ml' },
];
const conversions = [{ ingredient_ref_id: 7, from_quantity: 1, from_unit_id: 1, to_quantity: 20, to_unit_id: 2 }];
const ligne = (id: number, name: string, quantity: string | null, unit: string | null, ref_id: number | null = 7) => ({
  id, name, quantity, unit, ref_id,
});

describe('fusion avec conversion d’unité', () => {
  const enUnites = ligne(1, 'jaune d’œuf', '5', 'unité(s)');
  const enGrammes = ligne(2, 'Jaune d’œuf', '100', 'g');

  it('propose le même ingrédient dans une autre unité reliée par une conversion', () => {
    const items = [enUnites, enGrammes, ligne(3, 'Lait entier', '500', 'ml', 9)];
    expect(mergeCandidates(items, enUnites, conversions, units).map((i) => i.id)).toEqual([2]);
    expect(mergeCandidates(items, enGrammes, conversions, units).map((i) => i.id)).toEqual([1]);
  });

  it('additionne dans l’unité de la ligne cliquée, dans les deux sens', () => {
    expect(mergeResult(enUnites, enGrammes, conversions, units)).toEqual({ quantity: '10', converted: 5 });
    expect(mergeResult(enGrammes, enUnites, conversions, units)).toEqual({ quantity: '200', converted: 100 });
  });

  it('garde les décimales utiles', () => {
    expect(mergeResult(enUnites, ligne(4, 'Jaune d’œuf', '30', 'g'), conversions, units).quantity).toBe('6.5');
  });

  it('montre le calcul avant validation', () => {
    expect(mergePreview(enUnites, enGrammes, conversions, units)).toBe('5 unité(s) + 100 g (≈ 5 unité(s)) = 10 unité(s)');
  });

  it('même unité : comportement d’origine, sans aperçu', () => {
    const a = ligne(1, 'Sucre', '100', 'g', 3);
    const b = ligne(2, 'Farine', '50', 'g', 4); // même unité : proposé comme avant, au choix de l’utilisateur
    expect(mergeCandidates([a, b], a, conversions, units).map((i) => i.id)).toEqual([2]);
    expect(mergeResult(a, b, conversions, units)).toEqual({ quantity: '150', converted: null });
    expect(mergePreview(a, b, conversions, units)).toBeNull();
  });

  it('ne propose pas un autre ingrédient dans une autre unité', () => {
    const lait = ligne(3, 'Lait entier', '100', 'g', 9);
    expect(mergeCandidates([enUnites, lait], enUnites, conversions, units)).toEqual([]);
  });

  it('ne propose rien sans conversion connue', () => {
    expect(mergeCandidates([enUnites, ligne(5, 'Jaune d’œuf', '10', 'ml')], enUnites, conversions, units)).toEqual([]);
    expect(mergeCandidates([enUnites, enGrammes], enUnites, [], units)).toEqual([]);
  });

  it('ne convertit pas une ligne sans rattachement au référentiel', () => {
    const a = ligne(1, 'jaune d’œuf', '5', 'unité(s)', null);
    const b = ligne(2, 'Jaune d’œuf', '100', 'g', null);
    expect(mergeCandidates([a, b], a, conversions, units)).toEqual([]);
  });

  it('ne convertit pas une quantité qui n’est pas un nombre', () => {
    const pincee = ligne(6, 'Jaune d’œuf', 'une pincée', 'g');
    expect(mergeCandidates([enUnites, pincee], enUnites, conversions, units)).toEqual([]);
    expect(mergeCandidates([enUnites, ligne(7, 'Jaune d’œuf', null, 'g')], enUnites, conversions, units)).toEqual([]);
  });
});
