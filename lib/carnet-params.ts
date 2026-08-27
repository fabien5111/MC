// État du carnet ⇄ URL. Fonctions pures — même doctrine que
// lib/search-params.ts : l'URL est le seul état de l'écran, rechargement,
// partage de lien et retour arrière restituent le même filtrage. Pas de
// filtrage client sur une grille entièrement rendue.

// `proj` — projets en cours d'élaboration (mode projet, `project_stage =
// 'wizard'`). C'est une portée à part et non un statut : un projet en cours
// ne doit apparaître dans AUCUNE autre pastille, « Tout » compris (spec
// §10). « Tout » cesse donc d'être littéralement tout — c'est le prix de
// l'étanchéité, assumé ici plutôt que contourné.
export const SCOPES = ['all', 'mine', 'fav', 'sub', 'shared', 'proj'] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  all: 'Tout',
  mine: 'Mes recettes',
  fav: 'Favoris',
  sub: 'Mes abonnements',
  shared: 'Partagées avec moi',
  proj: 'Projets',
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

// La barre de statut disparaît sur Favoris, Mes abonnements et Projets : le statut y
// est donc toujours remis à « Tous », qu'il ait été passé dans l'URL ou non —
// une URL trafiquée (`?scope=fav&statut=draft`) ne doit pas produire un état
// que l'interface ne peut jamais atteindre par elle-même.
export function parseCarnetParams(sp: Record<string, string | string[] | undefined>): CarnetParams {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const scope = SCOPES.includes(one(sp.scope) as Scope) ? (one(sp.scope) as Scope) : 'all';
  const statutRaw = STATUSES.includes(one(sp.statut) as Status) ? (one(sp.statut) as Status) : 'all';
  // Idem sur « Projets » : un projet en cours est toujours un brouillon de
  // modération, la barre de statut n'y a aucun sens.
  const statut = scope === 'fav' || scope === 'sub' || scope === 'proj' ? 'all' : statutRaw;
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
