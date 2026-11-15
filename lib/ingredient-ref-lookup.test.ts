// Reconnaissance d'un nom saisi dans le référentiel : exact, puis par clé.
import { describe, expect, it } from 'vitest';
import { allergeneDeReference, estIngredientConnu, ingredientsConnus } from '@/lib/ingredient-ref-lookup';

describe('estIngredientConnu', () => {
  const connus = ingredientsConnus(['Œufs', "Jaunes d'œufs", 'Farine T55']);

  it('reconnaît le libellé exact, sans casse', () => {
    expect(estIngredientConnu(connus, 'œufs')).toBe(true);
    expect(estIngredientConnu(connus, ' farine t55 ')).toBe(true);
  });

  it('reconnaît le singulier, « oe » et les apostrophes', () => {
    expect(estIngredientConnu(connus, 'Œuf')).toBe(true);
    expect(estIngredientConnu(connus, 'oeuf')).toBe(true);
    expect(estIngredientConnu(connus, 'jaune d’oeuf')).toBe(true);
  });

  it('ne reconnaît pas un autre ingrédient', () => {
    expect(estIngredientConnu(connus, "Blanc d'œuf")).toBe(false);
    expect(estIngredientConnu(connus, '')).toBe(false);
  });
});

describe('allergeneDeReference', () => {
  const map = { 'œufs': 'Œufs', 'farine t55': 'Gluten', sel: '' };

  it('préfère le libellé exact', () => {
    expect(allergeneDeReference(map, 'Farine T55')).toBe('Gluten');
    expect(allergeneDeReference(map, 'Sel')).toBe('');
  });

  it('retombe sur la clé', () => {
    expect(allergeneDeReference(map, 'Œuf')).toBe('Œufs');
  });

  it('rend undefined hors référentiel', () => {
    expect(allergeneDeReference(map, 'Sucre')).toBeUndefined();
  });
});
