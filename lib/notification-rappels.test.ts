// Tests des dates de rappel (JEP-280) : un rappel qui part un jour trop tôt ou
// trop tard est pire que pas de rappel.
import { describe, expect, it } from 'vitest';
import {
  ajouterJours,
  dateZurich,
  etapesACommencer,
  fourneeDejaCommencee,
  jourDEtape,
  quotidienARattraper,
} from '@/lib/notification-rappels';

describe('dateZurich', () => {
  it('donne le jour civil suisse, pas le jour UTC', () => {
    // 23:30 UTC l'été = 01:30 le lendemain à Zurich (UTC+2).
    expect(dateZurich(new Date('2026-07-14T23:30:00Z'))).toBe('2026-07-15');
    // 23:30 UTC l'hiver = 00:30 le lendemain (UTC+1).
    expect(dateZurich(new Date('2026-12-14T23:30:00Z'))).toBe('2026-12-15');
    // 05:30 UTC : même jour des deux côtés, été comme hiver.
    expect(dateZurich(new Date('2026-07-14T05:30:00Z'))).toBe('2026-07-14');
    expect(dateZurich(new Date('2026-12-14T05:30:00Z'))).toBe('2026-12-14');
  });
});

describe('ajouterJours', () => {
  it('traverse les fins de mois, d’année et le changement d’heure', () => {
    expect(ajouterJours('2026-10-31', 1)).toBe('2026-11-01');
    expect(ajouterJours('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJours('2026-03-29', 1)).toBe('2026-03-30'); // passage à l'heure d'été
    expect(ajouterJours('2026-10-25', -1)).toBe('2026-10-24');
  });
});

describe('jourDEtape / etapesACommencer', () => {
  it('une étape tombe à la dégustation moins son décalage', () => {
    expect(jourDEtape('2026-10-10', 0)).toBe('2026-10-10');
    expect(jourDEtape('2026-10-10', 2)).toBe('2026-10-08');
    expect(jourDEtape('2026-10-10', null)).toBe('2026-10-10');
    expect(jourDEtape('2026-10-10', -3)).toBe('2026-10-10'); // jamais après le jour J
  });
  it('ne retient que les étapes du jour non faites', () => {
    const etapes = [
      { title: 'Pâte', day_offset: 2, done: false },
      { title: 'Crème', day_offset: 2, done: true },
      { title: 'Montage', day_offset: 0, done: false },
    ];
    expect(etapesACommencer(etapes, '2026-10-10', '2026-10-08')).toEqual(['Pâte']);
    expect(etapesACommencer(etapes, '2026-10-10', '2026-10-10')).toEqual(['Montage']);
    expect(etapesACommencer(etapes, '2026-10-10', '2026-10-09')).toEqual([]);
  });
});

describe('quotidienARattraper', () => {
  it('attend le créneau de 05:30 UTC', () => {
    expect(quotidienARattraper(new Date('2026-10-04T05:29:59Z'))).toBeNull();
    expect(quotidienARattraper(new Date('2026-10-04T00:15:00Z'))).toBeNull();
  });
  it('rend le jour de Zurich une fois le créneau passé', () => {
    expect(quotidienARattraper(new Date('2026-10-04T05:30:00Z'))).toBe('2026-10-04');
    expect(quotidienARattraper(new Date('2026-10-04T21:59:00Z'))).toBe('2026-10-04'); // 23:59 à Zurich
    expect(quotidienARattraper(new Date('2026-12-04T05:30:00Z'))).toBe('2026-12-04'); // heure d'hiver
  });
  it('ne joue jamais la passe du lendemain dès minuit à Zurich (JEP-375)', () => {
    // 22:02 UTC l'été = 00:02 le 05/10 à Zurich : le créneau du 05 n'est pas venu.
    expect(quotidienARattraper(new Date('2026-10-04T22:02:00Z'))).toBeNull();
    expect(quotidienARattraper(new Date('2026-10-04T23:59:00Z'))).toBeNull();
    // 23:30 UTC l'hiver = 00:30 le lendemain.
    expect(quotidienARattraper(new Date('2026-12-04T23:30:00Z'))).toBeNull();
    expect(quotidienARattraper(new Date('2026-10-05T05:30:00Z'))).toBe('2026-10-05');
  });
});

describe('fourneeDejaCommencee', () => {
  const etapes = [
    { title: 'Pâte', day_offset: 1, done: false },
    { title: 'Montage', day_offset: 0, done: false },
  ];
  it('vrai si une étape tombe aujourd’hui ou avant', () => {
    // Jour J le 24, première étape le 23 : le 23, la fournée a commencé.
    expect(fourneeDejaCommencee(etapes, '2026-10-24', '2026-10-23')).toBe(true);
  });
  it('faux si toutes les étapes sont à venir', () => {
    expect(fourneeDejaCommencee(etapes, '2026-10-24', '2026-10-22')).toBe(false);
    expect(fourneeDejaCommencee([{ title: 'Tout', day_offset: 0, done: false }], '2026-10-24', '2026-10-23')).toBe(false);
  });
});
