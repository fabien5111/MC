import { describe, expect, it } from 'vitest';
import { ADVANCE_NOTE_MAX, noteAvance, peutSePreparerAvance, tempsCarte } from '@/lib/recipe-view';

describe('peutSePreparerAvance (JEP-19)', () => {
  it('vrai dès qu’une étape est cochée', () => {
    expect(peutSePreparerAvance({ recipe_steps: [{ can_prepare_ahead: false }, { can_prepare_ahead: true }] })).toBe(true);
  });

  it('faux sans étape cochée, colonne absente ou sans étape', () => {
    expect(peutSePreparerAvance({ recipe_steps: [{ can_prepare_ahead: false }, {}] })).toBe(false);
    expect(peutSePreparerAvance({ recipe_steps: null })).toBe(false);
    expect(peutSePreparerAvance({})).toBe(false);
  });

  it('suit la marque posée par la recherche avancée', () => {
    expect(peutSePreparerAvance({ prepare_ahead: true, recipe_steps: [] })).toBe(true);
  });
});

describe('tempsCarte (JEP-19)', () => {
  it('préparation, puis total entre parenthèses quand il diffère', () => {
    expect(tempsCarte({ prep: 20, total: 100 })).toEqual({ texte: '20 min (1h40)', titre: 'Préparation 20 min · total 1h40' });
  });
  it('préparation seule, ou égale au total', () => {
    expect(tempsCarte({ prep: 20, total: null })?.texte).toBe('20 min');
    expect(tempsCarte({ prep: 45, total: 45 })?.texte).toBe('45 min');
  });
  it('total seul', () => {
    expect(tempsCarte({ prep: null, total: 90 })).toEqual({ texte: '1h30', titre: 'Temps total 1h30' });
  });
  it('aucun temps : rien', () => {
    expect(tempsCarte({ prep: null, total: null })).toBeNull();
    expect(tempsCarte({ prep: 0, total: 0 })).toBeNull();
  });
});

describe('noteAvance (JEP-19)', () => {
  it('nettoie les espaces et rend null pour le vide', () => {
    expect(noteAvance('  3 jours   au frais \n filmée ')).toBe('3 jours au frais filmée');
    expect(noteAvance('   ')).toBeNull();
    expect(noteAvance(null)).toBeNull();
    expect(noteAvance(undefined)).toBeNull();
  });
  it('coupe à la longueur maximale', () => {
    expect(noteAvance('a'.repeat(ADVANCE_NOTE_MAX + 50))).toHaveLength(ADVANCE_NOTE_MAX);
  });
});
