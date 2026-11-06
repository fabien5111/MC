import { describe, expect, it } from 'vitest';
import { formatMasse, totalEtape, type LigneTotalEtape } from '@/lib/total-etape';

const ligne = (p: Partial<LigneTotalEtape>): LigneTotalEtape => ({
  name: 'x', quantity: null, base_quantity: null, unit: null, ref_id: null, removed: false, expanded_into_recipe_id: null, ...p,
});
const DENSITES = [{ name: 'Lait entier', density_g_per_ml: 1.03 }];

describe('totalEtape', () => {
  it('lait en ml, jaunes et sucre en g : le lait entre dans le total par sa masse volumique', () => {
    const t = totalEtape(
      [
        ligne({ name: 'Lait entier', quantity: 180, base_quantity: 250, unit: 'ml' }),
        ligne({ name: 'Jaunes d’œufs', quantity: 43.2, base_quantity: 60, unit: 'g' }),
        ligne({ name: 'Sucre semoule', quantity: 43.2, base_quantity: 60, unit: 'g' }),
      ],
      [],
      [],
      DENSITES,
    );
    expect(t.ajuste).toBe(272); // 185,4 + 43,2 + 43,2
    expect(t.origine).toBe(378); // 257,5 + 60 + 60
    expect(t.horsTotal).toEqual([]);
  });
  it('une ligne sans conversion est nommée, jamais comptée', () => {
    const t = totalEtape([ligne({ name: 'Crème', quantity: 100, unit: 'ml' }), ligne({ name: 'Sucre', quantity: 50, unit: 'g' })], [], []);
    expect(t.ajuste).toBe(50);
    expect(t.horsTotal).toEqual(['Crème']);
  });
  it('lignes retirées ou remplacées par une recette écartées', () => {
    const t = totalEtape(
      [ligne({ name: 'A', quantity: 100, unit: 'g' }), ligne({ name: 'B', quantity: 100, unit: 'g', removed: true }), ligne({ name: 'C', quantity: 100, unit: 'g', expanded_into_recipe_id: 3 })],
      [],
      [],
    );
    expect(t.ajuste).toBe(100);
    expect(t.lignes).toBe(1);
  });
  it('une ligne sans quantité d’origine garde sa quantité (ligne ajoutée)', () => {
    expect(totalEtape([ligne({ name: 'A', quantity: 30, unit: 'g' })], [], []).origine).toBe(30);
  });
});

describe('formatMasse', () => {
  it('g puis kg', () => {
    expect(formatMasse(272)).toBe('272 g');
    expect(formatMasse(1250)).toBe('1,25 kg');
  });
});
