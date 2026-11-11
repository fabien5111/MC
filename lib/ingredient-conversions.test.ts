// Équivalent en grammes affiché sous la quantité (mode projet) : se taire
// plutôt qu'afficher un poids inventé.
import { describe, expect, it } from 'vitest';
import { poidsEquivalentTexte, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';

const units: UnitRef[] = [
  { id: 1, name: 'g' },
  { id: 2, name: 'unité(s)' },
  { id: 3, name: 'kg' },
];
// 1 œuf (réf. 10) = 50 g
const conversions: ConversionRef[] = [{ ingredient_ref_id: 10, from_quantity: 1, from_unit_id: 2, to_quantity: 50, to_unit_id: 1 }];

describe('poidsEquivalentTexte', () => {
  it('convertit une unité de comptage en grammes, arrondi au gramme', () => {
    expect(poidsEquivalentTexte(conversions, units, 10, 'unité(s)', '2,08')).toBe('≈ 104 g');
    expect(poidsEquivalentTexte(conversions, units, 10, 'unité(s)', 3)).toBe('≈ 150 g');
  });
  it('ne dit rien pour une ligne déjà en masse', () => {
    expect(poidsEquivalentTexte(conversions, units, 10, 'g', 100)).toBeNull();
    expect(poidsEquivalentTexte(conversions, units, 10, 'kg', 1)).toBeNull();
  });
  it('ne dit rien sans référence, sans conversion ou sans quantité exploitable', () => {
    expect(poidsEquivalentTexte(conversions, units, null, 'unité(s)', 2)).toBeNull();
    expect(poidsEquivalentTexte(conversions, units, 99, 'unité(s)', 2)).toBeNull();
    expect(poidsEquivalentTexte(conversions, units, 10, 'unité(s)', '1 + 2')).toBeNull();
    expect(poidsEquivalentTexte(conversions, units, 10, 'unité(s)', '')).toBeNull();
  });
});
