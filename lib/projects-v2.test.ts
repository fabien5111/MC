import { describe, expect, it } from 'vitest';
import { buildProjectFormatUpdate, projectV2BlockStates, utensilsToAdd } from '@/lib/projects';

describe('projectV2BlockStates', () => {
  it('ne débloque que l’intention, l’identité et le format sur un projet vierge', () => {
    const s = projectV2BlockStates({ measure_type: null, servings: null, components: [] });
    expect(s.intention.unlocked).toBe(true);
    expect(s.identite.unlocked).toBe(true);
    expect(s.format.unlocked).toBe(true);
    expect(s.structure.unlocked).toBe(false);
    expect(s.structure.lockedReason).toMatch(/intention ou un format/);
    expect(s.etapes.unlocked).toBe(false);
    expect(s.validation.unlocked).toBe(false);
  });

  it('ouvre la structure dès qu’une intention est saisie', () => {
    const s = projectV2BlockStates({ measure_type: null, servings: null, intent: ' Tarte au praliné ', components: [] });
    expect(s.structure.unlocked).toBe(true);
  });

  it('ouvre la structure dès que le format est posé', () => {
    const s = projectV2BlockStates({ measure_type: 'mold', servings: 8, components: [{ resolved: false }] });
    expect(s.structure.unlocked).toBe(true);
    expect(s.etapes.unlocked).toBe(false);
  });

  it('ouvre les blocs de recette dès une préparation résolue, la validation quand toutes le sont', () => {
    const partiel = projectV2BlockStates({
      measure_type: 'mold',
      servings: 8,
      components: [{ resolved: true }, { resolved: false }],
    });
    expect(partiel.etapes.unlocked).toBe(true);
    expect(partiel.ingredients.unlocked).toBe(true);
    expect(partiel.validation.unlocked).toBe(false);

    const complet = projectV2BlockStates({ measure_type: 'mold', servings: 8, components: [{ resolved: true }] });
    expect(complet.validation.unlocked).toBe(true);
    expect(complet.validation.lockedReason).toBeNull();
  });
});

describe('buildProjectFormatUpdate', () => {
  const base = { title: 'Tarte', servings: '8', count: '1', dims: {}, moldTypeId: '' };

  it('refuse un nombre de parts absent', () => {
    expect(buildProjectFormatUpdate({ ...base, format: 'round', servings: '' })).toEqual({
      error: 'Indiquez le nombre de parts visé.',
    });
  });

  it('écrit le moule et les dimensions d’un format en moule', () => {
    const r = buildProjectFormatUpdate({ ...base, format: 'round', dims: { diametre: '22', hauteur: '' }, moldTypeId: '6' });
    expect('payload' in r && r.payload).toMatchObject({
      measure_type: 'mold',
      mold_type_id: 6,
      mold_dims: { diametre: 22 },
      yield_desc: 'Ø 22 cm',
    });
  });

  it('ignore le moule en format libre', () => {
    const r = buildProjectFormatUpdate({ ...base, format: 'free', moldTypeId: '6' });
    expect('payload' in r && r.payload).toMatchObject({ measure_type: 'units', mold_type_id: null });
  });
});

describe('utensilsToAdd', () => {
  it('écarte les doublons par référentiel ou par nom normalisé', () => {
    const existants = [
      { name: 'Fouet', ref_id: 3 },
      { name: 'Poche à douille', ref_id: null },
    ];
    const entrants = [
      { name: 'fouets', ref_id: null, comment: null },
      { name: 'Batteur', ref_id: 3, comment: null },
      { name: 'Poches à douille', ref_id: null, comment: null },
      { name: 'Cercle Ø 20', ref_id: 9, comment: null },
      { name: 'cercle Ø 20', ref_id: null, comment: null },
    ];
    expect(utensilsToAdd(existants, entrants).map((u) => u.name)).toEqual(['Cercle Ø 20']);
  });
});
