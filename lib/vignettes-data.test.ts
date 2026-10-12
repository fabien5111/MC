import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VignetteError, cleSourceRecette, fabriquerVignettes } from '@/lib/vignettes-data';

const BASE = 'https://s3.example.cloud/object/v1/AUTH_proj';

beforeEach(() => {
  vi.stubEnv('SWIFT_STORAGE_URL', BASE);
  vi.stubEnv('SWIFT_TEMPURL_KEY_PHOTOS', 'cle-de-test');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('cleSourceRecette', () => {
  it('accepte une photo de recette du conteneur public', () => {
    expect(cleSourceRecette(`${BASE}/jp-photos/recettes/abc.jpg`)).toBe('recettes/abc.jpg');
  });
  it('refuse une URL externe, un autre préfixe, un autre conteneur et une remontée de chemin', () => {
    expect(cleSourceRecette('https://evil.example/x.jpg')).toBeNull();
    expect(cleSourceRecette(`${BASE}/jp-photos/profils/abc.jpg`)).toBeNull();
    expect(cleSourceRecette(`${BASE}/jp-contact/recettes/abc.jpg`)).toBeNull();
    expect(cleSourceRecette(`${BASE}/jp-photos/recettes/../contact/x.jpg`)).toBeNull();
    expect(cleSourceRecette(null)).toBeNull();
  });
});

describe('fabriquerVignettes', () => {
  it('lit la source, dépose deux JPEG réduits et rend leurs URL', async () => {
    const source = await sharp({ create: { width: 1400, height: 1000, channels: 3, background: '#c66' } })
      .jpeg()
      .toBuffer();
    const deposes: { url: string; largeur: number }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (!init?.method) return new Response(new Uint8Array(source), { status: 200 });
        const meta = await sharp(Buffer.from(init.body as Uint8Array)).metadata();
        deposes.push({ url, largeur: meta.width ?? 0 });
        return new Response(null, { status: 201 });
      }),
    );
    const v = await fabriquerVignettes('recettes/abc.jpg');
    expect(deposes.map((d) => d.largeur)).toEqual([96, 480]);
    expect(deposes.every((d) => d.url.includes('temp_url_sig='))).toBe(true);
    expect(v.thumb).toMatch(/\/jp-photos\/recettes\/.+\.jpg$/);
    expect(v.card).toMatch(/\/jp-photos\/recettes\/.+\.jpg$/);
    expect(v.thumb).not.toBe(v.card);
  });

  it('nomme l’étape en échec', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 404 })));
    await expect(fabriquerVignettes('recettes/abc.jpg')).rejects.toMatchObject({ etape: 'lecture' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('pas une image', { status: 200 })));
    await expect(fabriquerVignettes('recettes/abc.jpg')).rejects.toBeInstanceOf(VignetteError);
  });
});
