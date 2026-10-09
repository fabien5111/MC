import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  choisirPhotoJira,
  critereDestinataire,
  lireFichierImportJira,
  marqueImportJira,
  natureCle,
  preparerBrouillonJira,
  rendementComposant,
} from './import-jira';

// Référentiel minimal, aux noms de la base réelle : suffit à vérifier que les
// unités courantes des recettes (g, ml, pièce, feuille → g) sont reconnues.
const UNITS = [
  { name: 'g', abbreviation: 'g' },
  { name: 'ml', abbreviation: 'ml' },
  { name: 'pièce', abbreviation: 'pc' },
];

const RECETTE = {
  titre: 'Tarte test',
  rendement: '6 personnes',
  video_url: null,
  auteur_origine: 'Chaîne test',
  etapes: [
    {
      nom_etape: 'Pâte',
      anticipation_jours: 1,
      temps_preparation_minutes: 10,
      temps_attente_minutes: 60,
      ingredients: [
        { nom: 'farine', quantite: 250, unite: 'g' },
        { nom: 'gélatine', quantite: 1, unite: 'feuille' },
      ],
      instructions: ['Mélanger.'],
    },
  ],
  conseils_conservation: '  Au frais.  ',
};

describe('lireFichierImportJira', () => {
  it('accepte un fichier complet et normalise la clé', () => {
    const r = lireFichierImportJira({ ticket: 'jep-12', recette: RECETTE }, 'JEP-12');
    expect(r).toEqual({ fichier: { ticket: 'JEP-12', recette: RECETTE } });
  });

  it('refuse un fichier rangé sous une autre clé que celle qu’il déclare', () => {
    const r = lireFichierImportJira({ ticket: 'JEP-12', recette: RECETTE }, 'JEP-13');
    expect(r).toHaveProperty('erreur');
  });

  it('accepte une clé locale et la normalise', () => {
    const r = lireFichierImportJira({ ticket: 'Local-Genoise', recette: RECETTE }, 'local-genoise');
    expect(r).toEqual({ fichier: { ticket: 'local-genoise', recette: RECETTE } });
  });

  it('refuse une clé locale rangée sous un autre nom', () => {
    expect(lireFichierImportJira({ ticket: 'local-genoise', recette: RECETTE }, 'local-dacquoise')).toHaveProperty('erreur');
  });

  it('refuse un fichier sans recette', () => {
    expect(lireFichierImportJira({ ticket: 'JEP-12' }, 'JEP-12')).toHaveProperty('erreur');
  });
});

describe('natureCle', () => {
  it('reconnaît un ticket Jira, ramené en majuscules', () => {
    expect(natureCle(' jep-242 ')).toEqual({ nature: 'jira', cle: 'JEP-242' });
  });

  it('reconnaît une clé locale, ramenée en minuscules', () => {
    expect(natureCle('LOCAL-Genoise-Nature')).toEqual({ nature: 'locale', cle: 'local-genoise-nature' });
    expect(natureCle('local-biscuit-joconde-2')).toEqual({ nature: 'locale', cle: 'local-biscuit-joconde-2' });
  });

  it('ne confond jamais une clé locale avec un ticket Jira', () => {
    // « LOCAL-2 » a la forme d'un ticket du projet LOCAL : une clé locale
    // commence donc obligatoirement par une lettre après le préfixe.
    expect(natureCle('local-2')).toEqual({ nature: 'jira', cle: 'LOCAL-2' });
    expect(natureCle('local-génoise')).toHaveProperty('erreur');
  });

  it('refuse une clé malformée', () => {
    expect(natureCle('')).toHaveProperty('erreur');
    expect(natureCle('genoise')).toHaveProperty('erreur');
    expect(natureCle('local-')).toHaveProperty('erreur');
    expect(natureCle('local-a b')).toHaveProperty('erreur');
  });
});

describe('marqueImportJira', () => {
  it('garde la marque historique d’un ticket Jira', () => {
    expect(marqueImportJira('JEP-242')).toBe('Jira JEP-242');
  });

  it('distingue une clé locale', () => {
    expect(marqueImportJira('local-genoise-nature')).toBe('Import local-genoise-nature');
  });
});

