// Normalisation de casse pure, utilisée à l'enregistrement d'une recette
// (CreerForm.tsx) : met une majuscule après chaque début de phrase (début du
// texte, ou juste après un « . », « ! » ou « ? » suivi d'un espace), sans
// toucher au reste — un sigle ou un nom propre déjà en majuscules ailleurs
// dans le texte n'est pas altéré.
export function capitalizeSentences(s: string | null | undefined): string {
  const t = (s ?? '').toString();
  if (!t) return t;
  return t.replace(/(^\s*|[.!?]\s+)([a-zà-öø-ÿ])/g, (_, prefix: string, letter: string) => prefix + letter.toUpperCase());
}

// Corrige « oeuf(s) » (digramme séparé, faute de la ligature « œ » sur la
// plupart des claviers) en « œuf(s) », en préservant la casse d'origine —
// appliqué aux noms d'ingrédients et au texte des étapes à l'enregistrement
// (CreerForm.tsx), et à la frappe dans les champs d'ingrédient
// (`saisieIngredient`). La table de référence des ingrédients
// (`ingredient_refs`) stocke la forme correcte : sans cette correction, la
// suggestion du référentiel ne s'affiche pas pendant la frappe.
//
// Liste FERMÉE de mots, jamais tout « oe » : « moelleux », « coefficient »,
// « Noël », « poêle » s'écrivent sans ligature. Outre « œuf », les mots
// susceptibles d'entrer un jour au référentiel (JEP-282) : bœuf (gélatine,
// graisse), cœur (cerise « cœur de pigeon »), œillet (fleur comestible),
// œillette (huile). Un mot à ajouter se range dans `MOTS_LIGATURE`, avec un test.
const MOTS_LIGATURE = ['oeuf', 'boeuf', 'coeur', 'oeillette', 'oeillet'];
const RE_LIGATURE = new RegExp(`\\b(?:${MOTS_LIGATURE.join('|')})s?\\b`, 'gi');

export function fixOeufLigature(s: string | null | undefined): string {
  const t = (s ?? '').toString();
  if (!t) return t;
  // « O » majuscule → « Œ », sinon « œ » : « OEUF » → « ŒUF », « Boeuf » → « Bœuf ».
  return t.replace(RE_LIGATURE, (mot) => mot.replace(/oe/i, (oe) => (oe[0] === 'O' ? 'Œ' : 'œ')));
}

// Slug d'un libellé de référentiel (tag…) : minuscules, sans accents, tirets.
// Même règle que le `slugify` local (non exporté) de `CreerForm` et de
// `RelectureEditor` : la v2 du mode projet crée aussi des tags. Les deux copies
// locales restent en place, hors périmètre.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}
