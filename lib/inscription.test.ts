import { describe, expect, it } from 'vitest';

import { PARAM_INSCRIPTION, avecMarqueInscription, estMethodeInscription, methodeInscription } from '@/lib/inscription';

describe('methodeInscription', () => {
  it('reconnaît les deux fournisseurs du site', () => {
    expect(methodeInscription('email')).toBe('email');
    expect(methodeInscription('google')).toBe('google');
  });

  it("renvoie null pour tout autre fournisseur : pas d'événement hors de la liste fermée", () => {
    expect(methodeInscription('facebook')).toBeNull();
    expect(methodeInscription('')).toBeNull();
    expect(methodeInscription(null)).toBeNull();
    expect(methodeInscription(undefined)).toBeNull();
  });
});

describe('estMethodeInscription', () => {
  it("n'accepte que email et google, quelle que soit la casse ou le type", () => {
    expect(estMethodeInscription('email')).toBe(true);
    expect(estMethodeInscription('google')).toBe(true);
    expect(estMethodeInscription('Google')).toBe(false);
    expect(estMethodeInscription(' email')).toBe(false);
    expect(estMethodeInscription(1)).toBe(false);
    expect(estMethodeInscription(null)).toBe(false);
  });
});

describe('avecMarqueInscription', () => {
  it('ajoute le marqueur à un chemin simple', () => {
    expect(avecMarqueInscription('/', 'email')).toBe(`/?${PARAM_INSCRIPTION}=email`);
  });

  it('conserve les autres paramètres et l\'ancre', () => {
    expect(avecMarqueInscription('/carnet?scope=shared#haut', 'google')).toBe(
      `/carnet?scope=shared&${PARAM_INSCRIPTION}=google#haut`,
    );
  });

  it('remplace un marqueur déjà présent plutôt que de le doubler', () => {
    expect(avecMarqueInscription(`/?${PARAM_INSCRIPTION}=google`, 'email')).toBe(`/?${PARAM_INSCRIPTION}=email`);
  });

  it("rend le chemin tel quel sans méthode, et n'y laisse jamais l'hôte factice", () => {
    expect(avecMarqueInscription('/profil?a=1', null)).toBe('/profil?a=1');
    expect(avecMarqueInscription('/profil', 'email')).not.toContain('invalid');
  });

  it("garde intact un chemin déjà encodé, comme le `next` d'un lien de partage", () => {
    const chemin = '/carnet/partage/abc.def/deverrouiller';
    expect(avecMarqueInscription(chemin, 'email')).toBe(`${chemin}?${PARAM_INSCRIPTION}=email`);
  });
});
