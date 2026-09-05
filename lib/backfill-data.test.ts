import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deposerDataUrlServeur, urlRepond } from '@/lib/backfill-data';

// Pendant SERVEUR de `televerserImage()` (lib/storage-client.test.ts) : ici
// le dépôt se fait en un seul `fetch` (PUT direct sur l'URL signée), sans
// requête de présignature préalable — le serveur signe lui-même (§ 7.5, lot B3).
const DATA_URL = 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

const ENV = {
  SWIFT_STORAGE_URL: 'https://s3.pub2.infomaniak.cloud/v1/AUTH_test',
  SWIFT_TEMPURL_KEY_PHOTOS: 'cle-photos-test',
  SWIFT_TEMPURL_KEY_CONTACT: 'cle-contact-test',
};

describe('deposerDataUrlServeur', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.restoreAllMocks();
  });

  it('dépose directement (un seul appel réseau) et rend l’URL canonique', async () => {
    const fetchEspion = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

    const resultat = await deposerDataUrlServeur('recette', DATA_URL);

    expect(fetchEspion).toHaveBeenCalledTimes(1);
    const [url, init] = fetchEspion.mock.calls[0];
    expect(String(url)).toContain('/jp-photos/recettes/');
    expect(String(url)).toContain('temp_url_sig=');
    expect((init as RequestInit).method).toBe('PUT');
    expect(((init as RequestInit).headers as Record<string, string>)['Content-Type']).toBe('image/webp');

    // `urlCanonique` (le résultat) et `urlDeTeleversement` (l'URL déposée)
    // partagent exactement le même chemin — seule la signature diffère.
    expect(resultat).toBe(String(url).split('?')[0]);
    expect(resultat).not.toContain('temp_url_sig');
  });

  it('lève si le dépôt est refusé par le stockage', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 403 } as Response);
    await expect(deposerDataUrlServeur('recette', DATA_URL)).rejects.toThrow(/403/);
  });

  it('lève sans appeler le réseau si le format de la data-URL n’est pas reconnu', async () => {
    const fetchEspion = vi.spyOn(global, 'fetch');
    await expect(deposerDataUrlServeur('recette', 'data:text/plain;base64,AAAA')).rejects.toThrow(/non reconnu/);
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it('dépose sur `jp-contact` pour l’usage contact — cloisonnement respecté', async () => {
    const fetchEspion = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    await deposerDataUrlServeur('contact', DATA_URL);
    const [url] = fetchEspion.mock.calls[0];
    expect(String(url)).toContain('/jp-contact/contact/');
  });
});

// § 7.5/§ 8, lot B4 : la vérification a posteriori relit chaque URL migrée.
// Sur le conteneur public, l'URL canonique stockée en base suffit ; sur le
// conteneur privé (`contact`), un `GET`/`HEAD` nu échouerait sans signature —
// `urlRepond` doit donc la re-signer avant de la relire, exactement comme
// `signerPhotoContact` (lib/contact-data.ts) le fait pour l'affichage.
describe('urlRepond', () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    Object.assign(process.env, ENV);
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.restoreAllMocks();
  });

  it('relit l’URL telle quelle sur le conteneur public', async () => {
    const url = 'https://s3.pub2.infomaniak.cloud/v1/AUTH_test/jp-photos/recettes/a.webp';
    const fetchEspion = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    expect(await urlRepond('recette', url)).toBe(true);
    const [urlAppelee, init] = fetchEspion.mock.calls[0];
    expect(String(urlAppelee)).toBe(url);
    expect((init as RequestInit).method).toBe('HEAD');
  });

  it('re-signe l’URL avant de la relire sur le conteneur privé', async () => {
    const url = 'https://s3.pub2.infomaniak.cloud/v1/AUTH_test/jp-contact/contact/a.jpg';
    const fetchEspion = vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);
    await urlRepond('contact', url);
    const [urlAppelee] = fetchEspion.mock.calls[0];
    expect(String(urlAppelee)).not.toBe(url);
    expect(String(urlAppelee)).toContain('temp_url_sig=');
  });

  it('rend false sur une réponse en échec', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    expect(await urlRepond('recette', 'https://s3.x/v1/AUTH_x/jp-photos/recettes/a.webp')).toBe(false);
  });

  it('rend false plutôt que de lever sur une panne réseau', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed'));
    expect(await urlRepond('recette', 'https://s3.x/v1/AUTH_x/jp-photos/recettes/a.webp')).toBe(false);
  });
});
