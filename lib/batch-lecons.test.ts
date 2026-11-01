import { describe, expect, it } from 'vitest';
import {
  LECON_MAX,
  cleRemarque,
  ecartQuantite,
  leconsPrecedentes,
  ligneDecision,
  libelleCoefficient,
  lireLecon,
  nombreEtapesAnnotees,
  normaliserLecon,
  remarquesAffichees,
  remarquesDeFournee,
  remarquesDeSousEtape,
  type DecisionRemarque,
  type FourneeReference,
  type RefIngredient,
  type RefStep,
} from './batch-lecons';

function step(p: Partial<RefStep> & { id: number }): RefStep {
  return { source_step_id: null, title: null, order_index: p.id, commentaire: null, batch_substeps: [], ...p };
}
function ing(p: Partial<RefIngredient> & { id: number; batch_step_id: number; name: string }): RefIngredient {
  return { unit: 'g', quantity: null, real_quantity: null, commentaire: null, order_index: 0, ...p };
}
function ref(steps: RefStep[], ings: RefIngredient[] = [], extra: Partial<FourneeReference> = {}): FourneeReference {
  return { id: 1, date: '2026-09-12', commentaire_global: null, lecon: null, batch_steps: steps, batch_ingredients: ings, ...extra };
}
function decision(p: Partial<DecisionRemarque> & Pick<DecisionRemarque, 'nature' | 'ligne_id' | 'statut'>): DecisionRemarque {
  return {
    batch_id: 99,
    fournee_du: '2026-08-01',
    etape_id: null,
    etape_titre: null,
    source_step_id: null,
    ordre: 0,
    libelle: null,
    unite: null,
    texte: null,
    ecart: null,
    ...p,
  };
}
const etape = (id: number, title: string, source_step_id: number | null = null, order_index = id) => ({ id, title, source_step_id, order_index });

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

describe('remarquesDeFournee', () => {
  it('liste leçon, commentaire global, étapes, sous-étapes et ingrédients', () => {
    const r = ref(
      [
        step({
          id: 10,
          title: 'Pâte',
          commentaire: 'trop collante',
          batch_substeps: [
            { id: 5, texte: 'Crémer', commentaire: 'pas assez', order_index: 0 },
            { id: 6, texte: 'Mélanger', commentaire: '  ', order_index: 1 },
          ],
        }),
        step({ id: 11, title: 'Cuisson' }),
      ],
      [ing({ id: 50, batch_step_id: 10, name: 'Sucre', quantity: 200, real_quantity: 180 }), ing({ id: 51, batch_step_id: 10, name: 'Beurre' })],
      { commentaire_global: 'Bien', lecon: 'Moins de sucre' },
    );
    const cles = remarquesDeFournee(r).map((x) => x.cle);
    expect(cles).toEqual(['lecon:1', 'global:1', 'etape:10', 'sous_etape:5', 'ingredient:50']);
  });
});

describe('remarquesAffichees', () => {
  const r = ref([step({ id: 10, title: 'Cuisson', commentaire: 'trop longue de 3 min' })], [], { commentaire_global: 'Bien' });

  it('par défaut : la dernière fournée en entier', () => {
    expect(remarquesAffichees(r, []).map((x) => x.cle)).toEqual(['global:1', 'etape:10']);
  });

  it('retire une remarque écartée, marque une remarque gardée', () => {
    const out = remarquesAffichees(r, [
      decision({ nature: 'etape', ligne_id: 10, statut: 'ecartee' }),
      decision({ nature: 'global', ligne_id: 1, statut: 'gardee' }),
    ]);
    expect(out.map((x) => [x.cle, x.statut])).toEqual([['global:1', 'gardee']]);
  });

  it('ajoute les remarques gardées d’autres fournées, et ignore leurs écartées', () => {
    const out = remarquesAffichees(r, [
      decision({ nature: 'etape', ligne_id: 70, statut: 'gardee', texte: 'four trop chaud', etape_id: 7, etape_titre: 'Cuisson' }),
      decision({ nature: 'etape', ligne_id: 71, statut: 'ecartee', texte: 'rien' }),
    ]);
    expect(out.map((x) => x.cle)).toEqual(['global:1', 'etape:10', 'etape:70']);
    expect(out[2]).toMatchObject({ batchId: 99, texte: 'four trop chaud', statut: 'gardee' });
  });

  it('écarte une remarque gardée dont le commentaire a été effacé', () => {
    const out = remarquesAffichees(null, [decision({ nature: 'etape', ligne_id: 70, statut: 'gardee', texte: '  ' })]);
    expect(out).toEqual([]);
  });

  it('se passe d’une fournée de référence', () => {
    const out = remarquesAffichees(null, [decision({ nature: 'lecon', ligne_id: 99, statut: 'gardee', texte: 'Moins de sucre' })]);
    expect(out.map((x) => x.cle)).toEqual(['lecon:99']);
  });
});

