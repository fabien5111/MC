import { describe, expect, it } from 'vitest';

import { cleanPivotRecette, toPivotInterne, type RecetteIA } from './import-pivot';

const UNITS = [{ name: 'g', abbreviation: 'g' }];

function recette(etape: Record<string, unknown>): RecetteIA {
  return { titre: 'Test', etapes: [{ nom_etape: 'Pâte', ingredients: [], instructions: ['Mélanger.'], ...etape }] };
}

describe('toPivotInterne — préparation à l\'avance (JEP-19)', () => {
  it('coche la case et reporte les précisions quand l\'IA les donne', () => {
    const sp = toPivotInterne(
      recette({ peut_preparer_avance: true, precisions_avance: '  Se garde 3 jours au frais  ' }),
      UNITS,
    ).sous_preparations[0];
    expect(sp.avance).toBe(true);
    expect(sp.avance_note).toBe('Se garde 3 jours au frais');
  });

  it('laisse la case décochée quand la clé est absente ou fausse', () => {
    expect(toPivotInterne(recette({}), UNITS).sous_preparations[0].avance).toBe(false);
    const faux = toPivotInterne(recette({ peut_preparer_avance: false, precisions_avance: 'x' }), UNITS);
    expect(faux.sous_preparations[0].avance).toBe(false);
    expect(faux.sous_preparations[0].avance_note).toBeNull();
  });

  it('n\'accepte que le booléen true (pas une chaîne)', () => {
    const sp = toPivotInterne(recette({ peut_preparer_avance: 'true' }), UNITS).sous_preparations[0];
    expect(sp.avance).toBe(false);
  });

  it('tronque les précisions à 200 caractères', () => {
    const sp = toPivotInterne(recette({ peut_preparer_avance: true, precisions_avance: 'a'.repeat(300) }), UNITS)
      .sous_preparations[0];
    expect(sp.avance_note).toHaveLength(200);
  });

  it('ne confond pas avance et jour prévu', () => {
    const sp = toPivotInterne(recette({ anticipation_jours: 2 }), UNITS).sous_preparations[0];
    expect(sp.day_offset).toBe(2);
    expect(sp.avance).toBe(false);
  });
});

describe('toPivotInterne — commentaire d\'ingrédient', () => {
  it('reporte le commentaire dans la note de la ligne', () => {
    const sp = toPivotInterne(
      recette({ ingredients: [{ nom: 'Beurre', quantite: 100, unite: 'g', commentaire: ' mou ' }] }),
      UNITS,
    ).sous_preparations[0];
    expect(sp.ingredients[0].nom).toBe('Beurre');
    expect(sp.ingredients[0].note).toBe('mou');
  });

  it('laisse la note vide sans commentaire', () => {
    const sp = toPivotInterne(recette({ ingredients: [{ nom: 'Sucre', quantite: 50, unite: 'g' }] }), UNITS)
      .sous_preparations[0];
    expect(sp.ingredients[0].note).toBeNull();
  });
});

describe('cleanPivotRecette — nouveaux champs', () => {
  it('applique la ligature œuf et vide les textes blancs', () => {
    const r = recette({
      precisions_avance: 'Jaunes d\'oeufs cuits la veille',
      ingredients: [{ nom: 'Sucre', commentaire: '   ' }, { nom: 'Lait', commentaire: 'avec oeuf' }],
    });
    cleanPivotRecette(r);
    expect(r.etapes![0].precisions_avance).toBe('Jaunes d\'œufs cuits la veille');
    expect(r.etapes![0].ingredients![0].commentaire).toBeNull();
    expect(r.etapes![0].ingredients![1].commentaire).toBe('avec œuf');
  });
});
