import { describe, expect, it } from 'vitest';
import {
  dureeGoogleMs,
  estWord,
  fichierConvient,
  hotePhotosAutorise,
  idNotionValide,
  lireRetourOAuth,
  mimeDepuisNom,
  nomPdfDepuisWord,
  notionBlocsEnTexte,
  sourcesPour,
  titrePageNotion,
  urlMediaPhotos,
  type BlocNotion,
} from '@/lib/stockage-en-ligne';

const p = (type: string, texte: string, extra: Record<string, unknown> = {}): BlocNotion => ({
  id: Math.random().toString(),
  type,
  [type]: { rich_text: [{ plain_text: texte }], ...extra },
});

describe('sourcesPour', () => {
  it("n'affiche que les sources configurées et capables de l'usage", () => {
    const config = { google: { clientId: 'a', apiKey: 'b', appId: 'c' }, dropbox: { appKey: 'd' } };
    expect(sourcesPour('image', config).map((s) => s.id)).toEqual(['google_drive', 'dropbox']);
    expect(sourcesPour('texte', config).map((s) => s.id)).toEqual(['google_drive']);
    expect(sourcesPour('image', {})).toEqual([]);
  });
  it('une seule configuration Microsoft ouvre OneDrive et OneNote', () => {
    const config = { microsoft: { clientId: 'x' } };
    expect(sourcesPour('pdf', config).map((s) => s.id)).toEqual(['onedrive']);
    expect(sourcesPour('texte', config).map((s) => s.id)).toEqual(['onenote']);
  });
  it('Google Photos ne sert que les photos', () => {
    const config = { googlePhotos: { clientId: 'x' }, notion: { clientId: 'n' } };
    expect(sourcesPour('image', config).map((s) => s.id)).toEqual(['google_photos']);
    expect(sourcesPour('pdf', config)).toEqual([]);
    expect(sourcesPour('texte', config).map((s) => s.id)).toEqual(['notion']);
  });
});

describe('fichierConvient', () => {
  it('reconnaît les images par type ou par extension', () => {
    expect(fichierConvient('a.JPG', null, 'image')).toBe(true);
    expect(fichierConvient('sans-extension', 'image/webp', 'image')).toBe(true);
    expect(fichierConvient('photo.heic', 'image/heic', 'image')).toBe(false);
    expect(fichierConvient('a.pdf', null, 'image')).toBe(false);
  });
  it('reconnaît les PDF', () => {
    expect(fichierConvient('Recette.PDF', null, 'pdf')).toBe(true);
    expect(fichierConvient('x', 'application/pdf', 'pdf')).toBe(true);
    expect(fichierConvient('a.docx', null, 'pdf')).toBe(false);
  });
});

describe('Word et types', () => {
  it('repère un document Word et nomme le PDF converti', () => {
    expect(estWord('Ma recette.docx')).toBe(true);
    expect(estWord('vieux.DOC')).toBe(true);
    expect(estWord('a.pdf')).toBe(false);
    expect(nomPdfDepuisWord('Ma recette.docx')).toBe('Ma recette.pdf');
  });
  it('déduit le type MIME du nom', () => {
    expect(mimeDepuisNom('a.jpeg')).toBe('image/jpeg');
    expect(mimeDepuisNom('a.pdf')).toBe('application/pdf');
    expect(mimeDepuisNom('a.zip')).toBe('application/octet-stream');
  });
});

describe('hotePhotosAutorise', () => {
  it('admet les hôtes de médias Google Photos en https', () => {
    expect(hotePhotosAutorise('https://lh3.googleusercontent.com/abc=w2048-h2048')).toBe(true);
    expect(hotePhotosAutorise('https://lh5.googleusercontent.com/x')).toBe(true);
  });
  it('refuse tout le reste (SSRF)', () => {
    expect(hotePhotosAutorise('http://lh3.googleusercontent.com/x')).toBe(false);
    expect(hotePhotosAutorise('https://lh3.googleusercontent.com.evil.fr/x')).toBe(false);
    expect(hotePhotosAutorise('https://evil.fr/lh3.googleusercontent.com')).toBe(false);
    expect(hotePhotosAutorise('https://lh3.googleusercontent.com:8443/x')).toBe(false);
    expect(hotePhotosAutorise('https://user:pw@lh3.googleusercontent.com/x')).toBe(false);
    expect(hotePhotosAutorise('https://googleusercontent.com/x')).toBe(false);
    expect(hotePhotosAutorise('https://169.254.169.254/latest')).toBe(false);
    expect(hotePhotosAutorise('pas une adresse')).toBe(false);
  });
  it('demande une version bornée, jamais l’original', () => {
    expect(urlMediaPhotos('https://lh3.googleusercontent.com/abc')).toBe('https://lh3.googleusercontent.com/abc=w2048-h2048');
  });
});

