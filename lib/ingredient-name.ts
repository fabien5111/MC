// Clé de comparaison d'un nom d'ingrédient (JEP-249) — fonction pure.
//
// Un même ingrédient s'écrit de plusieurs façons selon l'auteur, l'import ou
// le clavier : « Jaune d'œuf », « jaunes d'oeufs », « Jaunes d’œufs ». Le
// texte saisi reste affiché tel quel ; c'est la COMPARAISON qui doit les
// confondre — rattachement au référentiel (`resolveIngredientRefId`), fusion
// de la liste totale, des courses, des fournées. Sans clé commune, chacun de
// ces endroits comparait `toLowerCase()` à sa façon, et deux lignes du même
// ingrédient restaient séparées (et, côté référentiel, sans `ref_id` : ni
// conversion, ni masse volumique — demain, ni coût ni stock).
//
// Règle, appliquée mot par mot :
//   - casse, accents, ligatures (œ → oe, æ → ae), apostrophes et ponctuation ;
//   - mots vides retirés (« de », « d' », « du », « des », « la »…) ;
//   - pluriel régulier ramené au singulier : « s » final, et « x » final
//     après un « u » (gâteaux, choux, noyaux, cheveux).
// Les deux côtés passant par la même fonction, un mot invariable (« noix »,
// « pois », « jus ») ou mal singularisé (« cassis » → « cassi ») se compare
// toujours à lui-même : l'approximation ne coûte rien tant qu'elle est
// symétrique. Seuls les mots de plus de 3 lettres perdent leur marque de
// pluriel, pour épargner « jus », « gras », « riz »…
//
// Jamais une clé stockée ni affichée : elle peut changer (règle affinée) sans
// migration. Son équivalent SQL (`public.mc_ingredient_key`) sert au
// rattrapage des `ref_id` et à la détection des doublons du référentiel —
// les deux doivent rester alignés.

const STOPWORDS = new Set(['a', 'au', 'aux', 'd', 'de', 'des', 'du', 'en', 'l', 'la', 'le', 'les', 'un', 'une']);

function singular(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('ux')) return w.slice(0, -1);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function ingredientKey(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w))
    .map(singular)
    .join(' ');
}

// Vrai si deux noms désignent le même ingrédient au sens de `ingredientKey`.
export function sameIngredient(a: string | null | undefined, b: string | null | undefined): boolean {
  return ingredientKey(a) === ingredientKey(b);
}

// Entrées du référentiel qui partagent la même clé (« Jaune d'œuf » /
// « Jaunes d'oeufs ») — un ingrédient ne doit y figurer qu'une fois, sans
// quoi coûts, stocks, conversions et masse volumique se répartiraient entre
// deux fiches. Groupes de 2 entrées ou plus, triés par libellé.
export function ingredientRefDuplicates<T extends { id: number; name: string }>(refs: T[]): T[][] {
  const byKey = new Map<string, T[]>();
  for (const r of refs) {
    const k = ingredientKey(r.name);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), r]);
  }
  return [...byKey.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => a.name.localeCompare(b.name, 'fr')))
    .sort((a, b) => a[0].name.localeCompare(b[0].name, 'fr'));
}
