// Tests de la clé de comparaison des noms d'ingrédients (JEP-249) : un
// rapprochement manqué laisse deux lignes dans les courses, un rapprochement
// abusif additionne deux ingrédients différents — les deux sont silencieux.
import { describe, expect, it } from 'vitest';
import { ingredientKey, ingredientRefDuplicates, sameIngredient, libelleIngredient } from '@/lib/ingredient-name';
import { estimateWeightGrams } from '@/lib/ingredient-conversions';

describe('ingredientKey', () => {
  it('confond singulier, pluriel, ligature et apostrophe', () => {
    const variantes = ["Jaune d'œuf", "jaunes d'oeufs", 'Jaunes d’œufs', "JAUNE D'OEUF", 'jaune oeuf'];
    for (const v of variantes) expect(ingredientKey(v)).toBe('jaune oeuf');
  });

  it('confond œuf / oeuf / œufs / oeufs', () => {
    for (const v of ['œuf', 'oeuf', 'Œufs', 'Oeufs', 'OEUFS']) expect(ingredientKey(v)).toBe('oeuf');
  });

  it('ignore accents et casse', () => {
    expect(sameIngredient('Crème liquide', 'creme liquide')).toBe(true);
    expect(sameIngredient('Blancs d’œufs', "Blanc d'oeuf")).toBe(true);
  });

  it('ramène les pluriels en -x', () => {
    expect(sameIngredient('Noyaux', 'noyau')).toBe(true);
    expect(sameIngredient('Choux', 'chou')).toBe(true);
  });

  it('laisse les invariables se comparer à eux-mêmes', () => {
    expect(sameIngredient('Noix', 'noix')).toBe(true);
    expect(sameIngredient('Cassis', 'cassis')).toBe(true);
    expect(sameIngredient('Jus de citron', 'jus du citron')).toBe(true);
    expect(ingredientKey('Riz')).toBe('riz');
  });

  it('confond le singulier et le pluriel des noms composés', () => {
    expect(sameIngredient('Gousse de vanille', 'Gousses de vanille')).toBe(true);
    expect(sameIngredient('Amande effilée', 'Amandes effilées')).toBe(true);
  });

  it('ne confond pas deux ingrédients différents', () => {
    expect(sameIngredient('Sucre', 'Sucre glace')).toBe(false);
    expect(sameIngredient('Chocolat noir', 'Chocolat au lait')).toBe(false);
    expect(sameIngredient('Jaune d’œuf', 'Blanc d’œuf')).toBe(false);
    expect(sameIngredient('Œuf', 'Œuf entier')).toBe(false);
  });

  it('rend une clé vide pour un nom vide', () => {
    expect(ingredientKey('')).toBe('');
    expect(ingredientKey(null)).toBe('');
    expect(ingredientKey("  d' ")).toBe('');
  });
});

describe('ingredientRefDuplicates', () => {
  it('regroupe les entrées de même clé, et elles seules', () => {
    const refs = [
      { id: 1, name: "Jaune d'œuf" },
      { id: 2, name: 'Sucre' },
      { id: 3, name: "Jaunes d'oeufs" },
      { id: 4, name: 'Sucre glace' },
    ];
    expect(ingredientRefDuplicates(refs).map((g) => g.map((r) => r.id))).toEqual([[1, 3]]);
  });
});

describe('estimateWeightGrams — masse volumique rapprochée par la clé', () => {
  it('trouve la masse volumique d’un ingrédient écrit au pluriel', () => {
    const est = estimateWeightGrams(
      [{ name: 'Crèmes liquides', quantity: 100, unit: 'ml', ref_id: null }],
      [],
      [],
      [{ name: 'Crème liquide', density_g_per_ml: 1.01 }],
    );
    expect(est.grams).toBe(101);
    expect(est.unconverted).toEqual([]);
  });
});

describe('libelleIngredient — accord à l’affichage (JEP-282)', () => {
  const jaune = { singulier: 'Jaune d’œuf', pluriel: 'Jaunes d’œufs' };
  const oeuf = { singulier: 'Œuf', pluriel: 'Œufs' };

  it('« 1 jaune d’œuf » ajusté ×3 devient « 3 jaunes d’œufs »', () => {
    expect(libelleIngredient('Jaune d’œuf', '3', 'unité(s)', jaune)).toBe('Jaunes d’œufs');
  });
  it('« 2 jaunes d’œufs » divisé par deux devient « 1 jaune d’œuf »', () => {
    expect(libelleIngredient('Jaunes d’œufs', '1', 'unité(s)', jaune)).toBe('Jaune d’œuf');
  });
  it('singulier jusqu’à 1,99, pluriel à partir de 2', () => {
    expect(libelleIngredient('Œufs', '1,5', null, oeuf)).toBe('Œuf');
    expect(libelleIngredient('Œuf', '1.99', '', oeuf)).toBe('Œuf');
    expect(libelleIngredient('Œuf', '2', null, oeuf)).toBe('Œufs');
    expect(libelleIngredient('Œuf', 0, null, oeuf)).toBe('Œuf');
    expect(libelleIngredient('Œuf', '3/2', null, oeuf)).toBe('Œuf');
  });
  it('ne touche jamais une unité de poids ou de volume', () => {
    expect(libelleIngredient('Jaune d’œuf', '40', 'g', jaune)).toBe('Jaune d’œuf');
    expect(libelleIngredient('Jaunes d’œufs', '1', 'ml', jaune)).toBe('Jaunes d’œufs');
  });
  it('sans référence, sans pluriel ou sans quantité lisible : texte de l’auteur', () => {
    expect(libelleIngredient('Jaune d’œuf', '3', null, null)).toBe('Jaune d’œuf');
    expect(libelleIngredient('Jaune d’œuf', '3', null, { singulier: 'Jaune d’œuf', pluriel: null })).toBe('Jaune d’œuf');
    expect(libelleIngredient('Jaune d’œuf', '', null, jaune)).toBe('Jaune d’œuf');
    expect(libelleIngredient('Jaune d’œuf', '2-3', null, jaune)).toBe('Jaune d’œuf');
    expect(libelleIngredient('Jaune d’œuf', 'quelques', null, jaune)).toBe('Jaune d’œuf');
  });
  it('conserve la casse initiale de l’auteur', () => {
    expect(libelleIngredient('jaune d’œuf', '3', null, jaune)).toBe('jaunes d’œufs');
    expect(libelleIngredient('JAUNE D’ŒUF', '3', null, jaune)).toBe('Jaunes d’œufs');
  });
  it('reconnaît l’apostrophe droite et « oeuf » sans ligature', () => {
    expect(libelleIngredient("Jaune d'oeuf", '3', null, jaune)).toBe('Jaunes d’œufs');
  });
  it('laisse intact un libellé qui ne désigne pas la référence', () => {
    expect(libelleIngredient('Jaunes d’œufs frais', '1', null, jaune)).toBe('Jaunes d’œufs frais');
  });
});
