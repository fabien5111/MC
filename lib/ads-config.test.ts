import { describe, expect, it } from 'vitest';
import { adSources } from './ads-config';

describe('adSources (JEP-367)', () => {
  it('sans visuel ordinateur : aucun visuel, même avec des variantes', () => {
    expect(adSources({ image_url: null, image_url_tablet: 't', image_url_mobile: 'm' })).toBeNull();
  });

  it('ordinateur seul : servi partout (campagne antérieure, colonnes absentes)', () => {
    expect(adSources({ image_url: 'd' })).toEqual({ desktop: 'd', tablet: 'd', mobile: 'd' });
  });

  it('le téléphone retombe sur la tablette avant l’ordinateur', () => {
    expect(adSources({ image_url: 'd', image_url_tablet: 't', image_url_mobile: null })).toEqual({
      desktop: 'd',
      tablet: 't',
      mobile: 't',
    });
  });

  it('la tablette retombe sur l’ordinateur, pas sur le téléphone', () => {
    expect(adSources({ image_url: 'd', image_url_tablet: '', image_url_mobile: 'm' })).toEqual({
      desktop: 'd',
      tablet: 'd',
      mobile: 'm',
    });
  });
});
