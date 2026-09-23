// Tests du sous-total du récapitulatif des ingrédients (JEP-248) : une erreur
// y serait silencieuse — un total faux s'affiche comme un total juste.
import { describe, expect, it } from 'vitest';
import { buildIngredientsRecap, type RecapInput } from '@/lib/ingredients-recap';

const units = [
  { id: 1, name: 'g' },
  { id: 2, name: 'pièce' },
];
const refs = [{ id: 10, name: 'Œufs' }];
const conversions = [{ ingredient_ref_id: 10, from_quantity: 1, from_unit_id: 2, to_quantity: 50, to_unit_id: 1 }];
const ing = (name: string, qty: string, unit: string, note = '', stepIndex = 0): RecapInput => ({ name, qty, unit, note, stepIndex });

describe('buildIngredientsRecap', () => {
  it('garde une ligne par commentaire et fait le sous-total en ignorant les commentaires', () => {
    const groups = buildIngredientsRecap(
      [
        ing('Beurre doux', '200', 'g', '', 0),
        ing('Beurre doux', '125', 'g', '', 1),
        ing('beurre doux', '60', 'g', 'Fondu et tiède', 2),
        ing('Crème liquide 30%', '50', 'g', 'à chauffer'),
        ing('Crème liquide 30%', '100', 'g', 'froide'),
        ing('Eau', '130', 'g'),
      ],
      conversions,
      units,
      refs,
    );
    // « beurre doux » et « Beurre doux » : même groupe, la casse n'est pas une différence.
    expect(groups.map((g) => g.name.toLowerCase())).toEqual(['beurre doux', 'crème liquide 30%', 'eau']);
    expect(groups[0].lines.map((l) => [l.qty, l.note])).toEqual([['325', ''], ['60', 'Fondu et tiède']]);
    expect(groups[0].subtotal).toEqual({ qty: '385', unit: 'g' });
    expect(groups[1].subtotal).toEqual({ qty: '150', unit: 'g' });
    // Une ligne seule : pas de sous-total qui répéterait la même quantité.
    expect(groups[2].subtotal).toBeNull();
  });

  it('convertit les unités quand la table le permet, sinon les juxtapose sans les cumuler', () => {
    const [oeufs] = buildIngredientsRecap(
      [ing('Œufs', '100', 'g', 'jaunes'), ing('Œufs', '2', 'pièce', 'entiers')],
      conversions,
      units,
      refs,
    );
    // Vers l'unité de la première ligne affichée (« entiers » trié avant « jaunes »).
    expect(oeufs.subtotal).toEqual({ qty: '4', unit: 'pièce' });

    const [sucre] = buildIngredientsRecap(
      [ing('Sucre', '100', 'g', 'semoule'), ing('Sucre', '2', 'pièce', 'morceaux'), ing('Sucre', 'QS', '', 'glace')],
      conversions,
      units,
      refs,
    );
    // Dans l'ordre des lignes (glace, morceaux, semoule) ; rien n'est cumulé à tort.
    expect(sucre.subtotal).toEqual({ qty: 'QS + 2 pièce + 100 g', unit: '' });
  });
});
