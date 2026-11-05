// Suggestions d'un champ de saisie (ingrédients, ustensiles) — logique pure.
//
// Remplace le filtrage du `<datalist>` natif : celui-ci est sensible aux
// accents (« creme » ne propose pas « Crème ») et, surtout, ne s'affiche pas
// sur iPadOS (pas de barre de suggestions au-dessus du clavier). Même règle de
// comparaison que le reste du site (`normSearch` : casse + accents).
import { normSearch } from '@/lib/text-search';

export const SUGGESTIONS_MAX = 8;

// Options correspondant à la saisie : celles qui COMMENCENT par le terme (ou
// dont un mot commence par lui) d'abord, puis celles qui le contiennent,
// chaque groupe dans l'ordre d'origine. Saisie vide : aucune suggestion.
// Une seule option identique à la saisie n'est pas proposée (rien à choisir).
export function filtrerSuggestions(options: readonly string[], saisie: string, max = SUGGESTIONS_MAX): string[] {
  const q = normSearch(saisie);
  if (!q) return [];
  const debut: string[] = [];
  const contenu: string[] = [];
  const vus = new Set<string>();
  for (const o of options) {
    const n = normSearch(o);
    if (!n || vus.has(n)) continue;
    const i = n.indexOf(q);
    if (i < 0) continue;
    vus.add(n);
    if (i === 0 || n[i - 1] === ' ' || n[i - 1] === "'") debut.push(o);
    else contenu.push(o);
  }
  const res = [...debut, ...contenu];
  if (res.length === 1 && normSearch(res[0]) === q) return [];
  return res.slice(0, max);
}
