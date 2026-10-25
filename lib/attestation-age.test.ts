import { describe, expect, it } from 'vitest';
import {
  AGE_ATTESTATION_VERSION,
  attestationAgeDansMetadonnees,
  dateAttestationAge,
} from './attestation-age';

const MAINTENANT = new Date('2026-10-25T10:00:00.000Z');

describe('attestationAgeDansMetadonnees', () => {
  it('accepte la version en vigueur avec une date lisible', () => {
    expect(
      attestationAgeDansMetadonnees({
        age_attestation_version: AGE_ATTESTATION_VERSION,
        age_attestation_at: '2026-10-20T08:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('refuse une inscription sans déclaration (appel direct à signUp)', () => {
    expect(attestationAgeDansMetadonnees({ pseudo: 'Fabien' })).toBe(false);
    expect(attestationAgeDansMetadonnees(undefined)).toBe(false);
    expect(attestationAgeDansMetadonnees(null)).toBe(false);
  });

  it('refuse une ancienne version ou une date illisible', () => {
    expect(
      attestationAgeDansMetadonnees({ age_attestation_version: '2020-01-01', age_attestation_at: '2026-10-20T08:00:00Z' }),
    ).toBe(false);
    expect(
      attestationAgeDansMetadonnees({ age_attestation_version: AGE_ATTESTATION_VERSION, age_attestation_at: 'hier' }),
    ).toBe(false);
  });
});

describe('dateAttestationAge', () => {
  it('garde la date déclarée', () => {
    expect(dateAttestationAge({ age_attestation_at: '2026-10-20T08:00:00.000Z' }, MAINTENANT)).toBe(
      '2026-10-20T08:00:00.000Z',
    );
  });

  it("n'accepte jamais une date future ni illisible", () => {
    expect(dateAttestationAge({ age_attestation_at: '2030-01-01T00:00:00Z' }, MAINTENANT)).toBe(MAINTENANT.toISOString());
    expect(dateAttestationAge({}, MAINTENANT)).toBe(MAINTENANT.toISOString());
  });
});
