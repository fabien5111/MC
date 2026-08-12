// Chargeurs de données admin, typés — portés de db.js (getMolds, getMoldTypes).
import { createClient } from '@/lib/supabase/server';
import { TAUX_EUR_AFFICHE } from '@/lib/ai/cost';
import {
  isImpersonationMode,
  withImpersonationSchema,
  type ImpersonationMode,
} from '@/lib/impersonation-types';
import type { Database } from '@/lib/database.types';

export type MoldType = Database['public']['Tables']['mold_types']['Row'];
export type Mold = Database['public']['Tables']['molds']['Row'] & {
  mold_types: { name: string } | null;
};

export async function getMoldTypes(): Promise<MoldType[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('mold_types')
    .select('*')
    .eq('status', 'published')
    .order('name');
  return data ?? [];
}

export async function getMolds(): Promise<Mold[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('molds').select('*, mold_types(name)').order('name');
  return (data as unknown as Mold[]) ?? [];
}

// ── Tableau de bord ──────────────────────────────────────────
export type AdminRecipeRow = {
  id: string;
  title: string;
  hero_image_url: string | null;
  measure_type: string | null;
  is_public: boolean | null;
  status: string | null;
  created_at: string | null;
  profiles: { full_name: string | null } | null;
};
export type PendingComment = {
  id: number;
  content: string;
  recipe_id: string | null;
  created_at: string | null;
  profiles: { full_name: string | null } | null;
  recipes: { title: string | null } | null;
};

export async function getAdminStats(): Promise<{ totalRecipes: number; pendingRecipes: number; pendingComments: number }> {
  const supabase = await createClient();
  const [r, p, c] = await Promise.all([
    supabase.from('recipes').select('*', { count: 'exact', head: true }).eq('status', 'published'),
    supabase.from('recipes').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('comments').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  return { totalRecipes: r.count || 0, pendingRecipes: p.count || 0, pendingComments: c.count || 0 };
}

export async function getPendingRecipes(): Promise<AdminRecipeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('recipes')
    .select('id, title, hero_image_url, measure_type, is_public, status, created_at, profiles!recipes_author_id_fkey(full_name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data as unknown as AdminRecipeRow[]) ?? [];
}

export async function getManagedRecipes(): Promise<AdminRecipeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('recipes')
    .select('id, title, hero_image_url, measure_type, is_public, status, created_at, profiles!recipes_author_id_fkey(full_name)')
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  return (data as unknown as AdminRecipeRow[]) ?? [];
}

// ── Contrôle IA à la validation des recettes (modération, §6.2) ───────────
// `recipe_analysis` est absente de lib/database.types.ts tant que la
// migration du lot 1 n'a pas été appliquée puis régénérée
// (`npm run gen:types`) — jamais éditée à la main (CLAUDE.md). Accès non
// typé sur cette seule table en attendant, comme ailleurs dans ce fichier
// pour des jointures non régénérées.
export type RecipeAnalysisCategory = {
  code: string;
  score: number;
  extraits: string[];
  explication: string;
};
export type RecipeAnalysisSummary = {
  id: number;
  status: 'en_cours' | 'termine' | 'echec';
  overall_flag: 'vert' | 'orange' | 'rouge' | null;
  moderation_verdict: 'clean' | 'attention' | 'bloquant' | null;
  // `external_note` : mention explicite quand la recherche externe (§6.4)
  // n'a pas pu être lancée ou tentée (texte trop générique, échec réseau).
  moderation_details: { categories: RecipeAnalysisCategory[]; external_note?: string } | null;
  editorial_similarity_max: number | null;
  structural_similarity_max: number | null;
  error_message: string | null;
  created_at: string;
};

// La plus récente analyse de chaque recette d'une liste, indexée par
// `recipe_id`. Une recette peut avoir plusieurs lignes d'historique (relance
// manuelle) : on ne garde que la plus fraîche pour l'affichage admin.
export async function getLatestAnalyses(recipeIds: string[]): Promise<Record<string, RecipeAnalysisSummary>> {
  if (!recipeIds.length) return {};
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('recipe_analysis')
    .select(
      'id, recipe_id, status, overall_flag, moderation_verdict, moderation_details, ' +
        'editorial_similarity_max, structural_similarity_max, error_message, created_at',
    )
    .in('recipe_id', recipeIds)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getLatestAnalyses:', error.message);
    return {};
  }
  const byRecipe: Record<string, RecipeAnalysisSummary> = {};
  for (const row of (data ?? []) as (RecipeAnalysisSummary & { recipe_id: string })[]) {
    if (!byRecipe[row.recipe_id]) byRecipe[row.recipe_id] = row;
  }
  return byRecipe;
}

