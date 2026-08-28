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
// (CreerForm.tsx). La table de référence des ingrédients (`ingredient_refs`)
// stocke la forme correcte : sans cette correction, un ingrédient saisi
// « oeufs » ne rapproche jamais son `ref_id`.
export function fixOeufLigature(s: string | null | undefined): string {
  const t = (s ?? '').toString();
  if (!t) return t;
  return t.replace(/\boeufs?\b/gi, (match) => {
    const base = match.toLowerCase().endsWith('s') ? 'œufs' : 'œuf';
    if (match === match.toUpperCase()) return base.toUpperCase();
    if (match[0] === match[0].toUpperCase()) return base[0].toUpperCase() + base.slice(1);
    return base;
  });
}
