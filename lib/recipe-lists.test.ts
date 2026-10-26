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

  it('range la liste CAP en tête, puis les listes perso par position', () => {
    const l = (id: string, kind: ListeKind, position: number) => ({ id, nom: id, kind, position });
    expect(trierListes([l('b', 'perso', 1), l('cap', 'cap', 9), l('a', 'perso', 0)]).map((x) => x.id)).toEqual(['cap', 'a', 'b']);
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
