import { afterEach, describe, expect, it, vi } from 'vitest';

import { televerserImage } from '@/lib/storage-client';

// Une petite image webp 1×1 quelconque suffit : ce test porte sur le
// protocole (deux requêtes, dans quel ordre, avec quels en-têtes), jamais sur
// le contenu réel de l'image.
const DATA_URL = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

function reponseJson(corps: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => corps } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('televerserImage — valeurs déjà stables', () => {
  it('rend null inchangé, sans requête', async () => {
    const fetchEspion = vi.spyOn(global, 'fetch');
    expect(await televerserImage('recette', null)).toBeNull();
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it('rend une URL de stockage inchangée — idempotence de la reprise (§ 7.5)', async () => {
    const fetchEspion = vi.spyOn(global, 'fetch');
    const url = 'https://s3.pub2.infomaniak.cloud/v1/AUTH_x/jp-photos/recettes/a.webp';
    expect(await televerserImage('recette', url)).toBe(url);
    expect(fetchEspion).not.toHaveBeenCalled();
  });
});

describe('televerserImage — dépôt d’une data-URL', () => {
  it('présigne puis dépose, et rend l’URL finale du stockage', async () => {
    const urlDepot = 'https://s3.pub2.infomaniak.cloud/v1/AUTH_x/jp-photos/recettes/nouvelle.webp?temp_url_sig=abc';
    const urlFinale = 'https://s3.pub2.infomaniak.cloud/v1/AUTH_x/jp-photos/recettes/nouvelle.webp';

    const appels: { url: string; init?: RequestInit }[] = [];
    vi.spyOn(global, 'fetch').mockImplementation(async (url, init) => {
      appels.push({ url: String(url), init });
      if (appels.length === 1) {
        return reponseJson({ cle: 'recettes/nouvelle.webp', conteneur: 'photos', url: urlDepot, urlFinale });
      }
      return reponseJson({});
    });

    const resultat = await televerserImage('recette', DATA_URL);

    expect(resultat).toBe(urlFinale);
    expect(appels).toHaveLength(2);

    // Premier appel : la présignature, avec l'usage et le type MIME déclaré.
    expect(appels[0].url).toBe('/api/stockage/televersement');
    expect(appels[0].init?.method).toBe('POST');
    const corpsEnvoye = JSON.parse(String(appels[0].init?.body));
    expect(corpsEnvoye).toEqual({ usage: 'recette', mime: 'image/webp' });

    // Second appel : le dépôt direct sur l'URL signée rendue par le premier.
    expect(appels[1].url).toBe(urlDepot);
    expect(appels[1].init?.method).toBe('PUT');
    expect((appels[1].init?.headers as Record<string, string>)['Content-Type']).toBe('image/webp');
    expect(appels[1].init?.body).toBeInstanceOf(Blob);
    expect((appels[1].init?.body as Blob).type).toBe('image/webp');
  });

  it('propage le motif de refus si la présignature échoue', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      reponseJson({ error: 'Réservé à l’administration.' }, false, 403),
    );
    await expect(televerserImage('article', DATA_URL)).rejects.toThrow('Réservé à l’administration.');
  });

  it('échoue si le dépôt lui-même est refusé par le stockage', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        reponseJson({ cle: 'articles/x.webp', conteneur: 'photos', url: 'https://x/y', urlFinale: 'https://x/z' }),
      )
      .mockResolvedValueOnce(reponseJson({}, false, 401));
    await expect(televerserImage('article', DATA_URL)).rejects.toThrow(/401/);
  });

  it('échoue si le serveur ne rend pas d’URL finale', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      reponseJson({ cle: 'x', conteneur: 'contact', url: 'https://x/y', urlFinale: null }),
    );
    await expect(televerserImage('recette', DATA_URL)).rejects.toThrow(/URL finale/);
  });
});
