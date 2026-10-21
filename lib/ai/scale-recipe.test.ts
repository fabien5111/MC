import { describe, expect, it } from 'vitest';

import { buildContenu, normaliseResultat } from './scale-recipe';

describe('normaliseResultat — rendement ajusté', () => {
  it('reprend les propositions et le complément réécrits par l\'IA', () => {
    const r = normaliseResultat({
      coefficient: 2,
      explication: 'Ratio des portions.',
      rendement_ajuste: {
        propositions: [' 1 brownie de 22 à 24 cm de diamètre (≈ 22,6 cm) ', '2 brownies de 16 cm de diamètre'],
        complement: 'environ 12 personnes',
      },
    });
    expect(r.coefficient).toBe(2);
    expect(r.rendement_ajuste).toEqual({
      propositions: ['1 brownie de 22 à 24 cm de diamètre (≈ 22,6 cm)', '2 brownies de 16 cm de diamètre'],
      complement: 'environ 12 personnes',
    });
  });

  it('garde au plus 3 propositions, sans doublon ni entrée vide', () => {
    const r = normaliseResultat({
      coefficient: 2,
      rendement_ajuste: { propositions: ['a', 'a', '  ', null, 'b', 'c', 'd'] },
    });
    expect(r.rendement_ajuste?.propositions).toEqual(['a', 'b', 'c']);
  });

  it('accepte encore l\'ancien champ `quantite`', () => {
    const r = normaliseResultat({ coefficient: 1.5, rendement_ajuste: { quantite: '9 tartelettes', complement: 'null' } });
    expect(r.rendement_ajuste).toEqual({ propositions: ['9 tartelettes'], complement: null });
  });

  it('garde le complément seul quand il n\'y a aucune proposition', () => {
    const r = normaliseResultat({ coefficient: 2, rendement_ajuste: { propositions: [], complement: 'environ 12 personnes' } });
    expect(r.rendement_ajuste).toEqual({ propositions: [], complement: 'environ 12 personnes' });
  });

  it('vaut null quand l\'IA ne rend rien d\'exploitable', () => {
    expect(normaliseResultat({ coefficient: 2 }).rendement_ajuste).toBeNull();
    expect(normaliseResultat({ coefficient: 2, rendement_ajuste: 'texte' }).rendement_ajuste).toBeNull();
    expect(normaliseResultat({ coefficient: 2, rendement_ajuste: { propositions: ['  '], complement: 3 } }).rendement_ajuste).toBeNull();
  });

  it('ignore le rendement quand il n\'y a pas de coefficient', () => {
    const r = normaliseResultat({ coefficient: null, rendement_ajuste: { propositions: ['x'], complement: 'y' } });
    expect(r.coefficient).toBeNull();
    expect(r.rendement_ajuste).toBeNull();
  });

  it('tronque un texte trop long', () => {
    const r = normaliseResultat({ coefficient: 2, rendement_ajuste: { propositions: ['a'.repeat(500)] } });
    expect(r.rendement_ajuste?.propositions[0]).toHaveLength(200);
  });
});

describe('buildContenu', () => {
  it('transmet le rendement et le complément d\'origine à l\'IA', () => {
    const txt = buildContenu(
      { titre: 'Brownie', rendement: '1 brownie de 16cm de diamètre', yield_notes: 'environ 6 personnes' },
      'pour 12 personnes',
      [],
    );
    expect(txt).toContain('Rendement actuel : 1 brownie de 16cm de diamètre');
    expect(txt).toContain("Complément d'informations sur les quantités : environ 6 personnes");
    expect(txt).toContain('rendement_ajuste');
    expect(txt).toContain('PLUSIEURS PROPOSITIONS');
  });
});