describe('leconsPrecedentes', () => {
  it('apparie par source_step_id en priorité', () => {
    const rs = remarquesDeFournee(ref([step({ id: 10, source_step_id: 5, title: 'Cuisson', commentaire: 'trop longue' })]));
    const l = leconsPrecedentes(rs, [etape(100, 'Cuisson', 7, 1), etape(101, 'Autre titre', 5, 2)]);
    expect(Object.keys(l.parEtape)).toEqual(['101']);
    expect(l.parEtape[101].remarques[0].texte).toBe('trop longue');
    expect(l.autres).toEqual([]);
  });

  it('se rabat sur le titre normalisé (casse, accents)', () => {
    const rs = remarquesDeFournee(ref([step({ id: 10, source_step_id: 5, title: 'Crème pâtissière', commentaire: 'trop liquide' })]));
    const l = leconsPrecedentes(rs, [etape(200, 'CREME PATISSIERE', 99)]);
    expect(l.parEtape[200]?.remarques[0].texte).toBe('trop liquide');
  });

  it('deux étapes du même titre : appariées dans l’ordre', () => {
    const rs = remarquesDeFournee(
      ref([step({ id: 10, title: 'Cuisson', order_index: 1, commentaire: 'A' }), step({ id: 11, title: 'Cuisson', order_index: 2, commentaire: 'B' })]),
    );
    const l = leconsPrecedentes(rs, [etape(1, 'Cuisson', null, 1), etape(2, 'Cuisson', null, 2)]);
    expect(l.parEtape[1].remarques[0].texte).toBe('A');
    expect(l.parEtape[2].remarques[0].texte).toBe('B');
  });

  it('une remarque sans étape correspondante va dans « autres »', () => {
    const rs = remarquesDeFournee(ref([step({ id: 10, title: 'Glaçage', commentaire: 'trop sucré' })]));
    const l = leconsPrecedentes(rs, [etape(1, 'Cuisson')]);
    expect(l.parEtape).toEqual({});
    expect(l.autres).toHaveLength(1);
    expect(l.autres[0].titre).toBe('Glaçage');
  });

  it('réunit sous une même étape les remarques de deux fournées, la plus récente d’abord', () => {
    const rs = remarquesAffichees(ref([step({ id: 10, title: 'Cuisson', commentaire: 'récente' })]), [
      decision({ nature: 'etape', ligne_id: 70, statut: 'gardee', texte: 'ancienne', etape_id: 7, etape_titre: 'Cuisson' }),
    ]);
    const l = leconsPrecedentes(rs, [etape(1, 'Cuisson')]);
    expect(l.parEtape[1].remarques.map((x) => x.texte)).toEqual(['récente', 'ancienne']);
  });

  it('range leçon et commentaire global à part', () => {
    const rs = remarquesDeFournee(ref([], [], { commentaire_global: 'Bien', lecon: 'Moins de sucre' }));
    const l = leconsPrecedentes(rs, []);
    expect(l.generales.map((x) => x.nature)).toEqual(['lecon', 'global']);
  });

  it('apparie les ingrédients par clé + unité dans l’étape retrouvée', () => {
    const rs = remarquesDeFournee(
      ref(
        [step({ id: 10, title: 'Pâte' })],
        [
          ing({ id: 60, batch_step_id: 10, name: "Jaunes d'oeufs", quantity: 200, real_quantity: 180 }),
          ing({ id: 61, batch_step_id: 10, name: 'Sucre', commentaire: 'moins sucré', unit: 'g' }),
        ],
      ),
    );
    const l = leconsPrecedentes(
      rs,
      [etape(1, 'Pâte')],
      [
        { id: 50, batch_step_id: 1, name: "Jaune d'œuf", unit: 'g' },
        { id: 51, batch_step_id: 1, name: 'Sucre', unit: 'kg' },
      ],
    );
    const [a, b] = l.parEtape[1].remarques;
    expect(a).toMatchObject({ ecart: '180 g utilisés au lieu de 200 g', ingredientId: 50 });
    // Unité différente : pas d'appariement, mais la remarque reste affichée.
    expect(b).toMatchObject({ texte: 'moins sucré', ingredientId: null });
  });
});

