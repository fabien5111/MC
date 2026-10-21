import { describe, expect, it } from 'vitest';

import { buildContenu, normaliseResultat } from './scale-recipe';

describe('normaliseResultat — rendement ajusté', () => {
  it('reprend la quantité et le complément réécrits par l\'IA', () => {
    const r = normaliseResultat({
      coefficient: 2,
      explication: 'Ratio des portions.',
      rendement_ajuste: { quantite: ' 1 brownie de 22 à 24 cm de diamètre (≈ 22,6 cm) ', complement: 'environ 12 personnes' },
    });
    expect(r.coefficient).toBe(2);
    expect(r.rendement_ajuste).toEqual({
      quantite: '1 brownie de 22 à 24 cm de diamètre (≈ 22,6 cm)',
      complement: 'environ 12 personnes',
    });
  });

  it('garde une partie seule quand l\'autre est absente ou "null"', () => {
    const r = normaliseResultat({ coefficient: 1.5, rendement_ajuste: { quantite: '9 tartelettes', complement: 'null' } });
    expect(r.rendement_ajuste).toEqual({ quantite: '9 tartelettes', complement: null });
  });

  it('vaut null quand l\'IA ne rend rien d\'exploitable', () => {
    expect(normaliseResultat({ coefficient: 2 }).rendement_ajuste).toBeNull();
    expect(normaliseResultat({ coefficient: 2, rendement_ajuste: 'texte' }).rendement_ajuste).toBeNull();
    expect(normaliseResultat({ coefficient: 2, rendement_ajuste: { quantite: '  ', complement: 3 } }).rendement_ajuste).toBeNull();
  });

  it('ignore le rendement quand il n\'y a pas de coefficient', () => {
    const r = normaliseResultat({ coefficient: null, rendement_ajuste: { quantite: 'x', complement: 'y' } });
    expect(r.coefficient).toBeNull();
    expect(r.rendement_ajuste).toBeNull();
  });

  it('tronque un texte trop long', () => {
    const r = normaliseResultat({ coefficient: 2, rendement_ajuste: { quantite: 'a'.repeat(500) } });
    expect(r.rendement_ajuste?.quantite).toHaveLength(200);
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
  });
});
