// Tests du regroupement d'un article dans une liste de courses (JEP-249) : un
// regroupement manqué laisse deux lignes, un regroupement abusif additionne
// deux choses différentes — les deux sont silencieux.
import { describe, expect, it } from 'vitest';
import { findSameItem, joinComments, shoppingKey, sumQuantities } from '@/lib/shopping-merge';

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
