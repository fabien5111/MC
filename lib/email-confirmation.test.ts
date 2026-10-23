import { describe, expect, it } from 'vitest';
import {
  DELAI_RELANCE_MS,
  confirmationDe,
  confirmationsParId,
  libelleAttente,
  relanceAutorisee,
} from '@/lib/email-confirmation';

describe('confirmationDe', () => {
  it('date présente → confirmé, absente → non confirmé', () => {
    expect(confirmationDe({ id: 'a', email_confirmed_at: '2026-09-01T10:00:00Z' })).toBe(true);
    expect(confirmationDe({ id: 'a', email_confirmed_at: null })).toBe(false);
    expect(confirmationDe({ id: 'a' })).toBe(false);
  });
  it('compte inconnu de GoTrue → null (ni badge, ni filtre)', () => {
    expect(confirmationDe(null)).toBeNull();
    expect(confirmationDe(undefined)).toBeNull();
  });
});

describe('confirmationsParId', () => {
  it('indexe chaque compte par son id', () => {
    const m = confirmationsParId([
      { id: 'a', email_confirmed_at: '2026-09-01T10:00:00Z' },
      { id: 'b', email_confirmed_at: null },
    ]);
    expect(m.get('a')).toBe(true);
    expect(m.get('b')).toBe(false);
    expect(m.has('c')).toBe(false);
  });
});

describe('relanceAutorisee', () => {
  const maintenant = new Date('2026-10-23T12:00:00Z');
  it('aucune relance antérieure → autorisée', () => {
    expect(relanceAutorisee(null, maintenant)).toEqual({ ok: true });
  });
  it('relance d\'il y a 1 min → refusée, reste 4 min', () => {
    const v = relanceAutorisee('2026-10-23T11:59:00Z', maintenant);
    expect(v).toEqual({ ok: false, attenteSecondes: 240 });
  });
  it('au délai exact → autorisée', () => {
    const t = new Date(maintenant.getTime() - DELAI_RELANCE_MS).toISOString();
    expect(relanceAutorisee(t, maintenant)).toEqual({ ok: true });
  });
  it('date illisible → autorisée ; date future → jamais plus que le délai', () => {
    expect(relanceAutorisee('pas une date', maintenant)).toEqual({ ok: true });
    const v = relanceAutorisee('2027-01-01T00:00:00Z', maintenant);
    expect(v).toEqual({ ok: false, attenteSecondes: DELAI_RELANCE_MS / 1000 });
  });
});

describe('libelleAttente', () => {
  it('secondes sous 90 s, minutes arrondies au-dessus', () => {
    expect(libelleAttente(45)).toBe('45 s');
    expect(libelleAttente(0)).toBe('1 s');
    expect(libelleAttente(240)).toBe('4 min');
    expect(libelleAttente(91)).toBe('2 min');
  });
});