export type RecipeSimilarityMatchSummary = {
  id: number;
  analysis_id: number;
  source_type: 'interne' | 'externe';
  source_recipe_id: string | null;
  source_url: string | null;
  source_title: string | null;
  editorial_score: number;
  structural_score: number;
  longest_common_sequence: number | null;
  matched_excerpts: { extrait_soumis: string; extrait_source: string; commun?: string }[] | null;
  // 'embedding' sert de marqueur pour la couche B approximée par jugement
  // Claude (pas un vrai calcul cosinus, cf. lib/ai/reformulation.ts) —
  // distingue une reformulation détectée d'une copie littérale ('shingles').
  detection_method: 'shingles' | 'embedding' | 'les_deux' | null;
};

// Correspondances de similarité (§6.3) pour un ensemble d'analyses, groupées
// par `analysis_id` et triées par score rédactionnel décroissant (§7 : « les
// correspondances sont triées par editorial_score décroissant »).
export async function getMatchesForAnalyses(analysisIds: number[]): Promise<Record<number, RecipeSimilarityMatchSummary[]>> {
  if (!analysisIds.length) return {};
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('recipe_similarity_match')
    .select(
      'id, analysis_id, source_type, source_recipe_id, source_url, source_title, ' +
        'editorial_score, structural_score, longest_common_sequence, matched_excerpts, detection_method',
    )
    .in('analysis_id', analysisIds)
    .order('editorial_score', { ascending: false });
  if (error) {
    console.error('getMatchesForAnalyses:', error.message);
    return {};
  }
  const byAnalysis: Record<number, RecipeSimilarityMatchSummary[]> = {};
  for (const row of (data ?? []) as RecipeSimilarityMatchSummary[]) {
    (byAnalysis[row.analysis_id] ??= []).push(row);
  }
  return byAnalysis;
}

// ── Retour de calibration (§9 : « sur chaque correspondance, deux boutons
// "Faux positif" / "Copie confirmée" ») ────────────────────────────────────

export type MatchFeedbackVerdict = 'faux_positif' | 'confirme' | 'incertain';

// Un seul retour affiché par correspondance (le plus récent), pour éviter
// qu'un admin revote sur une correspondance déjà tranchée par un collègue —
// la table accepte plusieurs lignes par match (plusieurs admins), l'écran
// n'en affiche qu'une synthèse.
export async function getFeedbackForMatches(matchIds: number[]): Promise<Record<number, MatchFeedbackVerdict>> {
  if (!matchIds.length) return {};
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('recipe_analysis_feedback')
    .select('match_id, verdict, created_at')
    .in('match_id', matchIds)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getFeedbackForMatches:', error.message);
    return {};
  }
  const byMatch: Record<number, MatchFeedbackVerdict> = {};
  for (const row of (data ?? []) as { match_id: number; verdict: MatchFeedbackVerdict }[]) {
    if (!(row.match_id in byMatch)) byMatch[row.match_id] = row.verdict;
  }
  return byMatch;
}

export type CalibrationBucket = { label: string; total: number; fauxPositifs: number; tauxFauxPositifs: number };

// Tranches reprenant les seuils de drapeau du §8 (lib/ai/similarity.ts) :
// c'est précisément la frontière que le retour de calibration doit aider à
// ajuster.
const CALIBRATION_BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '30–49 %', min: 30, max: 50 },
  { label: '50–69 %', min: 50, max: 70 },
  { label: '70–100 %', min: 70, max: 101 },
];

// Taux de faux positifs par tranche de score rédactionnel (§9 : « écran de
// statistiques simple : taux de faux positifs par tranche de score »).
export async function getCalibrationStats(): Promise<CalibrationBucket[]> {
  const empty = () => CALIBRATION_BUCKETS.map((b) => ({ label: b.label, total: 0, fauxPositifs: 0, tauxFauxPositifs: 0 }));
  const supabase = await createClient();
  const { data: feedback, error } = await (supabase as any)
    .from('recipe_analysis_feedback')
    .select('match_id, verdict')
    .not('match_id', 'is', null);
  if (error) {
    console.error('getCalibrationStats:', error.message);
    return empty();
  }
  const rows = (feedback ?? []) as { match_id: number; verdict: MatchFeedbackVerdict }[];
  if (!rows.length) return empty();

  const matchIds = [...new Set(rows.map((r) => r.match_id))];
  const { data: matches } = await (supabase as any).from('recipe_similarity_match').select('id, editorial_score').in('id', matchIds);
  const scoreById = new Map(((matches ?? []) as { id: number; editorial_score: number }[]).map((m) => [m.id, m.editorial_score]));

  return CALIBRATION_BUCKETS.map((b) => {
    const inBucket = rows.filter((r) => {
      const score = scoreById.get(r.match_id);
      return score != null && score >= b.min && score < b.max;
    });
    const fauxPositifs = inBucket.filter((r) => r.verdict === 'faux_positif').length;
    return {
      label: b.label,
      total: inBucket.length,
      fauxPositifs,
      tauxFauxPositifs: inBucket.length ? Math.round((fauxPositifs / inBucket.length) * 100) : 0,
    };
  });
}

