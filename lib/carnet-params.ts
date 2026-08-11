// État du carnet ⇄ URL. Fonctions pures — même doctrine que
// lib/search-params.ts : l'URL est le seul état de l'écran, rechargement,
// partage de lien et retour arrière restituent le même filtrage. Pas de
// filtrage client sur une grille entièrement rendue.

export const SCOPES = ['all', 'mine', 'import', 'fav', 'sub'] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  all: 'Tout',
  mine: 'Mes créations',
  import: 'Importées',
  fav: 'Favoris',
  sub: 'Mes abonnements',
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

export const SORT_KEYS = ['recent', 'alpha', 'rating'] as const;
export type CarnetSortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<CarnetSortKey, string> = {
  recent: 'Plus récentes',
  alpha: 'Alphabétique',
  rating: 'Mieux notées',
};

export type CarnetParams = {
  scope: Scope;
  // Le statut n'a de sens que sur mes propres recettes (mine/import/all) —
  // ce sont les recettes des autres sur favoris/abonnements, leur statut ne
  // me regarde pas (cf. CLAUDE.md « Mon carnet »).
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
