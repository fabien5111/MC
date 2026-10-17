// Rattrapage de la passe quotidienne par la boucle : une seule fois par jour,
// jamais avant 05:30 UTC, et une pause avant de retenter après un refus ou un échec.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reserver = vi.fn();
const liberer = vi.fn();
const recap = vi.fn();
const rappels = vi.fn();

vi.mock('@/lib/notification-jobs-data', () => ({
  reserverQuotidien: (...a: unknown[]) => reserver(...a),
  libererQuotidien: (...a: unknown[]) => liberer(...a),
  envoyerRecapitulatifs: (...a: unknown[]) => recap(...a),
}));
vi.mock('@/lib/notification-rappels-data', () => ({ genererRappels: (...a: unknown[]) => rappels(...a) }));

import { DELAI_NOUVEL_ESSAI_MS, jouerPasseQuotidienne, rattraperQuotidienne } from '@/lib/notification-quotidien-data';

const matin = new Date('2026-10-19T06:00:00Z'); // lundi, après 05:30 UTC
const admin = {};

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { __mcQuotidien?: unknown }).__mcQuotidien = undefined;
  reserver.mockResolvedValue(true);
  rappels.mockResolvedValue({ etapes: 1, veille: 0, avis: 0, miseEnAvant: 0 });
  recap.mockResolvedValue({ envoyes: 2, ecartes: 0, reportes: 0 });
});

describe('rattraperQuotidienne', () => {
  it('ne fait rien avant 05:30 UTC, sans toucher à la base', async () => {
    const tot = new Date('2026-10-19T05:00:00Z');
    expect(await rattraperQuotidienne(admin, tot)).toBeNull();
    expect(reserver).not.toHaveBeenCalled();
  });

  it('joue la passe une fois, puis plus rien le même jour — sans requête', async () => {
    const r = await rattraperQuotidienne(admin, matin);
    expect(r?.recap.envoyes).toBe(2);
    expect(reserver).toHaveBeenCalledTimes(1);
    expect(await rattraperQuotidienne(admin, new Date(matin.getTime() + 60_000))).toBeNull();
    expect(reserver).toHaveBeenCalledTimes(1);
    expect(rappels).toHaveBeenCalledTimes(1);
  });

  it('le lundi, la file hebdomadaire part avec la quotidienne', async () => {
    await rattraperQuotidienne(admin, matin);
    expect(recap).toHaveBeenCalledWith(admin, { hebdo: true });
  });

  it('une réservation refusée est retentée seulement après la pause', async () => {
    reserver.mockResolvedValue(false);
    expect(await rattraperQuotidienne(admin, matin)).toBeNull();
    expect(await rattraperQuotidienne(admin, new Date(matin.getTime() + 60_000))).toBeNull();
    expect(reserver).toHaveBeenCalledTimes(1);
    await rattraperQuotidienne(admin, new Date(matin.getTime() + DELAI_NOUVEL_ESSAI_MS));
    expect(reserver).toHaveBeenCalledTimes(2);
    expect(rappels).not.toHaveBeenCalled();
  });

  it("un échec rend la réservation, remonte l'erreur et attend avant de réessayer", async () => {
    rappels.mockRejectedValueOnce(new Error('base indisponible'));
    await expect(rattraperQuotidienne(admin, matin)).rejects.toThrow('base indisponible');
    expect(liberer).toHaveBeenCalledTimes(1);
    expect(await rattraperQuotidienne(admin, new Date(matin.getTime() + 60_000))).toBeNull();
    const r = await rattraperQuotidienne(admin, new Date(matin.getTime() + DELAI_NOUVEL_ESSAI_MS));
    expect(r).not.toBeNull();
  });
});

describe('jouerPasseQuotidienne', () => {
  it("ne libère pas la réservation quand l'appelant ne l'a pas demandé (rejeu explicite)", async () => {
    recap.mockRejectedValueOnce(new Error('boom'));
    await expect(jouerPasseQuotidienne(admin, matin, { libererSiEchec: false })).rejects.toThrow('boom');
    expect(liberer).not.toHaveBeenCalled();
  });
});
