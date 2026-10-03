// Tests du regroupement d'un article dans une liste de courses (JEP-249) : un
// regroupement manqué laisse deux lignes, un regroupement abusif additionne
// deux choses différentes — les deux sont silencieux.
import { describe, expect, it } from 'vitest';
import { commentChoices, findMergeTarget, mergedComment, mergeCandidates, mergePreview, mergeResult, shoppingKey, sumQuantities } from '@/lib/shopping-merge';

describe('sumQuantities', () => {
  it('additionne les nombres, virgule comprise', () => {
    expect(sumQuantities('2', '3')).toBe('5');
    expect(sumQuantities('1,5', '2')).toBe('3.5');
  });
  it('réunit ce qui n’est pas numérique, sans rien perdre', () => {
    expect(sumQuantities('2', 'une pincée')).toBe('2 + une pincée');
    expect(sumQuantities(null, null)).toBeNull();
  });
});

describe('shoppingKey', () => {
  it('est identique pour les variantes d’un même article', () => {
    expect(shoppingKey('Jaunes d’œufs', 'unité(s)')).toBe(shoppingKey('jaune d\'oeuf', 'Unité(s)'));
  });
});

// Cas de la capture : 1 jaune d'œuf = 20 g (référence 7), unités 1 = « unité(s) », 2 = « g ».
const units = [
  { id: 1, name: 'unité(s)' },
  { id: 2, name: 'g' },
  { id: 3, name: 'ml' },
];
const conversions = [{ ingredient_ref_id: 7, from_quantity: 1, from_unit_id: 1, to_quantity: 20, to_unit_id: 2 }];
const ligne = (id: number, name: string, quantity: string | null, unit: string | null, ref_id: number | null = 7) => ({
  id, name, quantity, unit, ref_id,
});

describe('fusion avec conversion d’unité', () => {
  const enUnites = ligne(1, 'jaune d’œuf', '5', 'unité(s)');
  const enGrammes = ligne(2, 'Jaune d’œuf', '100', 'g');

  it('propose le même ingrédient dans une autre unité reliée par une conversion', () => {
    const items = [enUnites, enGrammes, ligne(3, 'Lait entier', '500', 'ml', 9)];
    expect(mergeCandidates(items, enUnites, conversions, units).map((i) => i.id)).toEqual([2]);
    expect(mergeCandidates(items, enGrammes, conversions, units).map((i) => i.id)).toEqual([1]);
  });

  it('additionne dans l’unité de la ligne cliquée, dans les deux sens', () => {
    expect(mergeResult(enUnites, enGrammes, conversions, units)).toEqual({ quantity: '10', converted: 5 });
    expect(mergeResult(enGrammes, enUnites, conversions, units)).toEqual({ quantity: '200', converted: 100 });
  });

  it('garde les décimales utiles', () => {
    expect(mergeResult(enUnites, ligne(4, 'Jaune d’œuf', '30', 'g'), conversions, units).quantity).toBe('6.5');
  });

  it('montre le calcul avant validation', () => {
    expect(mergePreview(enUnites, enGrammes, conversions, units)).toBe('5 unité(s) + 100 g (≈ 5 unité(s)) = 10 unité(s)');
  });

  it('même unité : comportement d’origine, sans aperçu', () => {
    const a = ligne(1, 'Sucre', '100', 'g', 3);
    const b = ligne(2, 'Farine', '50', 'g', 4); // même unité : proposé comme avant, au choix de l’utilisateur
    expect(mergeCandidates([a, b], a, conversions, units).map((i) => i.id)).toEqual([2]);
    expect(mergeResult(a, b, conversions, units)).toEqual({ quantity: '150', converted: null });
    expect(mergePreview(a, b, conversions, units)).toBeNull();
  });

  it('ne propose pas un autre ingrédient dans une autre unité', () => {
    const lait = ligne(3, 'Lait entier', '100', 'g', 9);
    expect(mergeCandidates([enUnites, lait], enUnites, conversions, units)).toEqual([]);
  });

  it('ne propose rien sans conversion connue', () => {
    expect(mergeCandidates([enUnites, ligne(5, 'Jaune d’œuf', '10', 'ml')], enUnites, conversions, units)).toEqual([]);
    expect(mergeCandidates([enUnites, enGrammes], enUnites, [], units)).toEqual([]);
  });

  it('ne convertit pas une ligne sans rattachement au référentiel', () => {
    const a = ligne(1, 'jaune d’œuf', '5', 'unité(s)', null);
    const b = ligne(2, 'Jaune d’œuf', '100', 'g', null);
    expect(mergeCandidates([a, b], a, conversions, units)).toEqual([]);
  });

  it('ne convertit pas une quantité qui n’est pas un nombre', () => {
    const pincee = ligne(6, 'Jaune d’œuf', 'une pincée', 'g');
    expect(mergeCandidates([enUnites, pincee], enUnites, conversions, units)).toEqual([]);
    expect(mergeCandidates([enUnites, ligne(7, 'Jaune d’œuf', null, 'g')], enUnites, conversions, units)).toEqual([]);
  });
});

