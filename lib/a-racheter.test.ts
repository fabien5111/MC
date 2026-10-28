import { describe, expect, it } from 'vitest';
import { articleExistant, decisionAjout, estListeARacheter, messageAjout, rangerListes, trierARacheter } from '@/lib/a-racheter';

const item = (id: number, name: string, checked = false, ref_id: number | null = null) => ({ id, name, checked, ref_id });

describe('estListeARacheter', () => {
  it('reconnaît la liste système, jamais une liste sans kind', () => {
    expect(estListeARacheter({ kind: 'a_racheter' })).toBe(true);
    expect(estListeARacheter({ kind: null })).toBe(false);
    expect(estListeARacheter({})).toBe(false);
    expect(estListeARacheter(null)).toBe(false);
  });
});

describe('decisionAjout', () => {
  it('crée un article absent', () => {
    expect(decisionAjout([item(1, 'Beurre')], 'Pépites de chocolat', null)).toEqual({ action: 'creer' });
  });
  it('ne double pas un article présent (singulier/pluriel, ligature)', () => {
    expect(decisionAjout([item(1, "Jaune d'oeuf")], "Jaunes d'œufs", null)).toEqual({ action: 'deja', id: 1 });
  });
  it('rapproche par référentiel même si le libellé diffère', () => {
    expect(decisionAjout([item(1, 'Chocolat noir 70 %', false, 9)], 'Chocolat de couverture', 9)).toEqual({ action: 'deja', id: 1 });
  });
  it('remet à racheter un article déjà barré', () => {
    expect(decisionAjout([item(4, 'Sucre', true)], 'sucre', null)).toEqual({ action: 'decocher', id: 4 });
  });
  it('préfère la ligne non barrée quand les deux existent', () => {
    expect(articleExistant([item(1, 'Sucre', true), item(2, 'Sucres')], 'Sucre', null)?.id).toBe(2);
  });
});

describe('messageAjout', () => {
  it('nomme la liste', () => {
    expect(messageAjout('deja', 'Sucre')).toContain('déjà');
    expect(messageAjout('creer', 'Sucre')).toContain('À racheter');
  });
});

describe('trierARacheter', () => {
  it('place les non barrés en tête, puis par nom', () => {
    const tri = trierARacheter([item(1, 'Beurre', true), item(2, 'Sucre'), item(3, 'Amandes')]);
    expect(tri.map((i) => i.id)).toEqual([3, 2, 1]);
  });
});

describe('rangerListes', () => {
  const liste = (id: number, kind: string | null, checks: boolean[]) => ({ id, kind, shopping_list_items: checks.map((checked) => ({ checked })) });
  it('sort À racheter des autres, même entièrement barrée', () => {
    const r = rangerListes([liste(1, null, [false]), liste(2, 'a_racheter', [true, true]), liste(3, null, [true])]);
    expect(r.aRacheter?.id).toBe(2);
    expect(r.actives.map((l) => l.id)).toEqual([1]);
    expect(r.archivees.map((l) => l.id)).toEqual([3]);
  });
  it('masque À racheter vide', () => {
    expect(rangerListes([liste(2, 'a_racheter', [])]).aRacheter).toBeNull();
  });
});
