import { describe, expect, it } from 'vitest';
import {
  DELAI_RELANCE_MS,
  confirmationDe,
  composerEmailConfirmation,
  confirmationsParId,
  lienConfirmation,
  libelleAttente,
  origineValide,
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

describe('origineValide', () => {
  it('ne garde que l\'origine d\'une adresse http(s)', () => {
    expect(origineValide('https://dev.jepatisse.com/admin/membres?x=1')).toBe('https://dev.jepatisse.com');
    expect(origineValide('http://localhost:3000')).toBe('http://localhost:3000');
  });
  it('absente, illisible ou d\'un autre schéma → null', () => {
    expect(origineValide(null)).toBeNull();
    expect(origineValide('')).toBeNull();
    expect(origineValide('pas une adresse')).toBeNull();
    expect(origineValide('javascript:alert(1)')).toBeNull();
    expect(origineValide('ftp://exemple.fr')).toBeNull();
  });
});

describe('lienConfirmation', () => {
  it('pointe vers /auth/callback avec le jeton et son type', () => {
    expect(lienConfirmation('https://dev.jepatisse.com', 'abc123', 'magiclink')).toBe(
      'https://dev.jepatisse.com/auth/callback?token_hash=abc123&type=magiclink&next=%2F',
    );
  });
  it('encode un jeton qui contiendrait des caractères spéciaux', () => {
    expect(lienConfirmation('https://x.fr', 'a b&c', 'signup')).toContain('token_hash=a%20b%26c');
  });
});

describe('composerEmailConfirmation', () => {
  const lien = 'https://dev.jepatisse.com/auth/callback?token_hash=abc&type=magiclink&next=%2F';
  it('met le lien dans le texte et en bouton HTML, avec le pseudo si connu', () => {
    const m = composerEmailConfirmation({ lien, pseudo: 'Fabien' });
    expect(m.sujet).toContain('Confirmez votre adresse e-mail');
    expect(m.texte).toContain('Bonjour Fabien,');
    expect(m.texte).toContain(lien);
    expect(m.html).toContain('href="https://dev.jepatisse.com/auth/callback?token_hash=abc&amp;type=magiclink&amp;next=%2F"');
  });
  it('sans pseudo : formule neutre ; un pseudo à balises est échappé en HTML', () => {
    expect(composerEmailConfirmation({ lien }).texte.startsWith('Bonjour,')).toBe(true);
    expect(composerEmailConfirmation({ lien, pseudo: '<b>x</b>' }).html).not.toContain('<b>x</b>');
  });
});
