// Un affichage facultatif ne doit pas faire tomber une page quand Stripe n'est pas
// configuré (04/10/2026 : /reglages en erreur pour un membre ayant un abonnement
// Stripe, la clé étant absente du serveur).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appelStripe, getChangementProgramme, MissingStripeConfigError } from '@/lib/billing-data';

describe('sans STRIPE_SECRET_KEY', () => {
  const avant = process.env.STRIPE_SECRET_KEY;
  beforeEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    if (avant === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = avant;
    vi.restoreAllMocks();
  });

  it('getChangementProgramme (affichage) répond « rien de programmé »', async () => {
    await expect(getChangementProgramme('sub_123')).resolves.toBeNull();
  });

  it('appelStripe (paiement) continue de lever : jamais de dégradation silencieuse', async () => {
    await expect(appelStripe('/subscriptions/sub_123')).rejects.toBeInstanceOf(MissingStripeConfigError);
  });
});
