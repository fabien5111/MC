import { describe, expect, it } from 'vitest';
import {
  TTL_DEFAUT_JOURS,
  TTL_MIN_JOURS,
  ageEnJours,
  filtreProfil,
  idAbrege,
  masquerEmail,
  premierFiltre,
  ttlJours,
} from '@/lib/purge-comptes';

const maintenant = new Date('2026-10-23T12:00:00Z');

describe('ttlJours', () => {
  it('absent, vide ou illisible → défaut', () => {
    expect(ttlJours(undefined)).toBe(TTL_DEFAUT_JOURS);
    expect(ttlJours('')).toBe(TTL_DEFAUT_JOURS);
    expect(ttlJours('abc')).toBe(TTL_DEFAUT_JOURS);
    expect(ttlJours('0')).toBe(TTL_DEFAUT_JOURS);
    expect(ttlJours('-5')).toBe(TTL_DEFAUT_JOURS);
    expect(ttlJours('12.5')).toBe(TTL_DEFAUT_JOURS);
  });
  it('valeur valide gardée, mais jamais sous le plancher', () => {
    expect(ttlJours('45')).toBe(45);
    expect(ttlJours(' 14 ')).toBe(14);
    expect(ttlJours('1')).toBe(TTL_MIN_JOURS);
  });
});

describe('premierFiltre', () => {
  const vieux = '2026-08-01T00:00:00Z';
  it('un compte confirmé n\'est jamais candidat', () => {
    expect(premierFiltre({ id: 'a', email_confirmed_at: '2026-08-02T00:00:00Z', created_at: vieux }, maintenant, 30)).toBe('confirme');
  });
  it('trop récent → exclu, au seuil exact → candidat', () => {
    expect(premierFiltre({ id: 'a', created_at: '2026-10-10T12:00:00Z' }, maintenant, 30)).toBe('recent');
    expect(premierFiltre({ id: 'a', created_at: '2026-09-23T12:00:00Z' }, maintenant, 30)).toBeNull();
    expect(premierFiltre({ id: 'a', created_at: '2026-09-24T12:00:00Z' }, maintenant, 30)).toBe('recent');
  });
  it('date de création illisible ou absente → exclu (dans le doute, on garde)', () => {
    expect(premierFiltre({ id: 'a', created_at: 'n/a' }, maintenant, 30)).toBe('date_illisible');
    expect(premierFiltre({ id: 'a' }, maintenant, 30)).toBe('date_illisible');
  });
  it('vieux et jamais confirmé → passe le premier filtre', () => {
    expect(premierFiltre({ id: 'a', email_confirmed_at: null, created_at: vieux }, maintenant, 30)).toBeNull();
  });
});

describe('ageEnJours', () => {
  it('jours entiers, null si illisible', () => {
    expect(ageEnJours({ id: 'a', created_at: '2026-10-20T12:00:00Z' }, maintenant)).toBe(3);
    expect(ageEnJours({ id: 'a', created_at: 'x' }, maintenant)).toBeNull();
  });
});

describe('filtreProfil', () => {
  it('sans profil → exclu', () => {
    expect(filtreProfil(undefined)).toBe('sans_profil');
  });
  it('admin ou gestionnaire → exclu, membre (ou rôle vide) → ok', () => {
    expect(filtreProfil({ id: 'a', role: 'admin', status: 'active' })).toBe('role');
    expect(filtreProfil({ id: 'a', role: 'gestionnaire', status: 'active' })).toBe('role');
    expect(filtreProfil({ id: 'a', role: 'member', status: 'active' })).toBeNull();
    expect(filtreProfil({ id: 'a', role: null, status: null })).toBeNull();
  });
  it('compte suspendu ou désactivé → exclu (un admin a déjà tranché)', () => {
    expect(filtreProfil({ id: 'a', role: 'member', status: 'suspended' })).toBe('statut');
    expect(filtreProfil({ id: 'a', role: 'member', status: 'disabled' })).toBe('statut');
  });
});

describe('masquerEmail / idAbrege', () => {
  it('garde l\'initiale et le domaine seulement', () => {
    expect(masquerEmail('test_fabien@proton.me')).toBe('t***@proton.me');
    expect(masquerEmail(null)).toBe('(sans adresse)');
    expect(masquerEmail('sans-arobase')).toBe('***');
  });
  it('identifiant tronqué à 8 caractères', () => {
    expect(idAbrege('0123456789abcdef')).toBe('01234567');
  });
});
