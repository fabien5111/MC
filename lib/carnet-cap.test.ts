// Tests du carnet CAP (JEP-6). L'invariant qui compte : rien d'autre que le
// titre, le rendement, les préparations et « nom / quantité / unité » ne doit
// sortir — une précision de trop fait retirer le carnet au candidat.
import { describe, expect, it } from 'vitest';
import type { RecipeFull } from '@/lib/recipes';
import type { BatchFull } from '@/lib/recipe-plan';
import {
  ficheCapFournee,
  ficheCapRecette,
  lignesCap,
  nomPreparationSuspect,
  poidsTotalCap,
  quantiteCap,
  uniteCap,
} from '@/lib/carnet-cap';

const ing = (id: number, name: string, quantity: string | null, unit: string | null, comment: string | null = null, order_index = id) => ({
  id,
  name,
  quantity,
  unit,
  comment,
  url: null,
  allergen: 'Lait',
  order_index,
  ref_id: null,
  ingredient_refs: null,
});

function recette(partiel: Partial<RecipeFull>): RecipeFull {
  return {
    id: 'r1',
    title: 'Tarte aux fraises',
    measure_type: 'mold',
    yield_qty: '1',
    yield_unit: 'cercle',
    yield_desc: 'Ø 22 cm',
    yield_notes: 'Cuire à 170 °C, perte 10 %',
    mold_types: null,
    ingredient_groups: [],
    recipe_steps: [],
    ...partiel,
  } as unknown as RecipeFull;
}

describe('quantités et unités', () => {
  it('écrit les décimales à la française et garde un texte libre tel quel', () => {
    expect(quantiteCap('1.5')).toBe('1,5');
    expect(quantiteCap('QS')).toBe('QS');
    expect(quantiteCap(null)).toBe('');
  });
  it('efface « unité(s) » / « pièce », garde les autres unités', () => {
    expect(uniteCap('unité(s)')).toBe('');
    expect(uniteCap('pièce')).toBe('');
    expect(uniteCap('g')).toBe('g');
    expect(uniteCap('feuilles')).toBe('feuilles');
  });
  it('ne donne un même ingrédient qu’une fois par unité', () => {
    const l = lignesCap([
      { name: 'Sucre semoule', quantity: '20', unit: 'g' },
      { name: 'sucre semoule', quantity: '60', unit: 'g' },
      { name: 'Œufs', quantity: '2', unit: 'unité(s)' },
      { name: 'Œufs', quantity: '50', unit: 'g' },
    ]);
    expect(l).toEqual([
      { nom: 'Sucre semoule', quantite: '80', unite: 'g' },
      { nom: 'Œufs', quantite: '2', unite: '' },
      { nom: 'Œufs', quantite: '50', unite: 'g' },
    ]);
  });
});

describe('ficheCapRecette', () => {
  const r = recette({
    ingredient_groups: [
      { id: 2, name: 'Crème d’amandes', order_index: 1, scaling_mode: null, ingredients: [ing(3, 'Beurre', '60', 'g', 'pommade')] },
      { id: 1, name: 'Pâte sucrée', order_index: 0, scaling_mode: null, ingredients: [ing(2, 'Beurre', '120', 'g'), ing(1, 'Farine T55', '200', 'g')] },
      { id: 3, name: 'Cuisson', order_index: 2, scaling_mode: null, ingredients: [] },
    ],
  });

  it('suit l’ordre des étapes, retire les préparations vides', () => {
    const f = ficheCapRecette(r);
    expect(f.preparations.map((p) => p.nom)).toEqual(['Pâte sucrée', 'Crème d’amandes']);
    expect(f.preparations[0].lignes.map((l) => l.nom)).toEqual(['Farine T55', 'Beurre']);
    expect(f.rendement).toBe('Ø 22 cm — cercle');
  });

  it('ne laisse sortir aucun commentaire, allergène ni note de rendement', () => {
    const texte = JSON.stringify(ficheCapRecette(r));
    expect(texte).not.toContain('pommade');
    expect(texte).not.toContain('Lait');
    expect(texte).not.toContain('170');
    expect(Object.keys(ficheCapRecette(r).preparations[0].lignes[0]).sort()).toEqual(['nom', 'quantite', 'unite']);
  });

  it('regroupe un projet par composant, sous le nom du composant', () => {
    const projet = recette({
      ingredient_groups: [
        { id: 1, name: 'Mélanger', order_index: 0, scaling_mode: null, ingredients: [ing(1, 'Beurre', '25', 'g')] },
        { id: 2, name: 'Monter', order_index: 1, scaling_mode: null, ingredients: [ing(2, 'Blancs d’œufs', '110', 'g')] },
      ],
      recipe_steps: [
        { id: 10, order_index: 0, component_id: 7 },
        { id: 11, order_index: 1, component_id: 7 },
      ] as unknown as RecipeFull['recipe_steps'],
    });
    const f = ficheCapRecette(projet, new Map([[7, 'Biscuit joconde']]));
    expect(f.preparations).toHaveLength(1);
    expect(f.preparations[0].nom).toBe('Biscuit joconde');
    expect(f.preparations[0].lignes).toHaveLength(2);
  });
});

