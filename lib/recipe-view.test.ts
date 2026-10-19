import { describe, expect, it } from 'vitest';
import { peutSePreparerAvance } from '@/lib/recipe-view';

describe('peutSePreparerAvance (JEP-19)', () => {
  it('vrai dès qu’une étape est cochée', () => {
    expect(peutSePreparerAvance({ recipe_steps: [{ can_prepare_ahead: false }, { can_prepare_ahead: true }] })).toBe(true);
  });

  it('faux sans étape cochée, colonne absente ou sans étape', () => {
    expect(peutSePreparerAvance({ recipe_steps: [{ can_prepare_ahead: false }, {}] })).toBe(false);
    expect(peutSePreparerAvance({ recipe_steps: null })).toBe(false);
    expect(peutSePreparerAvance({})).toBe(false);
  });

  it('suit la marque posée par la recherche avancée', () => {
    expect(peutSePreparerAvance({ prepare_ahead: true, recipe_steps: [] })).toBe(true);
  });
});
