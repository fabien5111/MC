import { describe, expect, it } from 'vitest';
import { erreurUrlReseau, liensAffichables, type LienSocial } from '@/lib/social-links';

describe('erreurUrlReseau', () => {
  it('accepte vide et domaines attendus', () => {
    expect(erreurUrlReseau('instagram', '')).toBeNull();
    expect(erreurUrlReseau('instagram', '  ')).toBeNull();
    expect(erreurUrlReseau('instagram', ' https://www.instagram.com/jepatisse ')).toBeNull();
    expect(erreurUrlReseau('youtube', 'https://youtu.be/abc')).toBeNull();
    expect(erreurUrlReseau('pinterest', 'https://www.pinterest.fr/jepatisse')).toBeNull();
    expect(erreurUrlReseau('pinterest', 'https://www.pinterest.co.uk/jepatisse')).toBeNull();
    expect(erreurUrlReseau('facebook', 'https://fb.com/jepatisse')).toBeNull();
  });
  it('refuse http, domaine étranger et faux amis', () => {
    expect(erreurUrlReseau('instagram', 'http://www.instagram.com/x')).toMatch(/https/);
    expect(erreurUrlReseau('instagram', 'https://www.tiktok.com/x')).toMatch(/Instagram/);
    expect(erreurUrlReseau('instagram', 'https://instagram.com.evil.fr/x')).toMatch(/Instagram/);
    expect(erreurUrlReseau('tiktok', 'https://eviltiktok.com/x')).toMatch(/TikTok/);
    expect(erreurUrlReseau('facebook', 'pas une url')).toBe('Adresse invalide.');
  });
});

describe('liensAffichables', () => {
  const l = (network: LienSocial['network'], url: string | null, is_visible = true): LienSocial => ({
    network,
    url,
    is_visible,
  });
  it('filtre vide/masqué, garde l’ordre fixe, sans trou', () => {
    const res = liensAffichables([
      l('facebook', 'https://facebook.com/a'),
      l('tiktok', null),
      l('instagram', 'https://instagram.com/a'),
      l('youtube', 'https://youtube.com/a', false),
      l('pinterest', '  '),
    ]);
    expect(res.map((x) => x.network)).toEqual(['instagram', 'facebook']);
  });
  it('liste vide si rien à afficher', () => {
    expect(liensAffichables([])).toEqual([]);
    expect(liensAffichables([l('instagram', null)])).toEqual([]);
  });
});
