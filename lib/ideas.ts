// Boîte à idées — types et logique d'affichage, pures (aucun accès Supabase).
// Utilisable côté serveur (page /idees) comme côté client (IdeaForm) — le
// data-fetching (RPC) vit dans lib/ideas-data.ts, motif search-params.ts /
// search.ts.

export const IDEAS_PAGE_SIZE = 12;

export const IDEA_SORT_KEYS = ['votes', 'recent'] as const;
export type IdeaSort = (typeof IDEA_SORT_KEYS)[number];

export const IDEA_SORT_LABELS: Record<IdeaSort, string> = {
  votes: 'Plus votées',
  recent: 'Plus récentes',
};

export function parseIdeaSort(raw: string | string[] | undefined): IdeaSort {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return IDEA_SORT_KEYS.includes(v as IdeaSort) ? (v as IdeaSort) : 'votes';
}

// Statuts affichables (le statut "merged" n'apparaît jamais ici : une idée
// fusionnée est exclue de la liste par la RPC).
export const IDEA_STATUSES = {
  new: { label: 'Nouveau', badgeClass: 'bg-primary-fixed text-on-primary-fixed' },
  reviewing: { label: "À l'étude", badgeClass: 'bg-secondary-container text-on-secondary-container' },
  in_progress: { label: 'En développement', badgeClass: 'bg-tertiary-container text-on-tertiary-container' },
  done: { label: 'Terminé', badgeClass: 'bg-primary text-on-primary' },
  declined: { label: 'Ne sera pas fait', badgeClass: 'bg-surface-container-highest text-on-surface-variant' },
  merged: { label: 'Fusionnée', badgeClass: 'bg-surface-container-highest text-on-surface-variant' },
} as const satisfies Record<string, { label: string; badgeClass: string }>;

export type IdeaStatus = keyof typeof IDEA_STATUSES;

export function isIdeaStatus(v: string): v is IdeaStatus {
  return v in IDEA_STATUSES;
}

export type IdeaCardData = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
  votes_count: number;
  has_voted: boolean;
};

export type ListIdeasResult = { total: number; ideas: IdeaCardData[]; error: string | null };

export type SimilarIdea = {
  id: string;
  title: string;
  status: string;
  votes_count: number;
  has_voted: boolean;
  rank: number;
};

// Contraintes de saisie du formulaire (motif titre "Recherche dynamique" de
// la vue création). Le titre reprend la contrainte SQL (5..60) ; la
// description reste volontairement plus courte que la limite SQL (1000) —
// "une description courte" du spec, pas un roman.
export const IDEA_TITLE_MAX = 60;
export const IDEA_DESCRIPTION_MAX = 300;
