import { describe, expect, it } from 'vitest';
import { lignesManuelles } from '@/lib/projects';

const l = (id: number, quantity: string | null, baseQuantity: number | null, quantityManual = false) => ({
  id,
  quantity,
  baseQuantity,
  quantityManual,
});

describe('lignesManuelles', () => {
  it('retient les lignes marquées, même avec une base conservée', () => {
    const c = { manuallyAdjusted: true, lines: [l(1, '100', 60, true), l(2, '3', 2)] };
    expect(lignesManuelles(c).map((x) => x.id)).toEqual([1]);
  });

  it('ancien marquage : base effacée dans une préparation ajustée', () => {
    const c = { manuallyAdjusted: true, lines: [l(1, '100', null), l(2, '3', 2)] };
    expect(lignesManuelles(c).map((x) => x.id)).toEqual([1]);
  });

  it('une préparation jamais ajustée ne marque aucune ligne', () => {
    const c = { manuallyAdjusted: true, lines: [l(1, '100', null), l(2, '3', null)] };
    expect(lignesManuelles(c)).toEqual([]);
  });

  it('ignore une quantité non chiffrée', () => {
    const c = { manuallyAdjusted: true, lines: [l(1, '1 pincée', 60, true), l(2, null, null, true)] };
    expect(lignesManuelles(c)).toEqual([]);
  });
});