describe('fusion automatique à l’ajout (findMergeTarget)', () => {
  const dansListe = [
    ligne(1, 'Jaune d’œuf', '200', 'g'),
    ligne(2, 'Lait entier', '500', 'ml', 9),
    ligne(3, 'Jaune d’œuf', '2', 'unité(s)'),
  ];
  const entrant = (name: string, quantity: string | null, unit: string | null, ref_id: number | null = 7) => ({ name, quantity, unit, ref_id });

  it('même unité : additionne, sans convertir', () => {
    const hit = findMergeTarget(dansListe, entrant('Jaunes d’œufs', '3', 'unité(s)'), conversions, units);
    expect(hit?.item.id).toBe(3);
    expect(hit?.quantity).toBe('5');
  });

  it('même unité prioritaire sur une unité convertible', () => {
    expect(findMergeTarget(dansListe, entrant('jaune d’œuf', '100', 'g'), conversions, units)?.item.id).toBe(1);
  });

  it('autre unité reliée par une conversion : convertit dans l’unité de la ligne existante', () => {
    const liste = [ligne(1, 'Jaune d’œuf', '200', 'g')];
    const hit = findMergeTarget(liste, entrant('Jaunes d’œufs', '5', 'unité(s)'), conversions, units);
    expect(hit?.item.id).toBe(1);
    expect(hit?.quantity).toBe('300');
  });

  it('autre ingrédient, ou aucune conversion : nouvelle ligne', () => {
    const liste = [ligne(1, 'Jaune d’œuf', '200', 'g')];
    expect(findMergeTarget(liste, entrant('Lait entier', '5', 'unité(s)', 9), conversions, units)).toBeUndefined();
    expect(findMergeTarget(liste, entrant('Jaunes d’œufs', '5', 'unité(s)'), [], units)).toBeUndefined();
  });

  it('ligne entrante sans rattachement ou sans quantité numérique : nouvelle ligne', () => {
    const liste = [ligne(1, 'Jaune d’œuf', '200', 'g', null)];
    expect(findMergeTarget(liste, entrant('Jaunes d’œufs', '5', 'unité(s)', null), conversions, units)).toBeUndefined();
    const liste2 = [ligne(1, 'Jaune d’œuf', '200', 'g')];
    expect(findMergeTarget(liste2, entrant('Jaunes d’œufs', 'une pincée', 'unité(s)'), conversions, units)).toBeUndefined();
  });

  it('pluriel, ligature, casse et espaces de l’unité : même ingrédient, même unité', () => {
    const liste = [ligne(1, 'Blancs d’œufs', '2', 'unité(s)')];
    expect(findMergeTarget(liste, entrant('blanc d\'oeuf', '1', ' Unité(s) '), conversions, units)?.item.id).toBe(1);
  });

  it('« sans unité » est une unité', () => {
    const liste = [ligne(9, 'Œufs', '1', null, null)];
    expect(findMergeTarget(liste, entrant('oeuf', '2', '', null), conversions, units)?.quantity).toBe('3');
    expect(findMergeTarget(liste, entrant('oeuf', '2', 'g', null), conversions, units)).toBeUndefined();
  });

  describe('commentaire', () => {
    const avec = (id: number, comment: string | null, quantity = '200', unit = 'g') => ({ ...ligne(id, 'Jaune d’œuf', quantity, unit), comment });
    const entrantAvec = (comment: string | null, quantity = '5', unit = 'unité(s)') => ({ ...entrant('Jaunes d’œufs', quantity, unit), comment });

    it('commentaire différent : jamais regroupé, même unité ou unité convertie', () => {
      expect(findMergeTarget([avec(1, 'température ambiante')], entrantAvec('froid', '100', 'g'), conversions, units)).toBeUndefined();
      expect(findMergeTarget([avec(1, 'température ambiante')], entrantAvec('froid'), conversions, units)).toBeUndefined();
    });

    it('un commentaire d’un seul côté est un commentaire différent', () => {
      expect(findMergeTarget([avec(1, 'température ambiante')], entrantAvec(null), conversions, units)).toBeUndefined();
      expect(findMergeTarget([avec(1, null)], entrantAvec('température ambiante'), conversions, units)).toBeUndefined();
    });

    it('même commentaire (casse et espaces ignorés) : regroupé', () => {
      expect(findMergeTarget([avec(1, 'Température ambiante')], entrantAvec(' température ambiante '), conversions, units)?.quantity).toBe('300');
      expect(findMergeTarget([avec(1, null)], entrantAvec(''), conversions, units)?.quantity).toBe('300');
    });

    it('choisit parmi plusieurs lignes celle qui a le même commentaire', () => {
      const liste = [avec(1, 'froid', '100', 'unité(s)'), avec(2, 'température ambiante', '100', 'unité(s)')];
      expect(findMergeTarget(liste, entrantAvec('température ambiante', '1', 'unité(s)'), conversions, units)?.item.id).toBe(2);
    });
  });

  it('nom vide : jamais regroupé', () => {
    expect(findMergeTarget([ligne(1, '', null, null)], entrant('  ', null, null, null), conversions, units)).toBeUndefined();
  });
});

