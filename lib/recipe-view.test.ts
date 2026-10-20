import { describe, expect, it } from 'vitest';
import { ADVANCE_NOTE_MAX, noteAvance, peutSePreparerAvance, planningDays, tempsCarte } from '@/lib/recipe-view';

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

describe('planningDays (JEP-19)', () => {
  it('porte le drapeau et la note de l’étape préparable à l’avance', () => {
    const jours = planningDays([
      { title: 'Pâte', day_offset: 1, order_index: 0, can_prepare_ahead: true, advance_note: ' 3 jours au frais ' },
      { title: 'Cuisson', day_offset: 0, order_index: 1 },
    ]);
    expect(jours[0].items[0]).toMatchObject({ can_prepare_ahead: true, advance_note: '3 jours au frais' });
    expect(jours[1].items[0].can_prepare_ahead).toBe(false);
    expect(jours[1].items[1]).toMatchObject({ title: 'Dégustation', can_prepare_ahead: false });
  });
  it('ignore la note d’une étape décochée', () => {
    const [jour] = planningDays([{ title: 'A', day_offset: 0, order_index: 0, can_prepare_ahead: false, advance_note: 'x' }]);
    expect(jour.items[0].advance_note).toBeNull();
  });
});