describe('nombreEtapesAnnotees', () => {
  it('compte les étapes, pas les remarques', () => {
    const rs = remarquesDeFournee(
      ref([step({ id: 10, title: 'Pâte', commentaire: 'a', batch_substeps: [{ id: 5, texte: 'x', commentaire: 'b', order_index: 0 }] })], [], {
        commentaire_global: 'Bien',
      }),
    );
    expect(nombreEtapesAnnotees(rs)).toBe(1);
  });
});

describe('ligneDecision', () => {
  it('reprend l’identité et la copie de la remarque', () => {
    const [r] = remarquesDeFournee(ref([step({ id: 10, title: 'Cuisson', source_step_id: 3, commentaire: 'trop longue' })]));
    const d = ligneDecision(r, 'gardee');
    expect(d).toMatchObject({ nature: 'etape', ligne_id: 10, statut: 'gardee', batch_id: 1, etape_titre: 'Cuisson', source_step_id: 3, texte: 'trop longue' });
    expect(cleRemarque(d.nature, d.ligne_id)).toBe(r.cle);
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

describe('libelleCoefficient', () => {
  it('donne le coefficient et la quantité à ×1', () => {
    expect(libelleCoefficient({ facteur: 1.5, prevu: 200, reel: 180, unite: 'g', ecart: 'x' })).toBe('×1,5 : 180 g utilisés (120 g à coefficient 1)');
  });
  it('sans quantité réelle : la quantité prévue', () => {
    expect(libelleCoefficient({ facteur: 2, prevu: 300, reel: null, unite: 'g', ecart: null })).toBe('×2 : 300 g prévus (150 g à coefficient 1)');
  });
  it('à ×1 ou sans coefficient : l’écart ordinaire, ou rien', () => {
    expect(libelleCoefficient({ facteur: 1, prevu: 200, reel: 180, unite: 'g', ecart: '180 g utilisés au lieu de 200 g' })).toBe('180 g utilisés au lieu de 200 g');
    expect(libelleCoefficient({ facteur: null, prevu: 200, reel: null, unite: 'g', ecart: null })).toBeNull();
  });
  it('remarquesDeRef porte le coefficient', () => {
    const r = ref([step({ id: 10, title: 'Pâte' })], [ing({ id: 50, batch_step_id: 10, name: 'Sucre', quantity: 200, real_quantity: 180 })], { facteur: 1.5 });
    const [x] = remarquesDeFournee(r);
    expect(x).toMatchObject({ facteur: 1.5, prevu: 200, reel: 180 });
  });
});

describe('remarquesDeSousEtape', () => {
  it('apparie par texte normalisé dans l’étape retrouvée', () => {
    const rs = remarquesDeFournee(
      ref([step({ id: 10, title: 'Pâte', batch_substeps: [{ id: 5, texte: 'Crémer le beurre', commentaire: 'pas assez', order_index: 0 }] })]),
    );
    const l = leconsPrecedentes(rs, [etape(1, 'Pâte')]);
    expect(remarquesDeSousEtape(l.parEtape[1], 'CREMER le beurre').map((x) => x.texte)).toEqual(['pas assez']);
    expect(remarquesDeSousEtape(l.parEtape[1], 'Autre')).toEqual([]);
    expect(remarquesDeSousEtape(undefined, 'Crémer')).toEqual([]);
  });
});