describe('critereDestinataire', () => {
  it('reconnaît un e-mail, ramené en minuscules', () => {
    expect(critereDestinataire(' Hugo.Test@Example.com ')).toEqual({ colonne: 'email', valeur: 'hugo.test@example.com' });
  });

  it('reconnaît un pseudo (slug)', () => {
    expect(critereDestinataire('fabien-chenu')).toEqual({ colonne: 'username', valeur: 'fabien-chenu' });
  });

  it('refuse une saisie vide ou malformée', () => {
    expect(critereDestinataire('  ')).toHaveProperty('erreur');
    expect(critereDestinataire('a@b')).toHaveProperty('erreur');
    expect(critereDestinataire('Fabien Chenu')).toHaveProperty('erreur');
  });
});

describe('choisirPhotoJira', () => {
  it('retient la première image jointe et ignore le reste', () => {
    const r = choisirPhotoJira([
      { id: '20', mimeType: 'image/jpeg', filename: 'b.jpg', content: 'u2' },
      { id: '5', mimeType: 'application/pdf', filename: 'x.pdf', content: 'u0' },
      { id: '10', mimeType: 'image/png', filename: 'a.png', content: 'u1' },
    ]);
    expect(r.piece?.id).toBe('10');
    expect(r.alerte).toMatch(/2 photos/);
  });

  it('signale l’absence de photo sans bloquer', () => {
    const r = choisirPhotoJira([]);
    expect(r.piece).toBeNull();
    expect(r.alerte).toMatch(/Aucune photo/);
  });
});

const COMPOSANT = {
  ...RECETTE,
  titre: 'Biscuit génoise',
  rendement: '1 plaque 40 x 30 cm, environ 1 cm d’épaisseur après cuisson — environ 500 g de pâte',
  astuces_recette: [
    'Utilisation — Entremets rond Ø 20 cm, disque de 1 cm : ≈ 130 g de pâte, soit ×0,26 de la recette.',
    'Utilisation — Bûche en gouttière 20 x 7 cm : ≈ 60 g de pâte, soit ×0,12 de la recette.',
    'Astuce — Imbiber d’un sirop au montage.',
  ],
};

describe('rendementComposant', () => {
  it('ignore une recette qui n’est pas une fiche de composant', () => {
    expect(rendementComposant(RECETTE)).toBeNull();
    expect(rendementComposant({ ...RECETTE, astuces_recette: ['Laisser reposer une nuit.'] })).toBeNull();
  });

  it('sépare masse, complément d’informations et astuces', () => {
    expect(rendementComposant(COMPOSANT)).toEqual({
      masse: 500,
      notesQuantites: [
        '1 plaque 40 x 30 cm, environ 1 cm d’épaisseur après cuisson',
        'Entremets rond Ø 20 cm, disque de 1 cm : ≈ 130 g de pâte, soit ×0,26 de la recette.',
        'Bûche en gouttière 20 x 7 cm : ≈ 60 g de pâte, soit ×0,12 de la recette.',
      ].join('\n'),
      notes: 'Imbiber d’un sirop au montage.',
    });
  });

  it('n’invente pas de masse quand le rendement n’en donne pas', () => {
    const r = rendementComposant({ ...COMPOSANT, rendement: '1 plaque 40 x 30 cm' });
    expect(r?.masse).toBeNull();
    expect(r?.notesQuantites.split('\n')[0]).toBe('1 plaque 40 x 30 cm');
  });
});

