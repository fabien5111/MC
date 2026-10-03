import { afterEach, describe, expect, it, vi } from 'vitest';

// `GA_ID` est lu une fois, à l'import de `lib/consent.ts` : on réimporte le
// module après avoir posé la variable.
async function charger(id = 'G-TEST') {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_GA_ID', id);
  return (await import('@/lib/analytics')).trackEvent;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('trackEvent', () => {
  it("ne fait rien côté serveur (pas de `window`)", async () => {
    const trackEvent = await charger();
    expect(() => trackEvent('terminer_fournee')).not.toThrow();
  });

  it("ne fait rien tant que gtag n'existe pas (visiteur n'ayant pas accepté)", async () => {
    const trackEvent = await charger();
    vi.stubGlobal('window', {});
    expect(() => trackEvent('creer_fournee', { recipe_id: 'r1' })).not.toThrow();
  });

  it("transmet le nom et les paramètres à gtag une fois accepté", async () => {
    const trackEvent = await charger();
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });
    trackEvent('ajouter_favori', { recipe_id: 'r1' });
    trackEvent('terminer_fournee');
    expect(gtag).toHaveBeenNthCalledWith(1, 'event', 'ajouter_favori', { recipe_id: 'r1' });
    expect(gtag).toHaveBeenNthCalledWith(2, 'event', 'terminer_fournee', undefined);
  });

  it("n'émet rien après un refus survenu dans la même page (ga-disable)", async () => {
    const trackEvent = await charger('G-TEST');
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag, 'ga-disable-G-TEST': true });
    trackEvent('generer_liste_courses');
    expect(gtag).not.toHaveBeenCalled();
  });

  it("n'interrompt jamais le geste de l'utilisateur si gtag lève", async () => {
    const trackEvent = await charger();
    vi.stubGlobal('window', {
      gtag: () => {
        throw new Error('boom');
      },
    });
    expect(() => trackEvent('importer_recette', { source: 'pdf' })).not.toThrow();
  });
});
