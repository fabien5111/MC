import { describe, expect, it } from 'vitest';
import { estHoteIndexable, MOTIF_HOTE_NON_INDEXABLE, ORIGINE_CANONIQUE } from './indexation.mjs';

describe('estHoteIndexable', () => {
  it('autorise seulement www', () => {
    expect(estHoteIndexable('www.jepatisse.com')).toBe(true);
    expect(estHoteIndexable('WWW.JEPATISSE.COM:443')).toBe(true);
  });
  it('ferme tout le reste, Host absent compris', () => {
    for (const h of [
      'dev.jepatisse.com',
      'jepatisse.com',
      'jepatisse-preview.jcloud-ver-jpe.ik-server.com',
      'mc-oqp7.vercel.app',
      'www.jepatisse.com.evil.fr',
      '',
      null,
      undefined,
    ]) {
      expect(estHoteIndexable(h)).toBe(false);
    }
  });
});

describe('MOTIF_HOTE_NON_INDEXABLE', () => {
  const re = new RegExp(`^${MOTIF_HOTE_NON_INDEXABLE}$`);
  it('exclut www et seulement www', () => {
    expect(re.test('www.jepatisse.com')).toBe(false);
    expect(re.test('dev.jepatisse.com')).toBe(true);
    expect(re.test('www.jepatisse.com.evil.fr')).toBe(true);
    expect(re.test('wwwxjepatisse.com')).toBe(true);
  });
});

it('origine canonique en https sur www', () => {
  expect(ORIGINE_CANONIQUE).toBe('https://www.jepatisse.com');
});
