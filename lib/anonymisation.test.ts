import { describe, expect, it } from 'vitest';
import {
  NOM_MEMBRE_SUPPRIME,
  composerEmailSuppression,
  confirmationPseudoValide,
  estProfilSupprime,
  estSlugSupprime,
  identiteFantome,
  photosDeRecettes,
  remplacerPseudo,
  validerDemandeAdmin,
} from '@/lib/anonymisation';
import { PSEUDO_SLUG_MAX_LENGTH } from '@/lib/pseudo';

describe('identiteFantome', () => {
  it('produit une adresse publique courte et une adresse de connexion à nous', () => {
    const { slug, email } = identiteFantome('3f2a9c1e-0b4d-4e2a-9f00-1234567890ab');
    expect(slug).toBe('membre-supprime-3f2a9c1e');
    expect(slug.length).toBeLessThanOrEqual(PSEUDO_SLUG_MAX_LENGTH);
    expect(email).toBe('supprime-3f2a9c1e0b4d4e2a9f001234567890ab@anonyme.jepatisse.com');
  });
});

describe('estProfilSupprime', () => {
  it('ne confond pas suppression et désactivation', () => {
    expect(estProfilSupprime('deleted')).toBe(true);
    expect(estProfilSupprime('disabled')).toBe(false);
    expect(estProfilSupprime(null)).toBe(false);
  });
});

describe('estSlugSupprime', () => {
  it('reconnaît l’adresse d’un profil anonyme', () => {
    expect(estSlugSupprime('membre-supprime-3f2a9c1e')).toBe(true);
    expect(estSlugSupprime('membre-sympa')).toBe(false);
    expect(estSlugSupprime(null)).toBe(false);
  });
});

describe('confirmationPseudoValide', () => {
  it('ignore casse, accents et espaces de bord', () => {
    expect(confirmationPseudoValide('  élise ', 'Élise')).toBe(true);
    expect(confirmationPseudoValide('ELISE', 'Élise')).toBe(true);
  });
  it('refuse une autre saisie, ou un pseudo vide', () => {
    expect(confirmationPseudoValide('Elis', 'Élise')).toBe(false);
    expect(confirmationPseudoValide('', '')).toBe(false);
    expect(confirmationPseudoValide('x', null)).toBe(false);
  });
});

describe('validerDemandeAdmin', () => {
  const ctx = { acteurId: 'a', cibleId: 'm', cibleRole: null, cibleStatut: 'active' };
  it('exige un motif', () => {
    expect(validerDemandeAdmin({ motif: '  ' }, ctx).ok).toBe(false);
    expect(validerDemandeAdmin({}, ctx).ok).toBe(false);
    expect(validerDemandeAdmin({ motif: ' Demande RGPD ' }, ctx)).toEqual({ ok: true, demande: { motif: 'Demande RGPD' } });
  });
  it('refuse soi-même, un admin et un compte déjà supprimé', () => {
    expect(validerDemandeAdmin({ motif: 'x' }, { ...ctx, cibleId: 'a' }).ok).toBe(false);
    expect(validerDemandeAdmin({ motif: 'x' }, { ...ctx, cibleRole: 'admin' }).ok).toBe(false);
    expect(validerDemandeAdmin({ motif: 'x' }, { ...ctx, cibleStatut: 'deleted' }).ok).toBe(false);
  });
  it('accepte un gestionnaire', () => {
    expect(validerDemandeAdmin({ motif: 'x' }, { ...ctx, cibleRole: 'gestionnaire' }).ok).toBe(true);
  });
  it('borne la longueur du motif', () => {
    expect(validerDemandeAdmin({ motif: 'x'.repeat(501) }, ctx).ok).toBe(false);
  });
});

describe('remplacerPseudo', () => {
  it('remplace le pseudo comme mot entier', () => {
    expect(remplacerPseudo('Alice a mis « Tarte » en favori.', 'Alice')).toBe(`${NOM_MEMBRE_SUPPRIME} a mis « Tarte » en favori.`);
  });
  it('ne touche pas un mot qui le contient', () => {
    expect(remplacerPseudo('Alicette vous suit.', 'Alice')).toBe('Alicette vous suit.');
  });
  it('échappe les caractères spéciaux du pseudo', () => {
    expect(remplacerPseudo('J.P a donné son avis', 'J.P')).toBe(`${NOM_MEMBRE_SUPPRIME} a donné son avis`);
    expect(remplacerPseudo('JxP a donné son avis', 'J.P')).toBe('JxP a donné son avis');
  });
  it('laisse passer null et un pseudo vide', () => {
    expect(remplacerPseudo(null, 'Alice')).toBeNull();
    expect(remplacerPseudo('Alice', '')).toBe('Alice');
  });
});

describe('photosDeRecettes', () => {
  it('rassemble les URL de stockage sans doublon, jamais une data-URL', () => {
    const urls = photosDeRecettes(
      [{ hero_image_url: 'https://s/a.webp', hero_thumb_url: 'https://s/a.webp', hero_card_url: 'data:image/webp;base64,xx' }],
      [{ url: 'https://s/b.webp', original_url: null }],
    );
    expect(urls.sort()).toEqual(['https://s/a.webp', 'https://s/b.webp']);
  });
});

describe('composerEmailSuppression', () => {
  it('annonce la conservation des avis et la résiliation', () => {
    const m = composerEmailSuppression({ origine: 'membre', abonnementResilie: true, urlSite: 'https://dev.jepatisse.com/' });
    expect(m.texte).toContain('Comme vous l’avez demandé');
    expect(m.texte).toContain('« Membre supprimé »');
    expect(m.texte).toContain('aucun nouveau prélèvement');
    expect(m.texte).toContain('ne retrouverez aucune de vos données');
    expect(m.texte).toContain('https://dev.jepatisse.com/connexion');
  });
  it('donne le motif d’une suppression par l’équipe', () => {
    const m = composerEmailSuppression({ origine: 'admin', motif: 'Demande écrite', abonnementResilie: false, urlSite: 'https://x' });
    expect(m.texte).toContain('Motif : Demande écrite');
    expect(m.texte).not.toContain('prélèvement');
    expect(m.texte).toContain('https://x/contact');
  });
});
