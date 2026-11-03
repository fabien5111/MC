import { describe, expect, it } from 'vitest';
import { filtrerSuggestions } from '@/lib/suggestions';

const OPTIONS = ['Crème liquide', 'Crème fraîche', 'Beurre', 'Sucre glace', 'Sucre semoule', 'Œuf', 'Écorce de citron', 'Fécule de maïs'];

describe('filtrerSuggestions', () => {
  it('ignore la casse et les accents', () => {
    expect(filtrerSuggestions(OPTIONS, 'creme')).toEqual(['Crème liquide', 'Crème fraîche']);
    expect(filtrerSuggestions(OPTIONS, 'ECORCE')).toEqual(['Écorce de citron']);
  });
  it('place ce qui commence par le terme avant ce qui le contient', () => {
    expect(filtrerSuggestions(OPTIONS, 'cre')).toEqual(['Crème liquide', 'Crème fraîche', 'Sucre glace', 'Sucre semoule']);
    expect(filtrerSuggestions(OPTIONS, 'ec')).toEqual(['Écorce de citron', 'Fécule de maïs']);
  });
  it('trouve un mot qui commence au milieu du nom', () => {
    expect(filtrerSuggestions(OPTIONS, 'glace')).toEqual(['Sucre glace']);
  });
  it('rien à proposer pour une saisie vide', () => {
    expect(filtrerSuggestions(OPTIONS, '')).toEqual([]);
    expect(filtrerSuggestions(OPTIONS, '   ')).toEqual([]);
  });
  it("ne propose pas une option identique à la saisie quand c'est la seule", () => {
    expect(filtrerSuggestions(OPTIONS, 'Beurre')).toEqual([]);
    expect(filtrerSuggestions(OPTIONS, 'sucre')).toHaveLength(2);
  });
  it('dédoublonne et plafonne', () => {
    expect(filtrerSuggestions(['Sel', 'sel', 'SEL fin'], 'sel')).toEqual(['Sel', 'SEL fin']);
    const longues = Array.from({ length: 20 }, (_, i) => `Farine ${i}`);
    expect(filtrerSuggestions(longues, 'farine')).toHaveLength(8);
  });
});
