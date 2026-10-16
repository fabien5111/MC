import { describe, expect, it } from 'vitest';
import { slugify } from '@/lib/text';

describe('slugify', () => {
  it('passe en minuscules, retire les accents et remplace les espaces par des tirets', () => {
    expect(slugify('Café gourmand')).toBe('cafe-gourmand');
    expect(slugify('Dessert à l’assiette')).toBe('dessert-a-lassiette');
  });

  it('supprime les caractères hors a-z, 0-9 et tiret', () => {
    expect(slugify('Sans gluten !')).toBe('sans-gluten-');
    expect(slugify('Thermomix®')).toBe('thermomix');
  });
});
