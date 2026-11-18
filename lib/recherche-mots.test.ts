import { describe, expect, it } from 'vitest';
import { motsRecherche, radicalRecherche } from '@/lib/recherche-mots';

describe('motsRecherche', () => {
  it('découpe en mots et ignore les mots vides', () => {
    expect(motsRecherche('tarte au chocolat')).toEqual(['tarte', 'chocolat']);
    expect(motsRecherche("pâte d'amande")).toEqual(['pâte', 'amande']);
  });
  it('ramène le pluriel au radical', () => {
    expect(motsRecherche('choux amandes')).toEqual(['chou', 'amande']);
  });
  it('garde les mots vides si la saisie ne contient rien d’autre', () => {
    expect(motsRecherche('la')).toEqual(['la']);
  });
  it('sans doublon, ponctuation retirée', () => {
    expect(motsRecherche('Crème, crème (vanille)')).toEqual(['crème', 'vanille']);
    expect(motsRecherche('  ')).toEqual([]);
  });
});

describe('radicalRecherche', () => {
  it('ne raccourcit pas les mots courts', () => {
    expect(radicalRecherche('jus')).toBe('jus');
    expect(radicalRecherche('gâteaux')).toBe('gâteau');
  });
});