describe('ficheCapFournee', () => {
  const batch = {
    id: 5,
    recipe_title: 'Opéra',
    measure_type: 'units',
    yield_qty: '8',
    yield_unit: 'pers',
    yield_desc: null,
    mold_type_name: null,
    batch_steps: [
      { id: 1, order_index: 1, title: 'Ganache', replaced_by_recipe_id: null },
      { id: 2, order_index: 2, title: 'Praliné', replaced_by_recipe_id: 'x' },
    ],
    batch_ingredients: [
      { batch_step_id: 1, order_index: 0, name: 'Chocolat', quantity: 140.5, quantity_text: null, unit: 'g', removed: false, expanded_into_recipe_id: null },
      { batch_step_id: 1, order_index: 1, name: 'Crème', quantity: 200, quantity_text: null, unit: 'g', removed: true, expanded_into_recipe_id: null },
      { batch_step_id: 1, order_index: 2, name: 'Praliné', quantity: 80, quantity_text: null, unit: 'g', removed: false, expanded_into_recipe_id: 'r9' },
      { batch_step_id: 2, order_index: 0, name: 'Noisettes', quantity: 100, quantity_text: null, unit: 'g', removed: false, expanded_into_recipe_id: null },
    ],
  } as unknown as BatchFull;

  it('prend les quantités ajustées et écarte ce qui ne fait plus partie de la recette', () => {
    const f = ficheCapFournee(batch);
    expect(f.titre).toBe('Opéra');
    expect(f.rendement).toBe('8 pers.');
    expect(f.preparations).toEqual([{ cle: 's1', nom: 'Ganache', lignes: [{ nom: 'Chocolat', quantite: '140,5', unite: 'g' }] }]);
  });
});

describe('poids total', () => {
  it('additionne les masses, se tait dès qu’une ligne n’en est pas une', () => {
    expect(poidsTotalCap({ cle: 'a', nom: 'a', lignes: [{ nom: 'Lait', quantite: '250', unite: 'g' }, { nom: 'Beurre', quantite: '0,15', unite: 'kg' }] })).toBe(400);
    expect(poidsTotalCap({ cle: 'a', nom: 'a', lignes: [{ nom: 'Lait', quantite: '250', unite: 'g' }, { nom: 'Œufs', quantite: '3', unite: '' }] })).toBeNull();
    expect(poidsTotalCap({ cle: 'a', nom: 'a', lignes: [{ nom: 'Sucre glace', quantite: 'QS', unite: 'g' }] })).toBeNull();
  });
});

describe('nomPreparationSuspect', () => {
  it('repère un verbe de technique, une température ou une durée', () => {
    expect(nomPreparationSuspect('Monter les blancs')).toBe(true);
    expect(nomPreparationSuspect('Cuisson 20 min')).toBe(true);
    expect(nomPreparationSuspect('Crème à 85 °C')).toBe(true);
    expect(nomPreparationSuspect('Pâte sucrée')).toBe(false);
    expect(nomPreparationSuspect('Beurre noisette')).toBe(false);
  });
});
