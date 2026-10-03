// Tests des dates de rappel (JEP-280) : un rappel qui part un jour trop tôt ou
// trop tard est pire que pas de rappel.
import { describe, expect, it } from 'vitest';
import { ajouterJours, dateZurich, etapesACommencer, jourDEtape } from '@/lib/notification-rappels';

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
