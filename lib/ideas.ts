// Boîte à idées — accès données (RPC `list_ideas`) et logique d'affichage.
// À utiliser dans les Server Components (page /idees) et la route de
// pagination (/api/idees).
import { createClient } from '@/lib/supabase/server';

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

// Page d'idées + total, en un seul aller-retour (motif `search_advanced_recipes` :
// tri, pagination, compteur de votes et "ai-je voté" résolus côté SQL).
export async function listIdeas(opts: {
  sort?: IdeaSort;
  offset?: number;
  limit?: number;
  search?: string | null;
}): Promise<ListIdeasResult> {
  const { sort = 'votes', offset = 0, limit = IDEAS_PAGE_SIZE, search = null } = opts;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_ideas' as never, {
    search_term: search || null,
    sort_by: sort,
    offset_val: offset,
    limit_val: limit,
    count_only: false,
  } as never);
  if (error) {
    console.error('listIdeas:', error.message);
    return { total: 0, ideas: [], error: error.message };
  }
  const res = data as unknown as { total?: number; ideas?: IdeaCardData[] } | null;
  return { total: res?.total ?? 0, ideas: res?.ideas ?? [], error: null };
}

export type SimilarIdea = {
  id: string;
  title: string;
  status: string;
  votes_count: number;
  rank: number;
};

// Suggestions anti-doublons pendant la frappe du titre (vue création).
export async function suggestSimilarIdeas(term: string, max = 5): Promise<SimilarIdea[]> {
  const t = term.trim();
  if (t.length < 3) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('suggest_similar_ideas' as never, {
    term: t,
    max_results: max,
  } as never);
  if (error) {
    console.error('suggestSimilarIdeas:', error.message);
    return [];
  }
  return (data as unknown as SimilarIdea[]) ?? [];
}
