import { describe, expect, it } from 'vitest';
import {
  ACTIONS_CREDITS,
  COUT_AJUSTEMENT,
  COUT_PROJET_COMPOSANT,
  COUT_PROJET_STRUCTURE,
  DROIT_ACTION,
  LIBELLE_ACTION,
  coutImportPhoto,
  coutImportTexte,
  creditsRestants,
  groupeValide,
  libelleCredits,
  soldeSuffisant,
} from '@/lib/credits-ia';

describe('grille des crédits IA (JEP-405)', () => {
  it('coûts fixes arbitrés le 11/11/2026', () => {
    expect(COUT_AJUSTEMENT).toBe(1);
    expect(COUT_PROJET_STRUCTURE).toBe(1);
    expect(COUT_PROJET_COMPOSANT).toBe(2);
  });

  it('import texte ou PDF : 3 / 6 / 9 selon la longueur', () => {
    expect(coutImportTexte(0)).toBe(3);
    expect(coutImportTexte(1_400)).toBe(3);
    expect(coutImportTexte(8_000)).toBe(3);
    expect(coutImportTexte(8_001)).toBe(6);
    expect(coutImportTexte(20_000)).toBe(6);
    expect(coutImportTexte(20_001)).toBe(9);
    expect(coutImportTexte(60_000)).toBe(9);
    expect(coutImportTexte(Number.NaN)).toBe(3);
  });

  it('import photo : 2 + 3 par page', () => {
    expect(coutImportPhoto(1)).toBe(5);
    expect(coutImportPhoto(3)).toBe(11);
    expect(coutImportPhoto(8)).toBe(26);
  });

  it('chaque action a un droit d’accès et un libellé', () => {
    for (const a of ACTIONS_CREDITS) {
      expect(DROIT_ACTION[a]).toMatch(/_ia_mensuel$/);
      expect(LIBELLE_ACTION[a].length).toBeGreaterThan(0);
    }
  });
});

describe('solde', () => {
  it('crédits restants, inconnus si la lecture manque', () => {
    expect(creditsRestants({ limite: 120, utilises: 30 })).toBe(90);
    expect(creditsRestants({ limite: 120, utilises: 130 })).toBe(0);
    expect(creditsRestants({ limite: null, utilises: 3 })).toBeNull();
    expect(creditsRestants(null)).toBeNull();
  });

  it('solde inconnu : on laisse passer, la base tranche', () => {
    expect(soldeSuffisant(null, 9)).toBe(true);
    expect(soldeSuffisant({ limite: 120, utilises: 112 }, 9)).toBe(false);
    expect(soldeSuffisant({ limite: 120, utilises: 111 }, 9)).toBe(true);
  });

  it('libellé accordé', () => {
    expect(libelleCredits(1)).toBe('1 crédit');
    expect(libelleCredits(6)).toBe('6 crédits');
  });

  it('groupe : identifiant v4 seulement', () => {
    expect(groupeValide('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe('3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(groupeValide('pas-un-uuid')).toBeNull();
    expect(groupeValide(42)).toBeNull();
  });
});
