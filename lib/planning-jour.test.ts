import { describe, expect, it } from 'vitest';
import { COULEURS_FOURNEE, couleurFournee, grouperConsecutifs, indexDeplacement, tempsEtape } from '@/lib/planning-jour';

describe('couleurFournee', () => {
  it('est stable et prise dans la palette', () => {
    expect(couleurFournee(7)).toBe(couleurFournee(7));
    expect(COULEURS_FOURNEE).toContain(couleurFournee(123456));
    expect(couleurFournee(0)).toBe(COULEURS_FOURNEE[0]);
    expect(couleurFournee(COULEURS_FOURNEE.length + 1)).toBe(COULEURS_FOURNEE[1]);
  });
});

describe('grouperConsecutifs', () => {
  it('regroupe les étapes consécutives d’une même fournée', () => {
    const g = grouperConsecutifs([{ planId: 1 }, { planId: 1 }, { planId: 2 }]);
    expect(g.map((x) => [x.planId, x.items.length])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });
  it('respecte un ordre qui alterne entre fournées', () => {
    const g = grouperConsecutifs([{ planId: 1 }, { planId: 2 }, { planId: 1 }]);
    expect(g.map((x) => x.planId)).toEqual([1, 2, 1]);
  });
  it('liste vide', () => {
    expect(grouperConsecutifs([])).toEqual([]);
  });
});

describe('tempsEtape', () => {
  it('compose les temps et le total', () => {
    expect(tempsEtape({ prep_time: 15, wait_time: 15, cook_time: 20, cook_temp: 150 })).toEqual({
      parties: ['15 min prép', '15 min repos', '20 min à 150 °C'],
      total: '50 min',
    });
  });
  it('pas de total pour une seule composante', () => {
    expect(tempsEtape({ prep_time: 10, wait_time: null, cook_time: null, cook_temp: null })).toEqual({
      parties: ['10 min prép'],
      total: null,
    });
  });
  it('cuisson sans durée', () => {
    expect(tempsEtape({ prep_time: null, wait_time: null, cook_time: null, cook_temp: 180 }).parties).toEqual(['cuisson à 180 °C']);
  });
  it('reste seul : seulement la cuisson', () => {
    expect(tempsEtape({ prep_time: 20, wait_time: 60, cook_time: 25, cook_temp: 170 }, true)).toEqual({
      parties: ['25 min à 170 °C'],
      total: null,
    });
  });
  it('aucun temps', () => {
    expect(tempsEtape({ prep_time: null, wait_time: null, cook_time: null, cook_temp: null })).toEqual({ parties: [], total: null });
  });
});

describe('indexDeplacement', () => {
  it('borne aux extrémités', () => {
    expect(indexDeplacement(0, 3, -1)).toBeNull();
    expect(indexDeplacement(2, 3, 1)).toBeNull();
    expect(indexDeplacement(1, 3, -1)).toBe(0);
    expect(indexDeplacement(1, 3, 1)).toBe(2);
  });
});
