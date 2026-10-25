// Gabarit unique des e-mails (JEP-277, JEP-378) et modèles GoTrue (JEP-276).
import { describe, expect, it } from 'vitest';
import { habillerEmail, lienSignatureValide, sansSignature, SIGNATURE_EMAIL } from '@/lib/email-gabarit';
import { LIENS_GOTRUE, modeleGoTrue, nextDepuisSuite } from '@/lib/gotrue-modeles';
import { composerRecapitulatif, sectionsRecap } from '@/lib/notification-email';

const URL_SITE = 'https://dev.jepatisse.com';

describe('habillerEmail', () => {
  it('pose en-tête, signature et pied « préférences »', () => {
    const m = habillerEmail({ texte: 'Bonjour,\n\nCorps.', pied: 'preferences', urlSite: URL_SITE });
    expect(m.html).toContain('Je pâtisse !</a>');
    expect(m.html).toContain(SIGNATURE_EMAIL);
    expect(m.html).toContain(`${URL_SITE}/reglages#notifications`);
    expect(m.texte).toContain(SIGNATURE_EMAIL);
    expect(m.texte).toContain('Gérer mes préférences');
  });
  it('pied obligatoire : aucun lien de préférences', () => {
    const m = habillerEmail({ texte: 'Corps.', pied: 'obligatoire', urlSite: URL_SITE });
    expect(m.html).toContain('Message obligatoire');
    expect(m.html).not.toContain('/reglages#notifications');
  });
  it('photo de signature seulement si posée (JEP-378)', () => {
    const sans = habillerEmail({ texte: 'x', pied: 'interne', urlSite: URL_SITE });
    expect(sans.html).not.toContain('<img');
    const avec = habillerEmail({ texte: 'x', pied: 'interne', urlSite: URL_SITE, photoSignature: 'https://s/p.jpg' });
    expect(avec.html).toContain('<img src="https://s/p.jpg"');
    expect(avec.html.indexOf(SIGNATURE_EMAIL)).toBeLessThan(avec.html.indexOf('<img'));
  });
  it('échappe le texte brut et ne double jamais la signature', () => {
    const m = habillerEmail({ texte: '<b>x</b>\n\nL’équipe « Je pâtisse ! »', pied: 'interne', urlSite: URL_SITE });
    expect(m.html).not.toContain('<b>x</b>');
    expect(m.texte.match(/équipe/g)).toHaveLength(1);
  });
  it('sansSignature retire les anciennes formes', () => {
    expect(sansSignature("Texte\n\nÀ bientôt,\nL'équipe Je pâtisse !")).toBe('Texte');
    expect(sansSignature('Texte\nL’équipe « Je pâtisse ! »')).toBe('Texte');
    expect(sansSignature('Texte')).toBe('Texte');
  });
});

describe('récapitulatif en sections (JEP-375)', () => {
  const lignes = [
    { categorie: 'mes_recettes' as const, rubrique: 'mes_recettes.favoris', titre: 'Favori', corps: 'Alice', lien: null },
    { categorie: 'fournees' as const, rubrique: 'fournees.veille', titre: 'Jour J demain', corps: 'Tarte', lien: '/fournee/1' },
    { categorie: 'fournees' as const, rubrique: 'fournees.etapes', titre: 'Étape', corps: 'Pâte', lien: '/fournee/1' },
  ];
  it('une section par type, rappels de fournée en tête', () => {
    const s = sectionsRecap(lignes);
    expect(s.map((x) => x.cle)).toEqual(['fournees.etapes', 'fournees.veille', 'mes_recettes.favoris']);
    expect(s[0].titre).toBe('Étapes à commencer aujourd’hui');
  });
  it('un seul e-mail pour tout', () => {
    const m = composerRecapitulatif({ prenom: 'Fab', lignes, rythme: 'quotidien', urlSite: URL_SITE });
    expect(m.sujet).toBe('Votre récapitulatif du jour — 3 informations');
    expect(m.html.match(/<h3/g)).toHaveLength(3);
  });
  it('sans rubrique connue : section de la catégorie', () => {
    expect(sectionsRecap([{ categorie: 'idees', titre: 't', corps: 'c', lien: null }])[0].titre).toBe('Boîte à idées');
  });
});

describe('modèles GoTrue (JEP-276)', () => {
  it('liens en token_hash, jamais ?code=', () => {
    for (const lien of Object.values(LIENS_GOTRUE)) {
      expect(lien).toContain('token_hash={{ .TokenHash }}');
      expect(lien).not.toContain('code=');
    }
    expect(LIENS_GOTRUE['confirmation-inscription']).toContain('type=signup');
    expect(LIENS_GOTRUE['mot-de-passe-oublie']).toContain('type=recovery&next=/reinitialiser-mot-de-passe');
  });
  it('page complète en français, variables Go intactes', () => {
    const html = modeleGoTrue('confirmation-inscription', { urlSite: URL_SITE, photoSignature: null });
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('Confirmer mon adresse e-mail');
    expect(html).toContain('{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}');
  });
  it('nextDepuisSuite lit le next du RedirectTo', () => {
    expect(nextDepuisSuite('https://dev.jepatisse.com/auth/callback?next=%2Fcarnet%2Fpartage%2Fabc')).toBe('/carnet/partage/abc');
    expect(nextDepuisSuite('https://dev.jepatisse.com')).toBeNull();
    expect(nextDepuisSuite('n’importe quoi')).toBeNull();
    expect(nextDepuisSuite(null)).toBeNull();
  });
});

describe('lien de la photo de signature', () => {
  it('rend la photo cliquable vers une adresse https', () => {
    const m = habillerEmail({ texte: 'x', pied: 'interne', urlSite: URL_SITE, photoSignature: 'https://s/p.jpg', lienSignature: 'https://www.jepatisse.com/blog' });
    expect(m.html).toContain('<a href="https://www.jepatisse.com/blog" target="_blank"');
    expect(m.html.indexOf('<a href="https://www.jepatisse.com/blog"')).toBeLessThan(m.html.indexOf('<img src="https://s/p.jpg"'));
  });
  it('refuse tout ce qui n’est pas https, et ne fait rien sans photo', () => {
    for (const l of ['http://x.fr', 'javascript:alert(1)', 'pas une adresse', '']) {
      expect(lienSignatureValide(l)).toBeNull();
      const m = habillerEmail({ texte: 'x', pied: 'interne', urlSite: URL_SITE, photoSignature: 'https://s/p.jpg', lienSignature: l });
      expect(m.html).not.toContain('target="_blank"');
    }
    const sansPhoto = habillerEmail({ texte: 'x', pied: 'interne', urlSite: URL_SITE, lienSignature: 'https://x.fr' });
    expect(sansPhoto.html).not.toContain('https://x.fr');
  });
});
