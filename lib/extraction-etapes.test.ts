// Tests de l'extraction d'étapes (JEP-258). Ce qui compte : la copie se lit
// dans l'ordre de la recette, recale ses jours sur le jour J, garde les
// ingrédients de SON étape (appariement par `order_index`) et crédite
// l'auteur d'origine.
import { describe, expect, it } from 'vitest';
import {
  creditExtraction,
  etapesRetenues,
  lirePoidsSaisi,
  planExtraction,
  poidsExtraction,
  rendementExtraction,
  titreParDefaut,
  type EtapeSource,
  type GroupeSource,
} from '@/lib/extraction-etapes';

const etape = (id: number, order_index: number, day_offset: number, title: string, extra: Partial<EtapeSource> = {}): EtapeSource => ({
  id,
  title,
  description: null,
  sous_etapes: null,
  prep_time: null,
  cook_time: null,
  wait_time: null,
  cook_temp: null,
  tips: null,
  video_url: null,
  day_offset,
  order_index,
  ...extra,
});

const etapes: EtapeSource[] = [
  etape(10, 0, 2, 'Pâte feuilletée'),
  etape(11, 1, 1, 'Crème pâtissière', {
    sous_etapes: ['Chauffer le lait', '', 'Cuire la crème'],
    step_photos: [
      { url: 'b.webp', order_index: 1, ai_retouched: false },
      { url: 'a.webp', original_url: 'a-o.webp', order_index: 0, ai_retouched: true },
    ],
  }),
  etape(12, 2, 1, 'Refroidir'),
  etape(13, 3, 0, 'Montage'),
];

const groupes: GroupeSource[] = [
  { order_index: 0, scaling_mode: 'foncage', ingredients: [{ name: 'Farine', quantity: '250', unit: 'g', comment: null, allergen: 'Gluten', ref_id: 1, order_index: 0 }] },
  {
    order_index: 1,
    scaling_mode: null,
    ingredients: [
      { name: 'Jaunes d’oeufs', quantity: '4', unit: 'unité(s)', comment: null, allergen: 'Œuf', ref_id: 2, order_index: 1 },
      { name: 'Lait', quantity: '500', unit: 'g', comment: 'entier', allergen: 'Lait', ref_id: 3, order_index: 0 },
      { name: '  ', quantity: '1', unit: 'g', comment: null, allergen: null, ref_id: null, order_index: 2 },
    ],
  },
];

describe('etapesRetenues', () => {
  it('suit l’ordre de la recette, pas celui des cases cochées', () => {
    expect(etapesRetenues(etapes, [12, 11]).map((e) => e.id)).toEqual([11, 12]);
  });
  it('ignore un identifiant étranger à la recette', () => {
    expect(etapesRetenues(etapes, [99])).toEqual([]);
  });
});

describe('planExtraction', () => {
  const plan = planExtraction(etapes, groupes, [11, 12]);

  it('recale les jours pour que la dernière étape retenue soit le jour J', () => {
    expect(plan.map((e) => e.day_offset)).toEqual([0, 0]);
    expect(planExtraction(etapes, groupes, [10, 12]).map((e) => e.day_offset)).toEqual([1, 0]);
  });

  it('copie les ingrédients de SON étape, triés, sans ligne vide, ligature posée', () => {
    expect(plan[0].ingredients.map((i) => i.name)).toEqual(['Lait', 'Jaunes d’œufs']);
    expect(plan[0].ingredients[0]).toMatchObject({ quantity: '500', unit: 'g', comment: 'entier', allergen: 'Lait', ref_id: 3 });
    expect(plan[1].ingredients).toEqual([]);
  });

  it('garde le mode d’ajustement du groupe', () => {
    expect(planExtraction(etapes, groupes, [10])[0].scaling_mode).toBe('foncage');
  });

  it('copie sous-étapes et photos dans l’ordre, sans entrée vide', () => {
    expect(plan[0].sous_etapes).toEqual(['Chauffer le lait', 'Cuire la crème']);
    expect(plan[0].photos).toEqual([
      { url: 'a.webp', original_url: 'a-o.webp', ai_retouched: true },
      { url: 'b.webp', original_url: null, ai_retouched: false },
    ]);
    expect(plan[1].sous_etapes).toBeNull();
  });

  it('ne rend rien sans étape retenue', () => {
    expect(planExtraction(etapes, groupes, [])).toEqual([]);
  });
});

describe('poidsExtraction', () => {
  it('somme ce qui se pèse et annonce le reste', () => {
    const p = poidsExtraction(
      [
        { name: 'Lait', quantity: '500', unit: 'g', ref_id: 3 },
        { name: 'Sucre', quantity: '0,1', unit: 'kg', ref_id: null },
        { name: 'Jaunes', quantity: '4', unit: 'unité(s)', ref_id: 2 },
      ],
      [],
      [],
    );
    expect(p.grams).toBe(600);
    expect(p.unconverted.map((u) => u.name)).toEqual(['Jaunes']);
  });
});

describe('titreParDefaut / creditExtraction', () => {
  it('reprend le titre d’une étape seule, sinon nomme la recette', () => {
    expect(titreParDefaut([{ title: 'Crème pâtissière' }], 'Mille-feuille')).toBe('Crème pâtissière');
    expect(titreParDefaut([{ title: 'A' }, { title: 'B' }], 'Mille-feuille')).toBe('Mille-feuille — préparation');
    expect(titreParDefaut([{ title: '  ' }], 'Mille-feuille')).toBe('Mille-feuille — préparation');
  });
  it('nomme l’auteur d’origine, sauf s’il extrait sa propre recette', () => {
    expect(creditExtraction('Mille-feuille', 'Élise', false)).toBe('Extrait de « Mille-feuille », de Élise');
    expect(creditExtraction('Mille-feuille', 'Élise', true)).toBe('Extrait de « Mille-feuille »');
    expect(creditExtraction('Mille-feuille', null, false)).toBe('Extrait de « Mille-feuille »');
  });
});

describe('rendement', () => {
  it('pose un rendement en grammes, ou rien', () => {
    expect(rendementExtraction(612.4)).toEqual({ measure_type: 'units', yield_qty: '612', yield_unit: 'g' });
    expect(rendementExtraction(0)).toBeNull();
    expect(rendementExtraction(null)).toBeNull();
  });
  it('lit une saisie raisonnable, refuse le reste', () => {
    expect(lirePoidsSaisi('450,6')).toBe(451);
    expect(lirePoidsSaisi('')).toBeNull();
    expect(lirePoidsSaisi('-3')).toBeNull();
    expect(lirePoidsSaisi('1000000')).toBeNull();
  });
});
