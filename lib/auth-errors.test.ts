// Traduction des erreurs de GoTrue.
import { describe, expect, it } from 'vitest';
import { avecErreurTraduite, COMPTE_BLOQUE, traduireErreurAuth } from '@/lib/auth-errors';

describe('traduireErreurAuth', () => {
  it('lit le code en priorité', () => {
    expect(traduireErreurAuth({ code: 'same_password', message: 'whatever' })).toBe(
      'Le nouveau mot de passe doit être différent de l’actuel.',
    );
    expect(traduireErreurAuth({ code: 'user_banned', message: 'User is banned' })).toBe(COMPTE_BLOQUE);
  });

  it('retombe sur le texte anglais sans code', () => {
    expect(traduireErreurAuth({ message: 'New password should be different from the old password.' })).toBe(
      'Le nouveau mot de passe doit être différent de l’actuel.',
    );
    expect(traduireErreurAuth('Invalid login credentials')).toBe('Adresse e-mail ou mot de passe incorrect.');
    expect(traduireErreurAuth({ message: 'Password should be at least 8 characters.' })).toBe(
      'Le mot de passe doit contenir au moins 8 caractères.',
    );
    expect(traduireErreurAuth({ message: 'For security purposes, you can only request this after 42 seconds.' })).toBe(
      'Par sécurité, patientez 42 secondes avant de réessayer.',
    );
  });

  it('un code inconnu laisse le texte décider', () => {
    expect(traduireErreurAuth({ code: 'nouveau_code', message: 'Email rate limit exceeded' })).toBe(
      'Trop de tentatives : réessayez dans quelques minutes.',
    );
  });

  it('ne masque jamais une erreur inconnue', () => {
    expect(traduireErreurAuth({ message: 'Something odd' })).toBe('Une erreur est survenue (Something odd).');
    expect(traduireErreurAuth(null)).toBe('Une erreur est survenue.');
    expect(traduireErreurAuth({ message: '' })).toBe('Une erreur est survenue.');
  });
});

describe('avecErreurTraduite', () => {
  it('traduit l’erreur et laisse passer un succès', () => {
    expect(avecErreurTraduite({ error: null })).toEqual({ error: null });
    expect(avecErreurTraduite({ error: { code: 'same_password', message: 'x' } }).error?.message).toMatch(/différent/);
  });
});
