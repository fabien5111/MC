// Saisie d'un nom d'ingrédient : « oeuf » devient « œuf » dès la frappe (JEP-282),
// ainsi que les autres mots de la liste de `fixOeufLigature` (bœuf, cœur…).
//
// La liste de suggestions des champs d'ingrédient est un `<datalist>` natif,
// filtré par le navigateur en sous-chaîne simple : sans ligature, « oeuf » ne
// propose jamais « Œuf » du référentiel. Le nom passait déjà par
// `fixOeufLigature` à l'enregistrement — on applique la même règle pendant la
// frappe, pour que la suggestion apparaisse. Seule la liste fermée de
// `fixOeufLigature` est touchée (« moelleux » reste intact). Dépannage limité :
// les accents (« creme » / « Crème ») demanderaient une liste de suggestions
// maison, insensible aux accents.
import { fixOeufLigature } from '@/lib/text';

// Valeur corrigée du champ ; le curseur est replacé au même endroit du texte
// (la ligature raccourcit la chaîne d'un caractère).
export function saisieIngredient(el: HTMLInputElement | HTMLTextAreaElement): string {
  const brut = el.value;
  const corrige = fixOeufLigature(brut);
  if (corrige === brut) return brut;
  const pos = el.selectionStart ?? brut.length;
  const curseur = fixOeufLigature(brut.slice(0, pos)).length;
  requestAnimationFrame(() => {
    try {
      el.setSelectionRange(curseur, curseur);
    } catch {
      // Champ démonté ou sans sélection : sans conséquence.
    }
  });
  return corrige;
}
