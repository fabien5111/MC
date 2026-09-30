import { beforeEach, describe, expect, it, vi } from 'vitest';

// `server-only` lève hors d'un rendu serveur React : neutralisé pour le test.
vi.mock('server-only', () => ({}));

import { cheminPartageCarnet, jetonCarnet, proprietaireDuJeton } from './book-link';

const OWNER = '3f2b8c1e-9a4d-4e7b-8c21-0d5f6a7b8c9d';

describe('lien de partage du carnet (JEP-21)', () => {
  beforeEach(() => {
    delete process.env.CARNET_PARTAGE_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'cle-de-test';
  });

  it('aller-retour : le jeton désigne son propriétaire', () => {
    const jeton = jetonCarnet(OWNER)!;
    expect(jeton).toHaveLength(54);
    expect(proprietaireDuJeton(jeton)).toBe(OWNER);
    expect(cheminPartageCarnet(OWNER)).toBe(`/carnet/partage/${jeton}`);
  });

  it('refuse une signature altérée ou un propriétaire substitué', () => {
    const jeton = jetonCarnet(OWNER)!;
    const autre = jetonCarnet('11111111-2222-4333-8444-555555555555')!;
    expect(proprietaireDuJeton(jeton.slice(0, 32) + autre.slice(32))).toBeNull();
    expect(proprietaireDuJeton(autre.slice(0, 32) + jeton.slice(32))).toBeNull();
    expect(proprietaireDuJeton(jeton.slice(0, -1) + (jeton.endsWith('A') ? 'B' : 'A'))).toBeNull();
    expect(proprietaireDuJeton('abc')).toBeNull();
  });

  it('un changement de secret invalide les liens déjà émis', () => {
    const jeton = jetonCarnet(OWNER)!;
    process.env.CARNET_PARTAGE_SECRET = 'nouveau-secret';
    expect(proprietaireDuJeton(jeton)).toBeNull();
    expect(proprietaireDuJeton(jetonCarnet(OWNER)!)).toBe(OWNER);
  });

  it('sans aucun secret, pas de lien', () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(jetonCarnet(OWNER)).toBeNull();
    expect(cheminPartageCarnet(OWNER)).toBeNull();
  });
});