describe('choix du commentaire à la fusion manuelle', () => {
  it('rien à choisir : aucun commentaire, ou le même (casse et espaces ignorés)', () => {
    expect(commentChoices(null, null)).toEqual([]);
    expect(commentChoices('', '  ')).toEqual([]);
    expect(commentChoices('Froid', ' froid ')).toEqual([]);
    expect(mergedComment(null, null)).toBeNull();
    expect(mergedComment('Froid', ' froid ')).toBe('Froid');
  });

  it('un seul commentaire : le garder (par défaut) ou n’en mettre aucun', () => {
    for (const [t, s] of [['à chauffer', null], [null, 'à chauffer']] as const) {
      const choix = commentChoices(t, s);
      expect(choix.map((c) => c.key)).toEqual(['keep', 'none']);
      expect(choix[0].value).toBe('à chauffer');
      expect(choix[1].value).toBeNull();
      expect(mergedComment(t, s)).toBe('à chauffer');
      expect(mergedComment(t, s, 'none')).toBeNull();
    }
  });

  it('deux commentaires différents : réunis par défaut, ou l’un, ou l’autre, ou aucun', () => {
    const choix = commentChoices('froid', 'à chauffer');
    expect(choix.map((c) => c.key)).toEqual(['both', 'target', 'source', 'none']);
    expect(mergedComment('froid', 'à chauffer')).toBe('froid ; à chauffer');
    expect(mergedComment('froid', 'à chauffer', 'target')).toBe('froid');
    expect(mergedComment('froid', 'à chauffer', 'source')).toBe('à chauffer');
    expect(mergedComment('froid', 'à chauffer', 'none')).toBeNull();
  });

  it('un choix qui ne s’applique pas à cette paire retombe sur le choix par défaut', () => {
    expect(mergedComment('froid', null, 'both')).toBe('froid');
    expect(mergedComment(null, null, 'target')).toBeNull();
  });
});
