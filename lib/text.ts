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
