import { afterEach, describe, expect, it, vi } from 'vitest';

// `GA_ID` est lu une fois, à l'import de `lib/consent.ts` : on réimporte le
// module après avoir posé la variable.
async function charger(id = 'G-TEST') {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_GA_ID', id);
  return (await import('@/lib/analytics')).trackEvent;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// `trackEventQuandPret` n'est pas exporté par `charger()` (qui ne rend que
// `trackEvent`) : on en importe les deux après avoir posé la variable.
async function chargerTout(id = 'G-TEST') {
  vi.resetModules();
  vi.stubEnv('NEXT_PUBLIC_GA_ID', id);
  return import('@/lib/analytics');
}

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

describe('trackEventQuandPret', () => {
  it('envoie tout de suite quand GA est déjà chargé', async () => {
    const { trackEventQuandPret } = await chargerTout();
    const gtag = vi.fn();
    vi.stubGlobal('window', { gtag });
    trackEventQuandPret('sign_up', { method: 'email' });
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'email' });
  });

  it("attend que GA se charge, puis envoie une seule fois", async () => {
    vi.useFakeTimers();
    const { trackEventQuandPret } = await chargerTout();
    const fenetre: Record<string, unknown> = {};
    vi.stubGlobal('window', fenetre);
    trackEventQuandPret('sign_up', { method: 'google' });

    vi.advanceTimersByTime(1000);
    const gtag = vi.fn();
    fenetre.gtag = gtag; // le script de GA vient de s'exécuter
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(5000);

    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag).toHaveBeenCalledWith('event', 'sign_up', { method: 'google' });
  });

  it("abandonne après le délai sans accord : rien ne part, plus aucun essai", async () => {
    vi.useFakeTimers();
    const { trackEventQuandPret, DELAI_ATTENTE_GA_MS } = await chargerTout();
    const fenetre: Record<string, unknown> = {};
    vi.stubGlobal('window', fenetre);
    trackEventQuandPret('sign_up', { method: 'email' });

    vi.advanceTimersByTime(DELAI_ATTENTE_GA_MS + 1000);
    expect(vi.getTimerCount()).toBe(0);

    const gtag = vi.fn();
    fenetre.gtag = gtag; // trop tard
    vi.advanceTimersByTime(5000);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("s'arrête dès qu'un refus est posé, même si GA arrive ensuite", async () => {
    vi.useFakeTimers();
    const { trackEventQuandPret } = await chargerTout('G-TEST');
    const fenetre: Record<string, unknown> = {};
    vi.stubGlobal('window', fenetre);
    trackEventQuandPret('sign_up', { method: 'email' });

    fenetre['ga-disable-G-TEST'] = true;
    const gtag = vi.fn();
    fenetre.gtag = gtag;
    vi.advanceTimersByTime(2000);

    expect(gtag).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ne fait rien côté serveur (pas de `window`)", async () => {
    vi.useFakeTimers();
    const { trackEventQuandPret } = await chargerTout();
    expect(() => trackEventQuandPret('sign_up', { method: 'email' })).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
