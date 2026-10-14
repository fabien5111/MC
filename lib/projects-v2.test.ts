import { describe, expect, it } from 'vitest';
import { stepTimeSums } from '@/lib/recipe-view';
import { pointsRestants, empreinteEtapes, empreinteQuantites, projectTodo, buildProjectFormatUpdate, projectFormatKey, projectV2BlockStates, lignesRendement, quantitiesStale, utensilsToAdd } from '@/lib/projects';

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

describe('empreinte du format et quantités périmées', () => {
  const rond = { measure_type: 'mold', mold_type_id: 3, mold_dims: { diametre: 26, hauteur: 2 }, yield_qty: '1', servings: 8 };

  it("est stable : l'ordre des dimensions et les nombres écrits en texte n'y changent rien", () => {
    expect(projectFormatKey(rond)).toBe(
      projectFormatKey({ ...rond, mold_dims: { hauteur: '2', diametre: 26.0 } as never }),
    );
  });

  it('change dès que le moule, une dimension, le nombre ou les parts changent', () => {
    const base = projectFormatKey(rond);
    expect(projectFormatKey({ ...rond, mold_dims: { diametre: 28, hauteur: 2 } })).not.toBe(base);
    expect(projectFormatKey({ ...rond, mold_type_id: 4 })).not.toBe(base);
    expect(projectFormatKey({ ...rond, yield_qty: '2' })).not.toBe(base);
    expect(projectFormatKey({ ...rond, servings: 10 })).not.toBe(base);
  });

  it('ne signale que les préparations ajustées pour un AUTRE format', () => {
    const cle = projectFormatKey(rond);
    const ancienne = projectFormatKey({ ...rond, mold_dims: { diametre: 20, hauteur: 2 } });
    const c = { resolved: true, stepCount: 2 };
    expect(quantitiesStale({ ...c, scaleFormatKey: ancienne }, cle)).toBe(true);
    expect(quantitiesStale({ ...c, scaleFormatKey: cle }, cle)).toBe(false);
    // Sans empreinte (avant la migration) : on se tait.
    expect(quantitiesStale({ ...c, scaleFormatKey: null }, cle)).toBe(false);
    // Non résolue ou sans étape : pas de quantités à périmer.
    expect(quantitiesStale({ resolved: false, stepCount: 2, scaleFormatKey: ancienne }, cle)).toBe(false);
    expect(quantitiesStale({ resolved: true, stepCount: 0, scaleFormatKey: ancienne }, cle)).toBe(false);
  });
});

describe('lignesRendement', () => {
  it('met chaque phrase sur sa ligne sans toucher au texte', () => {
    const t =
      '285 g — 1 cadre 24 x 24 cm, 5 mm d’épaisseur Perte de réalisation ≈ 5 % : 300 g pour 285 g utilisables. Entremets rond Ø 16 cm : ≈ 100 g, soit ×0,35 de la recette. Bûche en gouttière 20 x 7 cm : ≈ 80 g.';
    const l = lignesRendement(t);
    expect(l).toHaveLength(4);
    expect(l[1]).toMatch(/^Perte de réalisation/);
    expect(l[2]).toMatch(/^Entremets/);
    expect(l.join(' ')).toBe(t);
  });
  it('garde une phrase unique telle quelle', () => {
    expect(lignesRendement('12 sablés')).toEqual(['12 sablés']);
  });
});

