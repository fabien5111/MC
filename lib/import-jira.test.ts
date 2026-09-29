import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { choisirPhotoJira, lireFichierImportJira, marqueImportJira, preparerBrouillonJira } from './import-jira';

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
    const r = lireFichierImportJira({ ticket: 'jep-12', pseudo: ' fabien ', recette: RECETTE }, 'JEP-12');
    expect(r).toEqual({ fichier: { ticket: 'JEP-12', pseudo: 'fabien', recette: RECETTE } });
  });

  it('refuse un fichier rangé sous une autre clé que celle qu’il déclare', () => {
    const r = lireFichierImportJira({ ticket: 'JEP-12', pseudo: 'fabien', recette: RECETTE }, 'JEP-13');
    expect(r).toHaveProperty('erreur');
  });

  it('refuse un fichier sans pseudo ou sans recette', () => {
    expect(lireFichierImportJira({ ticket: 'JEP-12', pseudo: '', recette: RECETTE }, 'JEP-12')).toHaveProperty('erreur');
    expect(lireFichierImportJira({ ticket: 'JEP-12', pseudo: 'fabien' }, 'JEP-12')).toHaveProperty('erreur');
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

describe('preparerBrouillonJira', () => {
  const maintenant = new Date('2026-09-29T10:00:00Z');

  it('produit le même pivot que l’import par texte collé, photo comprise', () => {
    const fichier = { ticket: 'JEP-12', pseudo: 'fabien', recette: RECETTE };
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

  it('ne modifie pas la recette du fichier', () => {
    const fichier = { ticket: 'JEP-12', pseudo: 'fabien', recette: structuredClone(RECETTE) };
    preparerBrouillonJira(fichier, UNITS, null, maintenant);
    expect(fichier.recette).toEqual(RECETTE);
  });

  it('remonte en erreur une recette sans étape', () => {
    const { erreurs } = preparerBrouillonJira(
      { ticket: 'JEP-12', pseudo: 'fabien', recette: { titre: 'Vide', etapes: [] } },
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
// Le pseudo n'est pas exigé à ce stade : il peut être renseigné juste avant
// l'import, et le workflow refuse de toute façon un fichier qui n'en a pas.
describe('corpus imports-jira/', () => {
  const dossier = path.resolve(__dirname, '..', 'imports-jira');
  const fichiers = readdirSync(dossier).filter((f) => f.endsWith('.json'));

  it.each(fichiers)('%s est importable', (nom) => {
    const brut = JSON.parse(readFileSync(path.join(dossier, nom), 'utf8'));
    const r = lireFichierImportJira({ ...brut, pseudo: brut.pseudo || 'a-renseigner' }, nom.replace(/\.json$/, ''));
    if ('erreur' in r) throw new Error(r.erreur);
    const { erreurs } = preparerBrouillonJira(r.fichier, UNITS, null, new Date());
    expect(erreurs).toEqual([]);
    expect(marqueImportJira(r.fichier.ticket)).toBe(`Jira ${r.fichier.ticket}`);
  });
});
