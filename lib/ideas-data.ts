// Boîte à idées — accès données (RPC `list_ideas` / `suggest_similar_ideas`).
// Server-only (createClient de lib/supabase/server, qui utilise
// next/headers) : à réserver aux Server Components et Route Handlers.
// Séparé de lib/ideas.ts pour que les composants client (IdeaForm) puissent
// importer les constantes/types sans entraîner ce module côté navigateur.
import { createClient } from '@/lib/supabase/server';
import { IDEAS_PAGE_SIZE, type IdeaCardData, type IdeaSort, type ListIdeasResult, type SimilarIdea } from '@/lib/ideas';

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
