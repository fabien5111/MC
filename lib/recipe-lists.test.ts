import { describe, expect, it } from 'vitest';
import {
  deplacerListe,
  droitDeListe,
  erreurNomListe,
  nomListeValide,
  nombreIndisponibles,
  plafondListesAtteint,
  trierListes,
  type ListeKind,
} from '@/lib/recipe-lists';

describe('listes de recettes', () => {
  it('compte les recettes de la liste que la lecture n’a pas rendues', () => {
    expect(nombreIndisponibles(['a', 'b', 'c'], ['a', 'c'])).toBe(1);
    expect(nombreIndisponibles(['a'], ['a', 'z'])).toBe(0);
    expect(nombreIndisponibles([], [])).toBe(0);
  });

  it('valide le nom d’une liste', () => {
    expect(nomListeValide('  Noël   2026 ')).toBe('Noël 2026');
    expect(nomListeValide('   ')).toBeNull();
    expect(nomListeValide('x'.repeat(41))).toBeNull();
    expect(nomListeValide(12)).toBeNull();
    expect(erreurNomListe('')).toMatch(/nom/);
    expect(erreurNomListe('À tester')).toBeNull();
  });

  it('associe à chaque sorte de liste son droit', () => {
    expect(droitDeListe('cap')).toBe('carnet_cap');
    expect(droitDeListe('perso')).toBe('listes_recettes');
  });

  it('range la liste CAP en tête, puis les listes perso par ordre alphabétique', () => {
    const l = (nom: string, kind: ListeKind, position: number) => ({ id: nom, nom, kind, position });
    expect(
      trierListes([l('Test', 'perso', 0), l('CAP', 'cap', 9), l('Noël', 'perso', 1), l('A tester', 'perso', 2), l('à faire', 'perso', 3)]).map((x) => x.nom),
    ).toEqual(['CAP', 'à faire', 'A tester', 'Noël', 'Test']);
    expect(trierListes([l('Liste 10', 'perso', 0), l('Liste 2', 'perso', 1)]).map((x) => x.nom)).toEqual(['Liste 2', 'Liste 10']);
  });

  it('déplace une liste d’un cran et renumérote', () => {
    const listes = [
      { id: 'a', nom: 'a', position: 0 },
      { id: 'b', nom: 'b', position: 1 },
      { id: 'c', nom: 'c', position: 1 },
    ];
    expect(deplacerListe(listes, 'c', 'haut')).toEqual([
      { id: 'a', position: 0 },
      { id: 'c', position: 1 },
      { id: 'b', position: 2 },
    ]);
    expect(deplacerListe(listes, 'a', 'haut')).toBeNull();
    expect(deplacerListe(listes, 'c', 'bas')).toBeNull();
    expect(deplacerListe(listes, 'z', 'bas')).toBeNull();
  });

  it('applique le plafond de listes', () => {
    expect(plafondListesAtteint(3, 3)).toBe(true);
    expect(plafondListesAtteint(2, 3)).toBe(false);
    expect(plafondListesAtteint(99, null)).toBe(false);
  });
});
