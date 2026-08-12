// Boîte à idées — accès données (RPC `list_ideas` / `suggest_similar_ideas`).
// Server-only (createClient de lib/supabase/server, qui utilise
// next/headers) : à réserver aux Server Components et Route Handlers.
// Séparé de lib/ideas.ts pour que les composants client (IdeaForm) puissent
// importer les constantes/types sans entraîner ce module côté navigateur.
import { createClient } from '@/lib/supabase/server';
import {
  IDEAS_PAGE_SIZE,
  type IdeaCardData,
  type IdeaSort,
  type IdeaSummary,
  type ListIdeasResult,
  type SimilarIdea,
} from '@/lib/ideas';
import type { IdeaCandidate } from '@/lib/ai/idea-duplicates';

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

// Fonds d'idées soumis à l'IA pour la détection de doublons — titre (+
// description pour le balayage admin) seulement, jamais le texte intégral :
// suffisant pour juger d'une correspondance de sens, et ça borne la taille du
// prompt. Plafonné à 300 idées (les plus récentes) : au-delà, un site de cette
// taille aurait de toute façon besoin d'une vraie recherche vectorielle.
const AI_CANDIDATE_LIMIT = 300;

// Vérification à la création : contre le fonds ouvert, y COMPRIS les idées
// refusées — savoir qu'une idée proche a déjà été déclinée (et pourquoi) évite
// à l'auteur de perdre son temps et aux votes de se disperser sur un doublon.
export async function getIdeaCandidatesForCheck(): Promise<IdeaCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ideas')
    .select('id, title')
    .is('merged_into_id', null)
    .order('created_at', { ascending: false })
    .limit(AI_CANDIDATE_LIMIT);
  if (error) {
    console.error('getIdeaCandidatesForCheck:', error.message);
    return [];
  }
  return data ?? [];
}

// Balayage admin : seulement les idées encore "vivantes" (pas déjà fusionnées
// ni refusées) — fusionner deux idées closes n'a pas de sens.
export async function getIdeaCandidatesForScan(): Promise<IdeaCandidate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ideas')
    .select('id, title, description')
    .is('merged_into_id', null)
    .not('status', 'eq', 'declined')
    .order('created_at', { ascending: false })
    .limit(AI_CANDIDATE_LIMIT);
  if (error) {
    console.error('getIdeaCandidatesForScan:', error.message);
    return [];
  }
  return data ?? [];
}

// Résumés (titre, statut, votes, "ai-je voté") d'un ensemble d'idées désignées
// par id — sert à afficher les correspondances renvoyées par l'IA avec les
// mêmes composants (StatusBadge, VoteButton) que le reste du module, sans
// dupliquer le calcul du décompte de votes (RPC `ideas_summaries`, même motif
// que `list_ideas` / `suggest_similar_ideas`).
export async function getIdeaSummaries(ids: string[]): Promise<IdeaSummary[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('ideas_summaries' as never, { idea_ids: ids } as never);
  if (error) {
    console.error('getIdeaSummaries:', error.message);
    return [];
  }
  return (data as unknown as IdeaSummary[]) ?? [];
}