export async function getPendingComments(): Promise<PendingComment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('comments')
    .select('*, profiles(full_name), recipes(title)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data as unknown as PendingComment[]) ?? [];
}

// ── Boîte à idées (modération) ─────────────────────────────────────────
// Contrairement à `listIdeas` (vue publique, RPC `list_ideas`), on veut ici
// TOUTES les idées y compris fusionnées/refusées — visibilité complète pour
// la modération, là où la vue publique les exclut délibérément.
export type AdminIdeaRow = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
  author_id: string | null;
  merged_into_id: string | null;
  profiles: { full_name: string | null } | null;
  merged_into: { title: string } | null;
  votes_count: number;
};

export async function getAdminIdeas(): Promise<AdminIdeaRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ideas')
    .select(
      'id, title, description, status, admin_note, created_at, author_id, merged_into_id, ' +
        'profiles!ideas_author_id_fkey(full_name), merged_into:ideas!ideas_merged_into_id_fkey(title), idea_votes(count)',
    )
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getAdminIdeas:', error.message);
    return [];
  }
  return ((data ?? []) as unknown as (AdminIdeaRow & { idea_votes: { count: number }[] })[]).map((row) => ({
    ...row,
    votes_count: row.idea_votes?.[0]?.count ?? 0,
  }));
}

// ── Membres / allowlist (fusion profils + invitations) ───────
export type Member = {
  id: string;
  email: string;
  status: string;
  role: string;
  plan: string;
  is_demo: boolean;
  notes: string | null;
  invited_at: string | null;
  registeredAt: string | null;
  provider: string | null;
  avatarUrl: string | null;
  source: 'profile' | 'allowlist';
  profileId: string | null;
  allowlistId: number | null;
  fullName: string | null;
  recipeCount: number;
  // Droit d'impersonation hérité par les sessions « connecté en tant que »
  // ouvertes par ce membre — n'a de sens que pour un admin.
  impersonationAccess: ImpersonationMode;
};

export async function getAllowlistMembers(): Promise<Member[]> {
  const supabase = withImpersonationSchema(await createClient());
  const [{ data: profiles }, { data: allowlist }, { data: recipes }] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, full_name, avatar_url, provider, status, role, plan, is_demo, notes, created_at, impersonation_access',
      )
      .order('created_at', { ascending: false }),
    supabase.from('allowlist').select('*'),
    supabase.from('recipes').select('author_id'),
  ]);

  const recipeMap: Record<string, number> = {};
  (recipes ?? []).forEach((r) => {
    if (r.author_id) recipeMap[r.author_id] = (recipeMap[r.author_id] || 0) + 1;
  });
  const allowlistByEmail: Record<string, NonNullable<typeof allowlist>[number]> = {};
  (allowlist ?? []).forEach((a) => {
    allowlistByEmail[a.email.toLowerCase()] = a;
  });
  const usedEmails = new Set<string>();

  const registered: Member[] = (profiles ?? []).map((p) => {
    const emailKey = (p.email || '').toLowerCase();
    const al = emailKey ? allowlistByEmail[emailKey] : null;
    if (emailKey) usedEmails.add(emailKey);
    return {
      id: `p-${p.id}`,
      email: p.email || '',
      status: al?.status || p.status || 'active',
      role: al?.role || p.role || 'member',
      plan: al?.plan || p.plan || 'free',
      is_demo: al?.is_demo ?? p.is_demo ?? false,
      notes: al?.notes || p.notes || null,
      invited_at: al?.invited_at || p.created_at,
      registeredAt: p.created_at,
      provider: p.provider || null,
      avatarUrl: p.avatar_url || null,
      source: 'profile',
      profileId: p.id,
      allowlistId: al?.id ?? null,
      fullName: p.full_name,
      recipeCount: recipeMap[p.id] || 0,
      impersonationAccess: isImpersonationMode(p.impersonation_access) ? p.impersonation_access : 'read_only',
    };
  });

  const pending: Member[] = (allowlist ?? [])
    .filter((a) => !usedEmails.has(a.email.toLowerCase()))
    .map((a) => ({
      id: `a-${a.id}`,
      email: a.email,
      status: a.status,
      role: a.role,
      plan: a.plan,
      is_demo: a.is_demo,
      notes: a.notes,
      invited_at: a.invited_at,
      registeredAt: null,
      provider: null,
      avatarUrl: null,
      source: 'allowlist',
      profileId: null,
      allowlistId: a.id,
      fullName: null,
      recipeCount: 0,
      // Pas encore de profil : la valeur par défaut s'appliquera à l'inscription.
      impersonationAccess: 'read_only',
    }));

  return [...registered, ...pending];
}

