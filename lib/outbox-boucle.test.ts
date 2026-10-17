// Tests de la boucle de vidange : un tour lent ne doit pas empiler les suivants
// (deux vidanges concurrentes), un échec ne doit pas l'arrêter, et elle ne doit
// démarrer qu'en opt-in (l'aperçu de PR partage la base de production).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boucleOutboxActivee, creerBoucle } from '@/lib/outbox-boucle';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('creerBoucle', () => {
  it('joue le premier tour après le délai initial, puis à chaque période', async () => {
    const tache = vi.fn(async () => undefined);
    const boucle = creerBoucle(tache, 60_000, { delaiInitialMs: 15_000 });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(tache).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(tache).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(45_000); // t = 60 s : premier tour de la période
    expect(tache).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tache).toHaveBeenCalledTimes(3);
    boucle.arreter();
  });

  it("n'empile pas les tours quand l'un d'eux dure plus d'une période", async () => {
    let enParallele = 0;
    let maxParallele = 0;
    const lente = vi.fn(async () => {
      enParallele++;
      maxParallele = Math.max(maxParallele, enParallele);
      await new Promise((r) => setTimeout(r, 150_000));
      enParallele--;
    });
    const boucle = creerBoucle(lente, 60_000, { delaiInitialMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120_000); // deux périodes écoulées, le premier tour dure encore
    expect(lente).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(40_000); // t = 160 s : le premier tour est fini
    await vi.advanceTimersByTimeAsync(20_000); // t = 180 s : le tour suivant peut partir
    expect(lente).toHaveBeenCalledTimes(2);
    expect(maxParallele).toBe(1);
    boucle.arreter();
  });

  it("un tour qui échoue est signalé et n'arrête pas la boucle", async () => {
    const tache = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('base injoignable'))
      .mockResolvedValue(undefined);
    const surErreur = vi.fn();
    const boucle = creerBoucle(tache, 60_000, { delaiInitialMs: 0, surErreur });
    await vi.advanceTimersByTimeAsync(0);
    expect(surErreur).toHaveBeenCalledTimes(1);
    expect((surErreur.mock.calls[0][0] as Error).message).toBe('base injoignable');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tache).toHaveBeenCalledTimes(2);
    expect(surErreur).toHaveBeenCalledTimes(1);
    boucle.arreter();
  });

  it('ne joue plus rien après arreter()', async () => {
    const tache = vi.fn(async () => undefined);
    const boucle = creerBoucle(tache, 60_000, { delaiInitialMs: 10_000 });
    boucle.arreter();
    await vi.advanceTimersByTimeAsync(300_000);
    expect(tache).not.toHaveBeenCalled();
  });
});

describe('boucleOutboxActivee', () => {
  it('est un opt-in strict : seule la valeur « true » active la boucle', () => {
    expect(boucleOutboxActivee({ OUTBOX_BOUCLE: 'true' })).toBe(true);
    expect(boucleOutboxActivee({})).toBe(false);
    expect(boucleOutboxActivee({ OUTBOX_BOUCLE: 'false' })).toBe(false);
    expect(boucleOutboxActivee({ OUTBOX_BOUCLE: '1' })).toBe(false);
    expect(boucleOutboxActivee({ OUTBOX_BOUCLE: 'TRUE' })).toBe(false);
    expect(boucleOutboxActivee({ OUTBOX_BOUCLE: '' })).toBe(false);
  });
});
