import { describe, expect, it } from 'vitest';
import { arrondirQuantite, seuilDeUnite, seuilsArrondi } from './arrondi-unite';

const units = [
  { name: 'g', abbreviation: 'g', round_from: 10 },
  { name: 'millilitre', abbreviation: 'ml', round_from: '10' },
  { name: 'kg', abbreviation: 'kg', round_from: null },
  { name: 'Unité(s)', abbreviation: null, round_from: 5 },
  { name: 'pincée', abbreviation: null, round_from: -3 },
];
const s = seuilsArrondi(units);

describe('seuilsArrondi', () => {
  it('ignore les seuils vides, négatifs ou illisibles', () => {
    expect(seuilDeUnite('kg', s)).toBeNull();
    expect(seuilDeUnite('pincée', s)).toBeNull();
  });
  it('rapproche par nom ou abréviation, sans casse ni accents', () => {
    expect(seuilDeUnite('ML', s)).toBe(10);
    expect(seuilDeUnite('Millilitre', s)).toBe(10);
    expect(seuilDeUnite('unité(s)', s)).toBe(5);
  });
  it('accepte un seuil en texte à virgule', () => {
    expect(seuilDeUnite('l', seuilsArrondi([{ name: 'l', round_from: '2,5' }]))).toBe(2.5);
  });
  it('tolère une liste absente', () => {
    expect(seuilsArrondi(null).size).toBe(0);
  });
});

describe('arrondirQuantite', () => {
  it('arrondit à l’unité à partir du seuil (inclus)', () => {
    expect(arrondirQuantite(10, 'g', s)).toBe(10);
    expect(arrondirQuantite(12.4, 'g', s)).toBe(12);
    expect(arrondirQuantite(12.5, 'g', s)).toBe(13);
    expect(arrondirQuantite(10.4, 'g', s)).toBe(10);
  });
  it('garde deux décimales sous le seuil', () => {
    expect(arrondirQuantite(9.987, 'g', s)).toBe(9.99);
    expect(arrondirQuantite(8.4, 'g', s)).toBe(8.4);
  });
  it('garde deux décimales sans seuil, unité libre ou absente', () => {
    expect(arrondirQuantite(12.345, 'kg', s)).toBe(12.35);
    expect(arrondirQuantite(12.345, 'tranche', s)).toBe(12.35);
    expect(arrondirQuantite(12.345, null, s)).toBe(12.35);
    expect(arrondirQuantite(12.345, 'g')).toBe(12.35);
  });
  it('laisse passer une valeur non finie', () => {
    expect(arrondirQuantite(NaN, 'g', s)).toBeNaN();
  });
});
