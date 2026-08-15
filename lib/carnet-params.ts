// État du carnet ⇄ URL. Fonctions pures — même doctrine que
// lib/search-params.ts : l'URL est le seul état de l'écran, rechargement,
// partage de lien et retour arrière restituent le même filtrage. Pas de
// filtrage client sur une grille entièrement rendue.

export const SCOPES = ['all', 'mine', 'fav', 'sub', 'shared'] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  all: 'Tout',
  mine: 'Mes recettes',
  fav: 'Favoris',
  sub: 'Mes abonnements',
  shared: 'Partagées avec moi',
};

export const STATUSES = ['all', 'published', 'draft', 'pending', 'rejected'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  all: 'Tous',
  published: 'Publiées',
  draft: 'Brouillons',
  pending: 'En attente',
  rejected: 'Refusées',
};

// Tris repris tels quels de `lib/recipe-sort.ts` : la vitrine publique d'un
// pâtissier propose les mêmes, avec les mêmes libellés (cf. ce fichier).
export { SORT_KEYS, SORT_LABELS } from '@/lib/recipe-sort';
import { SORT_KEYS, type RecipeSortKey } from '@/lib/recipe-sort';
export type CarnetSortKey = RecipeSortKey;

export type CarnetParams = {
  scope: Scope;
  // Le statut n'a de sens que sur mes propres recettes et sur ce qui m'est
  // partagé (mine/all/shared) — ce sont les recettes des autres, déjà
  // publiées et publiques, sur favoris/abonnements : leur statut ne me
  // regarde pas (cf. CLAUDE.md « Mon carnet »). Les recettes partagées, elles,
  // peuvent être des brouillons (portée « toutes »/« brouillons compris » du
  // partage de carnet, ou un partage direct sans restriction de statut).
  statut: Status;
  q: string;
  tri: CarnetSortKey;
};

export const EMPTY_CARNET_PARAMS: CarnetParams = { scope: 'all', statut: 'all', q: '', tri: 'recent' };

// La barre de statut disparaît sur Favoris et Mes abonnements : le statut y
// est donc toujours remis à « Tous », qu'il ait été passé dans l'URL ou non —
// une URL trafiquée (`?scope=fav&statut=draft`) ne doit pas produire un état
// que l'interface ne peut jamais atteindre par elle-même.
export function parseCarnetParams(sp: Record<string, string | string[] | undefined>): CarnetParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const scope = SCOPES.includes(one(sp.scope) as Scope) ? (one(sp.scope) as Scope) : 'all';
  const statutRaw = STATUSES.includes(one(sp.statut) as Status) ? (one(sp.statut) as Status) : 'all';
  const statut = scope === 'fav' || scope === 'sub' ? 'all' : statutRaw;
  const tri = SORT_KEYS.includes(one(sp.tri) as CarnetSortKey) ? (one(sp.tri) as CarnetSortKey) : 'recent';
  return { scope, statut, q: one(sp.q) || '', tri };
}

export function carnetParamsToQueryString(p: CarnetParams): string {
  const usp = new URLSearchParams();
  if (p.scope !== 'all') usp.set('scope', p.scope);
  if (p.statut !== 'all') usp.set('statut', p.statut);
  if (p.q) usp.set('q', p.q);
  if (p.tri !== 'recent') usp.set('tri', p.tri);
  return usp.toString();
}
