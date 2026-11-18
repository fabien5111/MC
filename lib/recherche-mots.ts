// Recherche d'une recette par son titre, mot à mot (JEP-403).
//
// La recherche cherchait la saisie ENTIÈRE dans le titre : « tarte chocolat »
// ne trouvait pas « Tarte au chocolat ». La saisie est désormais découpée en
// mots significatifs, et chaque mot doit figurer dans le titre (ET), dans
// n'importe quel ordre. Pur, sans dépendance : la route n'a plus qu'à poser un
// filtre `ilike` par mot.

// Mots vides ignorés : trop fréquents pour départager deux titres, et souvent
// absents d'un titre qui les sous-entend (« pâte sucrée » / « pâte à sucrée »).
const MOTS_VIDES = new Set([
  'a', 'à', 'au', 'aux', 'de', 'des', 'du', 'd', 'l', 'la', 'le', 'les', 'en', 'et', 'ou', 'un', 'une', 'sur', 'pour', 'avec', 'sans',
]);

// Radical d'un mot pour la comparaison : sans son « s » ou son « x » final.
// Un radical cherché en sous-chaîne trouve le singulier ET le pluriel
// (« amande » trouve « amandes », « choux » trouve « chou ») — même tolérance
// que l'ancienne variante singulier/pluriel, sans doubler les filtres.
export function radicalRecherche(mot: string): string {
  return mot.length > 3 && /[sx]$/.test(mot) ? mot.slice(0, -1) : mot;
}

// Mots à chercher (radicaux), dans l'ordre de la saisie et sans doublon. Les
// séparateurs (espaces, apostrophes, tirets, ponctuation) découpent : « pâte
// d'amande » → « pâte », « amande ». Si la saisie ne contient QUE des mots
// vides, ils sont gardés (chercher « la » vaut mieux que ne rien chercher).
export function motsRecherche(saisie: string): string[] {
  const bruts = saisie
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const pleins = bruts.filter((m) => !MOTS_VIDES.has(m));
  const retenus = (pleins.length ? pleins : bruts).map(radicalRecherche);
  return [...new Set(retenus)].filter(Boolean).slice(0, 8);
}
