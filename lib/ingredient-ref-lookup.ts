// Reconnaissance d'un nom d'ingrédient saisi dans le référentiel, côté
// éditeurs (`/creer`, relecture d'import) — fonctions pures.
//
// Même règle que le rattachement réel (`resolveIngredientRefId`) : libellé
// exact d'abord, `ingredientKey` en repli. Sans ce repli, « Œuf » restait
// encadré en rouge et sans allergène alors que le référentiel contient
// « Œufs » ; l'ajouter au référentiel créait un doublon qu'Admin → Éléments
// inconnus proposait aussitôt de refusionner — on tournait en rond.

import { ingredientKey } from '@/lib/ingredient-name';

export type IngredientsConnus = { exacts: Set<string>; cles: Set<string> };

const exact = (nom: string): string => nom.trim().toLowerCase();

export function ingredientsConnus(noms: string[]): IngredientsConnus {
  const exacts = new Set<string>();
  const cles = new Set<string>();
  for (const n of noms) {
    exacts.add(exact(n));
    const k = ingredientKey(n);
    if (k) cles.add(k);
  }
  return { exacts, cles };
}

// Vrai si le nom désigne un ingrédient du référentiel (exact ou même clé).
export function estIngredientConnu(connus: IngredientsConnus, nom: string): boolean {
  if (connus.exacts.has(exact(nom))) return true;
  const k = ingredientKey(nom);
  return !!k && connus.cles.has(k);
}

// Allergènes du référentiel pour un nom saisi. `map` est indexée par libellé
// en minuscules (forme de `getRefAllergens`). `undefined` = ingrédient absent
// du référentiel ; chaîne vide = présent, sans allergène.
export function allergeneDeReference(map: Record<string, string>, nom: string): string | undefined {
  const e = exact(nom);
  if (Object.prototype.hasOwnProperty.call(map, e)) return map[e];
  const k = ingredientKey(nom);
  if (!k) return undefined;
  // Premier libellé de même clé, par ordre alphabétique (résultat stable si le
  // référentiel contient encore un doublon non fusionné).
  const libelle = Object.keys(map)
    .filter((l) => ingredientKey(l) === k)
    .sort((a, b) => a.localeCompare(b, 'fr'))[0];
  return libelle === undefined ? undefined : map[libelle];
}
