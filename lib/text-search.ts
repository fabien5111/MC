// Recherche textuelle insensible à la casse ET aux accents (JEP-254 point 6).
//
// Une seule règle pour toutes les zones de recherche du site : « creme »
// trouve « Crème brûlée », « eclair » trouve « Éclair ». Côté navigateur, les
// filtres en mémoire passent par `matchesSearch` ; côté base, les colonnes
// générées `recipes.title_norm` / `profiles.full_name_norm` portent la même
// normalisation (fonction SQL `public.mc_norm_imm`), et le terme cherché y est
// passé déjà normalisé par `normSearch`.
//
// Même règle que `normLoose` (lib/search-params.ts) et que `public.mc_norm()`
// de la recherche avancée — casse, accents, espaces multiples.
import { normLoose } from '@/lib/search-params';

export const normSearch = normLoose;

// Vrai si l'un des champs contient le terme (déjà saisi tel quel, normalisé
// ici). Un terme vide ne filtre rien.
export function matchesSearch(fields: (string | null | undefined)[], query: string): boolean {
  const q = normSearch(query);
  if (!q) return true;
  return fields.some((f) => !!f && normSearch(f).includes(q));
}

// Filtre `ilike` sur une colonne normalisée, avec repli sur la colonne brute
// tant que la migration SQL qui crée la colonne normalisée n'est pas jouée :
// une recherche sensible aux accents vaut mieux qu'une recherche en panne. Le
// repli se reconnaît au nom de la colonne dans le message d'erreur PostgREST.
export async function withNormColumn<T extends { error: { message: string } | null }>(
  run: (column: string, term: string) => PromiseLike<T>,
  normColumn: string,
  rawColumn: string,
  term: string,
): Promise<T> {
  const res = await run(normColumn, normSearch(term));
  if (res.error && res.error.message.includes(normColumn)) {
    return run(rawColumn, term.trim());
  }
  return res;
}
