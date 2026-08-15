// État de la vitrine publique d'un pâtissier ⇄ URL. Fonctions pures — même
// doctrine que `lib/carnet-params.ts` et `lib/search-params.ts` : l'URL est le
// seul état de l'écran, rechargement, partage de lien et retour arrière
// restituent la même recherche et le même tri. Pas de filtrage client sur une
// grille entièrement rendue.
import { SORT_KEYS, type RecipeSortKey } from '@/lib/recipe-sort';

export type PublicProfileParams = {
  q: string;
  tri: RecipeSortKey;
};

export const EMPTY_PUBLIC_PROFILE_PARAMS: PublicProfileParams = { q: '', tri: 'recent' };

export function parsePublicProfileParams(
  sp: Record<string, string | string[] | undefined>,
): PublicProfileParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const tri = SORT_KEYS.includes(one(sp.tri) as RecipeSortKey) ? (one(sp.tri) as RecipeSortKey) : 'recent';
  return { q: one(sp.q) || '', tri };
}

export function publicProfileParamsToQueryString(p: PublicProfileParams): string {
  const usp = new URLSearchParams();
  if (p.q) usp.set('q', p.q);
  if (p.tri !== 'recent') usp.set('tri', p.tri);
  return usp.toString();
}
