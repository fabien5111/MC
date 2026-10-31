import { describe, expect, it } from 'vitest';
import {
  ecartQuantite,
  leconsPrecedentes,
  normaliserLecon,
  lireLecon,
  referenceAffichable,
  nombreEtapesAnnotees,
  LECON_MAX,
  type FourneeReference,
  type RefStep,
  type RefIngredient,
} from './batch-lecons';

function step(p: Partial<RefStep> & { id: number }): RefStep {
  return { source_step_id: null, title: null, order_index: p.id, commentaire: null, batch_substeps: [], ...p };
}
function ing(p: Partial<RefIngredient> & { batch_step_id: number; name: string }): RefIngredient {
  return { unit: 'g', quantity: null, real_quantity: null, commentaire: null, order_index: 0, ...p };
}
function ref(steps: RefStep[], ings: RefIngredient[] = [], extra: Partial<FourneeReference> = {}): FourneeReference {
  return { id: 1, date: '2026-09-12', commentaire_global: null, lecon: null, batch_steps: steps, batch_ingredients: ings, ...extra };
}

describe('ecartQuantite', () => {
  it('décrit un écart de quantité réelle', () => {
    expect(ecartQuantite({ quantity: 200, real_quantity: 180, unit: 'g' })).toBe('180 g utilisés au lieu de 200 g');
  });
  it('rien sans quantité réelle ou sans écart', () => {
    expect(ecartQuantite({ quantity: 200, real_quantity: null, unit: 'g' })).toBeNull();
    expect(ecartQuantite({ quantity: 200, real_quantity: 200, unit: 'g' })).toBeNull();
    expect(ecartQuantite({ quantity: null, real_quantity: 3, unit: null })).toBeNull();
  });
  it('sans unité', () => {
    expect(ecartQuantite({ quantity: 3, real_quantity: 4, unit: null })).toBe('4 utilisés au lieu de 3');
  });
});

describe('leconsPrecedentes', () => {
  it('apparie par source_step_id en priorité', () => {
    const r = ref([step({ id: 10, source_step_id: 5, title: 'Cuisson', commentaire: 'trop longue de 3 min' })]);
    const l = leconsPrecedentes(r, [
      { id: 100, source_step_id: 7, title: 'Cuisson', order_index: 1 },
      { id: 101, source_step_id: 5, title: 'Autre titre', order_index: 2 },
    ]);
    expect(Object.keys(l.parEtape)).toEqual(['101']);
    expect(l.parEtape[101].commentaire).toBe('trop longue de 3 min');
    expect(l.autres).toEqual([]);
  });

  it('se rabat sur le titre normalisé (casse, accents)', () => {
    const r = ref([step({ id: 10, source_step_id: 5, title: 'Crème pâtissière', commentaire: 'trop liquide' })]);
    const l = leconsPrecedentes(r, [{ id: 200, source_step_id: 99, title: 'CREME PATISSIERE', order_index: 1 }]);
    expect(l.parEtape[200]?.commentaire).toBe('trop liquide');
  });

  it('deux étapes du même titre : appariées dans l’ordre', () => {
    const r = ref([
      step({ id: 10, title: 'Cuisson', order_index: 1, commentaire: 'A' }),
      step({ id: 11, title: 'Cuisson', order_index: 2, commentaire: 'B' }),
    ]);
    const l = leconsPrecedentes(r, [
      { id: 1, source_step_id: null, title: 'Cuisson', order_index: 1 },
      { id: 2, source_step_id: null, title: 'Cuisson', order_index: 2 },
    ]);
    expect(l.parEtape[1].commentaire).toBe('A');
    expect(l.parEtape[2].commentaire).toBe('B');
  });

  it('un constat sans étape correspondante va dans « autres »', () => {
    const r = ref([step({ id: 10, title: 'Glaçage', commentaire: 'trop sucré' })]);
    const l = leconsPrecedentes(r, [{ id: 1, source_step_id: null, title: 'Cuisson', order_index: 1 }]);
    expect(l.parEtape).toEqual({});
    expect(l.autres).toHaveLength(1);
    expect(l.autres[0].titre).toBe('Glaçage');
  });

  it('ignore les étapes sans constat', () => {
    const r = ref([step({ id: 10, title: 'Glaçage' })]);
    const l = leconsPrecedentes(r, []);
    expect(l.autres).toEqual([]);
  });

  it('reprend sous-étapes et ingrédients, apparie les ingrédients par clé + unité', () => {
    const r = ref(
      [step({ id: 10, title: 'Pâte', batch_substeps: [{ texte: 'Crémer', commentaire: 'pas assez', order_index: 0 }, { texte: 'Mélanger', commentaire: '  ', order_index: 1 }] })],
      [
        ing({ batch_step_id: 10, name: "Jaunes d'oeufs", quantity: 200, real_quantity: 180 }),
        ing({ batch_step_id: 10, name: 'Sucre', commentaire: 'moins sucré la prochaine fois', unit: 'g' }),
        ing({ batch_step_id: 10, name: 'Beurre' }),
      ],
    );
    const l = leconsPrecedentes(
      r,
      [{ id: 1, source_step_id: null, title: 'Pâte', order_index: 1 }],
      [
        { id: 50, batch_step_id: 1, name: "Jaune d'œuf", unit: 'g' },
        { id: 51, batch_step_id: 1, name: 'Sucre', unit: 'kg' },
      ],
    );
    const c = l.parEtape[1];
    expect(c.sousEtapes).toEqual([{ texte: 'Crémer', commentaire: 'pas assez' }]);
    expect(c.ingredients).toHaveLength(2);
    expect(c.ingredients[0]).toMatchObject({ ecart: '180 g utilisés au lieu de 200 g', ingredientId: 50 });
    // Unité différente : pas d'appariement, mais le constat reste affiché.
    expect(c.ingredients[1]).toMatchObject({ commentaire: 'moins sucré la prochaine fois', ingredientId: null });
  });
});

describe('referenceAffichable', () => {
  it('faux sans référence ou sans rien à dire', () => {
    expect(referenceAffichable(null)).toBe(false);
    expect(referenceAffichable(ref([step({ id: 1 })]))).toBe(false);
  });
  it('vrai avec un commentaire global, une leçon ou un constat d’étape', () => {
    expect(referenceAffichable(ref([], [], { commentaire_global: 'Bien' }))).toBe(true);
    expect(referenceAffichable(ref([], [], { lecon: 'Moins de sucre' }))).toBe(true);
    const r = ref([step({ id: 1, commentaire: 'x' })]);
    expect(referenceAffichable(r)).toBe(true);
    expect(nombreEtapesAnnotees(r)).toBe(1);
  });
});

describe('leçon', () => {
  it('normalise la saisie', () => {
    expect(normaliserLecon('  ')).toBeNull();
    expect(normaliserLecon(' Cuire 3 min de moins ')).toBe('Cuire 3 min de moins');
    expect(normaliserLecon('x'.repeat(600))).toHaveLength(LECON_MAX);
  });
  it('lit la colonne si elle existe', () => {
    expect(lireLecon({})).toBeNull();
    expect(lireLecon({ lecon: ' ok ' })).toBe('ok');
    expect(lireLecon(null)).toBeNull();
  });
});
