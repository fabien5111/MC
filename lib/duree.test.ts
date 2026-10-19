import { describe, expect, it } from 'vitest';
import { depuisMinutes, uniteParDefaut, versMinutes } from '@/lib/duree';

describe('versMinutes', () => {
  it('convertit les heures, virgule ou point', () => {
    expect(versMinutes('12', 'h')).toBe(720);
    expect(versMinutes('1,5', 'h')).toBe(90);
    expect(versMinutes('1.5', 'h')).toBe(90);
    expect(versMinutes('1,3', 'h')).toBe(78);
  });
  it('garde les minutes, arrondies', () => {
    expect(versMinutes('45', 'min')).toBe(45);
    expect(versMinutes('2.6', 'min')).toBe(3);
  });
  it('vide ou illisible → null, négatif → 0', () => {
    expect(versMinutes('', 'h')).toBeNull();
    expect(versMinutes('  ', 'min')).toBeNull();
    expect(versMinutes('abc', 'min')).toBeNull();
    expect(versMinutes('-3', 'h')).toBe(0);
  });
});

describe('uniteParDefaut', () => {
  it('heures dès 1 h, à la demi-heure', () => {
    expect(uniteParDefaut(720)).toBe('h');
    expect(uniteParDefaut(90)).toBe('h');
    expect(uniteParDefaut(60)).toBe('h');
  });
  it('minutes sinon', () => {
    expect(uniteParDefaut(30)).toBe('min');
    expect(uniteParDefaut(78)).toBe('min');
    expect(uniteParDefaut(null)).toBe('min');
    expect(uniteParDefaut(0)).toBe('min');
  });
});

describe('depuisMinutes', () => {
  it('rend le texte du champ', () => {
    expect(depuisMinutes(720, 'h')).toBe('12');
    expect(depuisMinutes(90, 'h')).toBe('1.5');
    expect(depuisMinutes(45, 'min')).toBe('45');
    expect(depuisMinutes(null, 'h')).toBe('');
  });
  it('aller-retour sans perte', () => {
    for (const m of [60, 90, 480, 720, 1440]) {
      const u = uniteParDefaut(m);
      expect(versMinutes(depuisMinutes(m, u), u)).toBe(m);
    }
  });
});
