import { describe, expect, it } from 'vitest';

import { coefficientRetouche, libelleAjustement, lireAjustementIA, lireAjustementIngredient } from './batch-ai';

const DETAIL = {
  demande: 'pour 12 personnes',
  coefficient: 2,
  explication: 'Ratio des portions : 12 / 6.',
  propositions: ['1 brownie de 22 à 24 cm de diamètre (≈ 22,6 cm)', '2 brownies de 16 cm de diamètre'],
  complement: 'environ 12 personnes',
};

describe('lireAjustementIA', () => {
  it('relit un détail enregistré', () => {
    expect(lireAjustementIA(DETAIL)).toEqual(DETAIL);
  });

  it('vaut null pour une valeur absente ou abîmée', () => {
    expect(lireAjustementIA(undefined)).toBeNull();
    expect(lireAjustementIA(null)).toBeNull();
    expect(lireAjustementIA('texte')).toBeNull();
    expect(lireAjustementIA([DETAIL])).toBeNull();
    expect(lireAjustementIA({ ...DETAIL, coefficient: 0 })).toBeNull();
    expect(lireAjustementIA({ ...DETAIL, coefficient: '2' })).toBeNull();
  });

  it('tolère des champs manquants ou mal typés', () => {
    expect(lireAjustementIA({ coefficient: 1.5, propositions: ['a', 3, ' ', 'b', 'c', 'd'] })).toEqual({
      demande: '',
      coefficient: 1.5,
      explication: '',
      propositions: ['a', 'b', 'c'],
      complement: null,
    });
  });
});

describe('coefficientRetouche', () => {
  it('ignore un écart d\'arrondi, signale une vraie retouche', () => {
    const ai = lireAjustementIA(DETAIL)!;
    expect(coefficientRetouche(ai, 2)).toBe(false);
    expect(coefficientRetouche(ai, 2.000001)).toBe(false);
    expect(coefficientRetouche(ai, 1.8)).toBe(true);
  });
});

describe('libelleAjustement / lireAjustementIngredient', () => {
  it('traduit l\'ancien préfixe « Base »', () => {
    expect(libelleAjustement('Base Levain : 350 g')).toBe('Ajustement Levain : 350 g');
    expect(libelleAjustement('Moule : Cercle — Ø 20 cm')).toBe('Moule : Cercle — Ø 20 cm');
    expect(libelleAjustement(null)).toBeNull();
  });
  it('relit l\'ingrédient et la quantité', () => {
    expect(lireAjustementIngredient('Base Levain : 350 g')).toEqual({ nom: 'Levain', quantite: '350' });
    expect(lireAjustementIngredient('Ajustement Jaune d\'œuf : 4')).toEqual({ nom: 'Jaune d\'œuf', quantite: '4' });
    expect(lireAjustementIngredient('IA : pour 12 personnes')).toBeNull();
  });
});