describe('preparerBrouillonJira', () => {
  const maintenant = new Date('2026-09-29T10:00:00Z');

  it('produit le même pivot que l’import par texte collé, photo comprise', () => {
    const fichier = { ticket: 'JEP-12', recette: RECETTE };
    const { pivot, erreurs } = preparerBrouillonJira(fichier, UNITS, 'https://h/jp-photos/recettes/a.jpg', maintenant);
    expect(erreurs).toEqual([]);
    expect(pivot.statut).toBe('brouillon');
    expect(pivot.source).toMatchObject({ type: 'texte', fichier_original: 'Jira JEP-12', auteur_origine: 'Chaîne test' });
    expect(pivot.conseils_degustation).toBe('Au frais.');
    expect(pivot.photo_principale).toBe('https://h/jp-photos/recettes/a.jpg');
    expect(pivot.photo_principale_original).toBe('https://h/jp-photos/recettes/a.jpg');
    const ings = pivot.sous_preparations[0].ingredients;
    expect(ings[0]).toMatchObject({ nom: 'Farine', quantite: 250, unite: 'g' });
    // Même conversion que la route : une feuille de gélatine ≈ 2 g.
    expect(ings[1]).toMatchObject({ nom: 'Gélatine', quantite: 2, unite: 'g' });
    expect(pivot.sous_preparations[0].day_offset).toBe(1);
  });

  it('trace une clé locale sous sa propre marque, sans photo', () => {
    const { pivot, erreurs } = preparerBrouillonJira({ ticket: 'local-tarte', recette: RECETTE }, UNITS, null, maintenant);
    expect(erreurs).toEqual([]);
    expect(pivot.source.fichier_original).toBe('Import local-tarte');
    expect(pivot.photo_principale).toBeUndefined();
  });

  it('règle le rendement d’une fiche de composant comme la relecture l’attend', () => {
    const { pivot, erreurs } = preparerBrouillonJira({ ticket: 'local-genoise', recette: COMPOSANT }, UNITS, null, maintenant);
    expect(erreurs).toEqual([]);
    expect(pivot.rendement).toMatchObject({
      mode: 'units',
      pieces_corrige: 500,
      qty_unit_corrige: 'g',
      libelle: COMPOSANT.rendement,
    });
    expect(pivot.rendement.notes_quantites).toMatch(/^1 plaque 40 x 30 cm, environ 1 cm d’épaisseur après cuisson\nEntremets rond Ø 20 cm/);
    expect(pivot.notes).toBe('Imbiber d’un sirop au montage.');
  });

  it('laisse le rendement d’une recette ordinaire en description libre', () => {
    const { pivot } = preparerBrouillonJira({ ticket: 'JEP-12', recette: RECETTE }, UNITS, null, maintenant);
    expect(pivot.rendement.mode).toBe('dimensions');
    expect(pivot.rendement.notes_quantites).toBeUndefined();
  });

  it('ne modifie pas la recette du fichier', () => {
    const fichier = { ticket: 'JEP-12', recette: structuredClone(RECETTE) };
    preparerBrouillonJira(fichier, UNITS, null, maintenant);
    expect(fichier.recette).toEqual(RECETTE);
  });

  it('remonte en erreur une recette sans étape', () => {
    const { erreurs } = preparerBrouillonJira(
      { ticket: 'JEP-12', recette: { titre: 'Vide', etapes: [] } },
      UNITS,
      null,
      maintenant,
    );
    expect(erreurs.length).toBeGreaterThan(0);
  });
});

// Garde-fou sur le corpus lui-même : chaque fichier préparé pour l'import doit
// être lisible et produire un brouillon sans erreur bloquante — une recette
// mal structurée se voit ici, à la CI, plutôt qu'au lancement du workflow.
describe('corpus imports-jira/', () => {
  const dossier = path.resolve(__dirname, '..', 'imports-jira');
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.json'));

  it.each(fichiers)('%s est importable', (nom) => {
    const brut = JSON.parse(readFileSync(path.join(dossier, nom), 'utf8'));
    const r = lireFichierImportJira(brut, nom.replace(/\.json$/, ''));
    if ('erreur' in r) throw new Error(r.erreur);
    const { erreurs } = preparerBrouillonJira(r.fichier, UNITS, null, new Date());
    expect(erreurs).toEqual([]);
    // Aucune donnée personnelle dans le dépôt : le destinataire est donné au
    // lancement du workflow, jamais écrit dans le fichier.
    expect(JSON.stringify(brut)).not.toMatch(/@[a-z0-9-]+\.[a-z]/i);
    expect(marqueImportJira(r.fichier.ticket)).toMatch(/^(Jira|Import) /);
  });
});
