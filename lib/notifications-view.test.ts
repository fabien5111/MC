import { describe, expect, it } from 'vitest';
import {
  CATEGORIES_ADMIN,
  NOTIFICATIONS_PAGE,
  estNotificationAdmin,
  filtreMembre,
  lirePortee,
  nouvellesAConsulter,
  relatif,
  tailleAffichee,
} from './notifications-view';

describe('lirePortee', () => {
  it('ignore le filtre pour un membre ordinaire', () => {
    expect(lirePortee('admin', false)).toBe('toutes');
  });
  it('accepte les portées connues pour un gestionnaire', () => {
    expect(lirePortee('admin', true)).toBe('admin');
    expect(lirePortee('membre', true)).toBe('membre');
  });
  it('retombe sur « toutes » pour une valeur inconnue ou absente', () => {
    expect(lirePortee('x', true)).toBe('toutes');
    expect(lirePortee(undefined, true)).toBe('toutes');
  });
});

describe('catégories d’administration', () => {
  it('contient la modération', () => {
    expect(CATEGORIES_ADMIN).toContain('moderation');
    expect(estNotificationAdmin('moderation')).toBe(true);
  });
  it('une ligne sans catégorie concerne le membre', () => {
    expect(estNotificationAdmin(null)).toBe(false);
    expect(filtreMembre()).toMatch(/^category\.is\.null,category\.not\.in\.\(.+\)$/);
  });
});

describe('tailleAffichee', () => {
  it('ne descend jamais sous une page', () => {
    expect(tailleAffichee(undefined)).toBe(NOTIFICATIONS_PAGE);
    expect(tailleAffichee('3')).toBe(NOTIFICATIONS_PAGE);
    expect(tailleAffichee('abc')).toBe(NOTIFICATIONS_PAGE);
  });
  it('suit la valeur demandée au-delà', () => {
    expect(tailleAffichee('60')).toBe(60);
  });
});

describe('nouvellesAConsulter', () => {
  it('retient les non lues pas encore vues', () => {
    const lignes = [
      { id: 1, readAt: null },
      { id: 2, readAt: '2026-10-01' },
      { id: 3, readAt: null },
    ];
    expect(nouvellesAConsulter(lignes, new Set([3]))).toEqual([1]);
  });
});

describe('relatif', () => {
  const maintenant = new Date('2026-10-04T12:00:00Z').getTime();
  it('formule le jour', () => {
    expect(relatif('2026-10-04T08:00:00Z', maintenant)).toBe("Aujourd'hui");
    expect(relatif('2026-10-03T08:00:00Z', maintenant)).toBe('Hier');
    expect(relatif('2026-10-01T08:00:00Z', maintenant)).toBe('Il y a 3 jours');
  });
});