describe('dureeGoogleMs', () => {
  it('lit une durée Google et la borne', () => {
    expect(dureeGoogleMs('5s', 3000)).toBe(5000);
    expect(dureeGoogleMs('1.5s', 3000)).toBe(1500);
    expect(dureeGoogleMs('0.1s', 3000)).toBe(1000);
    expect(dureeGoogleMs(undefined, 3000)).toBe(3000);
    expect(dureeGoogleMs('n’importe quoi', 4000)).toBe(4000);
  });
});

describe('notionBlocsEnTexte', () => {
  it('rend titres, listes, cases et citations', () => {
    const texte = notionBlocsEnTexte([
      p('heading_1', 'Tarte au citron'),
      p('paragraph', 'Pour 8 personnes'),
      p('heading_2', 'Ingrédients'),
      p('bulleted_list_item', '200 g de farine'),
      p('bulleted_list_item', '100 g de beurre'),
      p('heading_2', 'Étapes'),
      p('numbered_list_item', 'Sabler'),
      p('numbered_list_item', 'Cuire'),
      p('to_do', 'Servir frais', { checked: true }),
      p('quote', 'Astuce : filmer au contact'),
      { id: 'img', type: 'image', image: {} },
    ]);
    expect(texte).toBe(
      [
        'Tarte au citron',
        'Pour 8 personnes',
        '',
        'Ingrédients',
        '- 200 g de farine',
        '- 100 g de beurre',
        '',
        'Étapes',
        '1. Sabler',
        '2. Cuire',
        '- [x] Servir frais',
        '> Astuce : filmer au contact',
      ].join('\n'),
    );
  });
  it('renumérote une liste interrompue et indente les enfants', () => {
    const enfant = p('bulleted_list_item', '50 g de sucre');
    const texte = notionBlocsEnTexte([
      { ...p('numbered_list_item', 'Crème'), enfants: [enfant] },
      p('paragraph', 'puis'),
      p('numbered_list_item', 'Pâte'),
    ]);
    expect(texte).toBe('1. Crème\n  - 50 g de sucre\npuis\n1. Pâte');
  });
  it('rend les lignes de tableau', () => {
    const ligne: BlocNotion = {
      id: 'r',
      type: 'table_row',
      table_row: { cells: [[{ plain_text: 'Farine' }], [{ plain_text: '200 g' }]] },
    };
    expect(notionBlocsEnTexte([{ id: 't', type: 'table', table: {}, enfants: [ligne] }])).toBe('Farine | 200 g');
  });
});

describe('Notion : titre et identifiant', () => {
  it('lit le titre ou rend « Sans titre »', () => {
    expect(titrePageNotion({ properties: { Name: { type: 'title', title: [{ plain_text: 'Éclair' }] } } })).toBe('Éclair');
    expect(titrePageNotion({ properties: {} })).toBe('Sans titre');
  });
  it('valide un identifiant de page', () => {
    expect(idNotionValide('59833787-2cf9-4fdf-8782-e53db20768a5')).toBe(true);
    expect(idNotionValide('598337872cf94fdf8782e53db20768a5')).toBe(true);
    expect(idNotionValide('../../v1/users')).toBe(false);
    expect(idNotionValide(42)).toBe(false);
  });
});

describe('lireRetourOAuth', () => {
  it('lit le code et l’état', () => {
    expect(lireRetourOAuth('?code=abc&state=s1')).toEqual({ state: 's1', code: 'abc', erreur: null });
  });
  it('lit une erreur', () => {
    expect(lireRetourOAuth('error=access_denied&error_description=Refus&state=s2')).toEqual({
      state: 's2',
      code: null,
      erreur: 'Refus',
    });
  });
  it('ignore un retour sans état', () => {
    expect(lireRetourOAuth('?code=abc')).toBeNull();
  });
});