describe('projectTodo', () => {
  const etape = { title: 'Pâte', description: 'Mélanger', sous_etapes: null, prep_time: 10, cook_time: null, wait_time: null, cook_temp: null, tips: null, day_offset: null };
  const lignes = [{ name: 'Farine', quantity: '100', unit: 'g', comment: null }];
  const base = (over: Record<string, unknown> = {}) => ({
    id: 1,
    name: 'Pâte sucrée',
    resolved: true,
    stepCount: 1,
    scaleFormatKey: null,
    checkedStepsKey: null,
    checkedQuantitiesKey: null,
    cleEtapes: empreinteEtapes([etape]),
    cleQuantites: empreinteQuantites(lignes, 1),
    ...over,
  });
  const todo = (c: ReturnType<typeof base>, verifsDispo = true) =>
    projectTodo({ intent: 'Une tarte', titleSet: true, measure_type: 'mold', formatKey: 'F1', verifsDispo, components: [c] });
  const etat = (items: ReturnType<typeof todo>, id: string) => items.find((i) => i.id === id)?.etat;

  it('constate seul intention, nom, format et recette choisie', () => {
    const t = todo(base());
    expect(['intention', 'nom', 'format', 'preparations', 'recette-1'].map((id) => etat(t, id))).toEqual(Array(5).fill('fait'));
    expect(etat(t, 'etapes-1')).toBe('afaire');
  });
  it('« étapes relues » ne vaut que tant que le contenu est le même', () => {
    const cle = empreinteEtapes([etape]);
    expect(etat(todo(base({ checkedStepsKey: cle })), 'etapes-1')).toBe('fait');
    const modifiee = empreinteEtapes([{ ...etape, description: 'Mélanger bien' }]);
    expect(etat(todo(base({ checkedStepsKey: cle, cleEtapes: modifiee })), 'etapes-1')).toBe('arefaire');
  });
  it('quantités : une modification ou un autre format les remet à refaire', () => {
    const cle = empreinteQuantites(lignes, 1);
    expect(etat(todo(base({ checkedQuantitiesKey: cle })), 'quantites-1')).toBe('fait');
    expect(etat(todo(base({ checkedQuantitiesKey: cle, cleQuantites: empreinteQuantites(lignes, 2) })), 'quantites-1')).toBe('arefaire');
    const perimee = todo(base({ checkedQuantitiesKey: cle, scaleFormatKey: 'AUTRE' }));
    expect(etat(perimee, 'quantites-1')).toBe('arefaire');
    expect(perimee.find((i) => i.id === 'quantites-1')?.bloque).toBe(true);
  });
  it('propose « quantités vérifiées » avant « étapes relues »', () => {
    const ids = todo(base()).map((i) => i.id);
    expect(ids.indexOf('quantites-1')).toBeGreaterThan(-1);
    expect(ids.indexOf('quantites-1')).toBeLessThan(ids.indexOf('etapes-1'));
  });
  it('chaque point mène à l’ancre de SA préparation', () => {
    const t = todo(base({ id: 7 }));
    const ancre = (id: string) => t.find((i) => i.id === id)?.ancre;
    expect(ancre('recette-7')).toBe('prep-7-recette');
    expect(ancre('etapes-7')).toBe('prep-7-etapes');
    expect(ancre('quantites-7')).toBe('prep-7-quantites');
  });
  it('sans colonne : pas de cases, seulement l’alerte de format', () => {
    const t = todo(base({ scaleFormatKey: 'AUTRE' }), false);
    expect(t.some((i) => i.verif)).toBe(false);
    expect(etat(t, 'quantites-1')).toBe('arefaire');
    expect(todo(base(), false).some((i) => i.id === 'etapes-1')).toBe(false);
  });
  it('une préparation non résolue n’a que sa recette à choisir', () => {
    const t = todo(base({ resolved: false, stepCount: 0 }));
    expect(etat(t, 'recette-1')).toBe('afaire');
    expect(t.some((i) => i.id === 'etapes-1')).toBe(false);
  });
});

describe('stepTimeSums', () => {
  it('additionne préparation, cuisson et repos de toutes les étapes', () => {
    expect(
      stepTimeSums([
        { prep_time: 20, cook_time: 20, wait_time: 105 },
        { prep_time: 15, cook_time: null, wait_time: undefined },
      ]),
    ).toEqual({ prep: 35, cook: 20, wait: 105, total: 160 });
  });
  it('vaut zéro sans étape', () => {
    expect(stepTimeSums([])).toEqual({ prep: 0, cook: 0, wait: 0, total: 0 });
  });
});

describe('pointsRestants', () => {
  it('liste les points non faits, la préparation devant le sien', () => {
    const etape = { title: 'P', description: 'x', sous_etapes: null, prep_time: null, cook_time: null, wait_time: null, cook_temp: null, tips: null, day_offset: null };
    const t = projectTodo({
      intent: 'Une tarte',
      titleSet: true,
      measure_type: null,
      formatKey: 'F',
      verifsDispo: true,
      components: [
        { id: 1, name: 'Ganache', resolved: true, stepCount: 1, scaleFormatKey: null, checkedStepsKey: null, checkedQuantitiesKey: null, cleEtapes: empreinteEtapes([etape]), cleQuantites: 'q' },
      ],
    });
    const r = pointsRestants(t);
    expect(r).toContain('Format défini');
    expect(r).toContain('Ganache — Étapes relues');
    expect(r).not.toContain('Intention décrite');
  });
  it('est vide quand tout est fait', () => {
    expect(pointsRestants([{ id: 'a', groupe: 'Le projet', libelle: 'x', etat: 'fait', ancre: 'a' }])).toEqual([]);
  });
});