// ── Listes / taxonomies (CRUD générique) ─────────────────────
export async function getListEntries(table: string, orderBy = 'name'): Promise<Record<string, unknown>[]> {
  const supabase = await createClient();
  try {
    // Table dynamique : hors du typage statique, cast local assumé.
    const { data, error } = await (supabase.from(table as any) as ReturnType<typeof supabase.from>)
      .select('*')
      .order(orderBy);
    if (error) {
      console.error(`getListEntries(${table}):`, error.message);
      return [];
    }
    return (data as unknown as Record<string, unknown>[]) ?? [];
  } catch (e) {
    console.error(`getListEntries(${table}) a levé une exception :`, (e as Error).message);
    return [];
  }
}

// ── Coûts IA (imports) ───────────────────────────────────────
// Consommation et coût réels des imports de recettes, mesurés depuis le bloc
// `usage` renvoyé par l'API Claude (cf. lib/ai/cost.ts). Réservé au back-office.
export type AiCostSummary = {
  /** Imports comptabilisés (ceux d'avant la migration n'ont pas de coût). */
  imports: number;
  importsSansCout: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
  /** Conversion indicative, calculée côté serveur (le taux est une var d'env). */
  eur: number;
  /** Coût moyen par import comptabilisé, en dollars. */
  moyenneUsd: number;
};

export type AiCosts = {
  jour: AiCostSummary;
  mois: AiCostSummary;
  total: AiCostSummary;
  /** Modèles rencontrés dans la période (le tarif dépend du modèle). */
  modeles: string[];
  /** Taux dollar → euro appliqué, à afficher pour lever l'ambiguïté. */
  tauxEur: number;
};

type ImportCostRow = {
  created_at: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
};

function resume(rows: ImportCostRow[]): AiCostSummary {
  const avecCout = rows.filter((r) => r.cost_usd != null);
  const usd = avecCout.reduce((s, r) => s + Number(r.cost_usd), 0);
  return {
    imports: rows.length,
    importsSansCout: rows.length - avecCout.length,
    inputTokens: rows.reduce((s, r) => s + (r.input_tokens ?? 0), 0),
    outputTokens: rows.reduce((s, r) => s + (r.output_tokens ?? 0), 0),
    usd: Math.round(usd * 1e6) / 1e6,
    eur: Math.round(usd * TAUX_EUR_AFFICHE * 1e6) / 1e6,
    moyenneUsd: avecCout.length ? Math.round((usd / avecCout.length) * 1e6) / 1e6 : 0,
  };
}

// Agrégats jour / mois / total. Nécessite une politique RLS autorisant les
// admins à lire toute la table `imports` (cf. migration) ; sans elle, les
// compteurs ne refléteraient que les imports de l'admin connecté.
export async function getAiCosts(): Promise<AiCosts> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('imports')
    .select('created_at, model, input_tokens, output_tokens, cost_usd')
    .order('created_at', { ascending: false });
  if (error) console.error('getAiCosts:', error.message);
  const rows = (data as unknown as ImportCostRow[]) ?? [];

  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);
  const debutMois = new Date();
  debutMois.setUTCDate(1);
  debutMois.setUTCHours(0, 0, 0, 0);

  return {
    jour: resume(rows.filter((r) => new Date(r.created_at) >= debutJour)),
    mois: resume(rows.filter((r) => new Date(r.created_at) >= debutMois)),
    total: resume(rows),
    modeles: [...new Set(rows.map((r) => r.model).filter((m): m is string => !!m))],
    tauxEur: TAUX_EUR_AFFICHE,
  };
}
