// Chargeurs de données admin, typés — portés de db.js (getMolds, getMoldTypes).
import { createClient } from '@/lib/supabase/server';
import { TAUX_EUR_AFFICHE } from '@/lib/ai/cost';
import { MODERATION_MODEL, EXTERNAL_SEARCH_MODEL } from '@/lib/ai/claude';
import {
  isImpersonationMode,
  withImpersonationSchema,
  type ImpersonationMode,
} from '@/lib/impersonation-types';
import type { Database } from '@/lib/database.types';
import { getMembersSubscriptionSummaries } from '@/lib/subscriptions-admin';

export type MoldType = Database['public']['Tables']['mold_types']['Row'];
export type Mold = Database['public']['Tables']['molds']['Row'] & {
  mold_types: { name: string } | null;
};

// Types de moule : servis par le cache de `lib/data/reference.ts`.
export { getMoldTypes } from '@/lib/data/reference';

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
  // Auteur de la recette : sert de repli pour le lien de profil (`/u/...`)
  // quand l'auteur n'a pas encore choisi de nom d'utilisateur, même motif
  // que sur la fiche recette publique.
  author_id: string;
  profiles: { full_name: string | null; username: string | null } | null;
  // Motif du refus (§9), présent seulement pour les recettes `rejected` —
  // absent de lib/database.types.ts tant que la migration n'a pas été
  // régénérée (npm run gen:types).
  moderation_note?: string | null;
  // Date du refus courant, horodatée par le trigger SQL
  // `recipes_track_rejection_note` dès que `moderation_note` change — même
  // statut « pas encore régénéré » que `moderation_note` ci-dessus.
  moderation_note_at?: string | null;
};
export type PendingComment = {
  id: number;
  content: string;
  recipe_id: string | null;
  created_at: string | null;
  profiles: { full_name: string | null } | null;
  recipes: { title: string | null } | null;
  // Note (avis fournée, cf. CLAUDE.md « Avis sur une recette ») et score IA
  // (0-100, probabilité que le texte soit inapproprié) — absentes de
  // lib/database.types.ts tant que la migration n'a pas été régénérée
  // (npm run gen:types), comme `moderation_note` sur les recettes.
  rating?: number | null;
  ai_score?: number | null;
  photo_urls?: string[] | null;
  ai_reason?: string | null;
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
    .select('id, title, hero_image_url, measure_type, is_public, status, created_at, author_id, profiles!recipes_author_id_fkey(full_name, username)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data as unknown as AdminRecipeRow[]) ?? [];
}

export async function getManagedRecipes(): Promise<AdminRecipeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('recipes')
    .select('id, title, hero_image_url, measure_type, is_public, status, created_at, author_id, profiles!recipes_author_id_fkey(full_name, username)')
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  return (data as unknown as AdminRecipeRow[]) ?? [];
}

// Recettes refusées (§9, statut `rejected`) : jusqu'ici invisibles une fois
// refusées (ni « à valider », ni « validées ») — remontées ici avec leur
// motif pour que l'admin garde la trace de sa décision et puisse republier
// si le refus était une erreur.
export async function getRejectedRecipes(): Promise<AdminRecipeRow[]> {
  const supabase = await createClient();
  // `moderation_note` / `moderation_note_at` absentes de
  // lib/database.types.ts tant que la migration n'a pas été régénérée
  // (npm run gen:types) — accès non typé sur ces champs, comme le reste du
  // contrôle IA en attendant.
  const { data } = await (supabase as any)
    .from('recipes')
    .select(
      'id, title, hero_image_url, measure_type, is_public, status, created_at, author_id, moderation_note, moderation_note_at, profiles!recipes_author_id_fkey(full_name, username)',
    )
    .eq('status', 'rejected')
    .order('created_at', { ascending: false });
  return (data as unknown as AdminRecipeRow[]) ?? [];
}

// Un refus précédent (§9), avec l'analyse IA qui était disponible au moment
// du refus (`analysis_id`, `null` si aucune analyse n'existait alors) —
// archivé par le trigger SQL `recipes_track_rejection_note` à chaque
// resoumission. Table dédiée plutôt qu'une colonne sur `recipes` : porter
// une date et une référence d'analyse par entrée ne tient plus dans un
// simple tableau de texte.
export type RejectionHistoryEntry = {
  id: number;
  motif: string;
  rejected_at: string;
  analysis_id: number | null;
};

export async function getRejectionHistory(recipeIds: string[]): Promise<Record<string, RejectionHistoryEntry[]>> {
  if (!recipeIds.length) return {};
  const supabase = await createClient();
  // `recipe_rejection_history` absente de lib/database.types.ts tant que la
  // migration n'a pas été régénérée (npm run gen:types).
  const { data, error } = await (supabase as any)
    .from('recipe_rejection_history')
    .select('id, recipe_id, motif, rejected_at, analysis_id')
    .in('recipe_id', recipeIds)
    .order('rejected_at', { ascending: false });
  if (error) {
    console.error('getRejectionHistory:', error.message);
    return {};
  }
  const byRecipe: Record<string, RejectionHistoryEntry[]> = {};
  for (const row of (data ?? []) as (RejectionHistoryEntry & { recipe_id: string })[]) {
    (byRecipe[row.recipe_id] ??= []).push(row);
  }
  return byRecipe;
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
  // Coût réel en dollars (§9), calculé par la route depuis la consommation
  // exacte de chaque appel — `null` si un tarif de modèle était inconnu au
  // moment du calcul, ou pour toute analyse antérieure à cette colonne.
  cost_usd: number | null;
  cost_tokens: number | null;
  cost_searches: number | null;
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
        'editorial_similarity_max, structural_similarity_max, error_message, ' +
        'cost_usd, cost_tokens, cost_searches, created_at',
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

// Un ensemble précis d'analyses par id — sert à ré-hydrater les analyses
// historiques référencées par `recipe_rejection_history.analysis_id`
// (§9 : « conserver les anciennes analyses avec les anciens motifs »),
// contrairement à getLatestAnalyses qui ne garde que la plus récente par
// recette.
export async function getAnalysesByIds(analysisIds: number[]): Promise<Record<number, RecipeAnalysisSummary>> {
  if (!analysisIds.length) return {};
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('recipe_analysis')
    .select(
      'id, status, overall_flag, moderation_verdict, moderation_details, ' +
        'editorial_similarity_max, structural_similarity_max, error_message, ' +
        'cost_usd, cost_tokens, cost_searches, created_at',
    )
    .in('id', analysisIds);
  if (error) {
    console.error('getAnalysesByIds:', error.message);
    return {};
  }
  const byId: Record<number, RecipeAnalysisSummary> = {};
  for (const row of (data ?? []) as RecipeAnalysisSummary[]) byId[row.id] = row;
  return byId;
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
    // `rating, ai_score, ai_reason` : cf. PendingComment ci-dessus.
    .select('*, profiles(full_name), recipes(title)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data as unknown as PendingComment[]) ?? [];
}

// Avis de l'écran de modération dédié (Admin → Commentaires) : TOUS les
// statuts, contrairement à `getPendingComments` — même besoin que
// `getRejectedRecipes` pour les recettes, un refus doit rester consultable
// (et rattrapable) après coup. Le tri par statut est fait côté composant.
export type AdminComment = PendingComment & {
  status: string | null;
  rejection_reason?: string | null;
  batch_id?: number | null;
};

export async function getAdminComments(): Promise<AdminComment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('comments')
    .select('*, profiles(full_name), recipes(title)')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getAdminComments:', error.message);
    return [];
  }
  return (data as unknown as AdminComment[]) ?? [];
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
  // Abonnement réel (table `subscriptions`), null pour une invitation en
  // attente (pas encore de profil). `profiles.plan` / `allowlist.plan`
  // ('free' / 'paid') sont mortes depuis le chantier abonnements — ne plus
  // les lire (cf. docs/abonnements.md § « doctrine restante »).
  subscription: { planCode: string; planLabel: string; type: string; endsAt: string | null; trialConsumed: boolean } | null;
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
  const [{ data: profiles }, { data: allowlist }, { data: recipes }, subscriptions] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, email, full_name, avatar_url, provider, status, role, is_demo, notes, created_at, impersonation_access',
      )
      .order('created_at', { ascending: false }),
    supabase.from('allowlist').select('*'),
    supabase.from('recipes').select('author_id'),
    getMembersSubscriptionSummaries(),
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
      subscription: subscriptions.get(p.id) ?? null,
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
      subscription: null,
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

// ── Coûts IA (import, vérification recettes, ajustement recette) ─────────
// Consommation et coût réels par catégorie d'appel IA, mesurés depuis le bloc
// `usage` renvoyé par l'API Claude (cf. lib/ai/cost.ts). Réservé au back-office.
// Une seule granularité de tokens (total, pas entrée/sortie) : `recipe_analysis`
// ne stocke que la somme (modération + éventuelle couche B + recherche
// externe, cf. /api/moderation-recette), un détail par catégorie serait donc
// incohérent entre les trois sources.
export type AiCostSummary = {
  /** Appels comptabilisés (ceux d'avant la mesure n'ont pas de coût). */
  appels: number;
  appelsSansCout: number;
  tokens: number;
  usd: number;
  /** Conversion indicative, calculée côté serveur (le taux est une var d'env). */
  eur: number;
  /** Coût moyen par appel comptabilisé, en dollars. */
  moyenneUsd: number;
};

export type AiCostCategory = {
  jour: AiCostSummary;
  mois: AiCostSummary;
  total: AiCostSummary;
  /** Modèles rencontrés dans la période (le tarif dépend du modèle). */
  modeles: string[];
};

export type AiCosts = {
  /** POST /api/import-url (+ /api/transcribe-photo en amont) — table `imports`. */
  import: AiCostCategory;
  /** POST /api/moderation-recette — table `recipe_analysis`. */
  verification: AiCostCategory;
  /** POST /api/scale-recipe — table `recipe_scale_costs`. */
  ajustement: AiCostCategory;
  /** Somme des trois catégories ci-dessus. */
  ensemble: AiCostCategory;
  /** Taux dollar → euro appliqué, à afficher pour lever l'ambiguïté. */
  tauxEur: number;
};

type CostRow = { created_at: string; tokens: number; cost_usd: number | null };

function resume(rows: CostRow[]): AiCostSummary {
  const avecCout = rows.filter((r) => r.cost_usd != null);
  const usd = avecCout.reduce((s, r) => s + Number(r.cost_usd), 0);
  return {
    appels: rows.length,
    appelsSansCout: rows.length - avecCout.length,
    tokens: rows.reduce((s, r) => s + r.tokens, 0),
    usd: Math.round(usd * 1e6) / 1e6,
    eur: Math.round(usd * TAUX_EUR_AFFICHE * 1e6) / 1e6,
    moyenneUsd: avecCout.length ? Math.round((usd / avecCout.length) * 1e6) / 1e6 : 0,
  };
}

function categorie(rows: CostRow[], modeles: string[], debutJour: Date, debutMois: Date): AiCostCategory {
  return {
    jour: resume(rows.filter((r) => new Date(r.created_at) >= debutJour)),
    mois: resume(rows.filter((r) => new Date(r.created_at) >= debutMois)),
    total: resume(rows),
    modeles,
  };
}

function fusionSummary(a: AiCostSummary, b: AiCostSummary): AiCostSummary {
  const appels = a.appels + b.appels;
  const appelsAvecCout = appels - (a.appelsSansCout + b.appelsSansCout);
  const usd = Math.round((a.usd + b.usd) * 1e6) / 1e6;
  return {
    appels,
    appelsSansCout: a.appelsSansCout + b.appelsSansCout,
    tokens: a.tokens + b.tokens,
    usd,
    eur: Math.round((a.eur + b.eur) * 1e6) / 1e6,
    moyenneUsd: appelsAvecCout ? Math.round((usd / appelsAvecCout) * 1e6) / 1e6 : 0,
  };
}

function fusion(cats: AiCostCategory[]): AiCostCategory {
  return {
    jour: cats.map((c) => c.jour).reduce(fusionSummary),
    mois: cats.map((c) => c.mois).reduce(fusionSummary),
    total: cats.map((c) => c.total).reduce(fusionSummary),
    modeles: [...new Set(cats.flatMap((c) => c.modeles))],
  };
}

// Agrégats jour / mois / total par catégorie + un total général. Nécessite une
// politique RLS autorisant les admins à lire toute la table sur `imports`,
// `recipe_analysis` et `recipe_scale_costs` (cf. migrations) ; sans elle, les
// compteurs ne refléteraient que les appels de l'admin connecté.
//
// `recipe_analysis` et `recipe_scale_costs` sont absentes de
// lib/database.types.ts tant que leurs migrations n'ont pas été appliquées en
// base puis régénérées (`npm run gen:types`) — accès non typé en attendant,
// même motif que dans /api/moderation-recette et /api/scale-recipe.
export async function getAiCosts(): Promise<AiCosts> {
  const supabase = await createClient();

  const [importsRes, verifRes, ajustRes] = await Promise.all([
    supabase
      .from('imports')
      .select('created_at, model, input_tokens, output_tokens, cost_usd')
      .order('created_at', { ascending: false }),
    (supabase.from('recipe_analysis' as any) as ReturnType<typeof supabase.from>)
      .select('created_at, cost_tokens, cost_usd')
      .order('created_at', { ascending: false }),
    (supabase.from('recipe_scale_costs' as any) as ReturnType<typeof supabase.from>)
      .select('created_at, model, input_tokens, output_tokens, cost_usd')
      .order('created_at', { ascending: false }),
  ]);
  if (importsRes.error) console.error('getAiCosts (import):', importsRes.error.message);
  if (verifRes.error) console.error('getAiCosts (vérification):', verifRes.error.message);
  if (ajustRes.error) console.error('getAiCosts (ajustement):', ajustRes.error.message);

  const debutJour = new Date();
  debutJour.setUTCHours(0, 0, 0, 0);
  const debutMois = new Date();
  debutMois.setUTCDate(1);
  debutMois.setUTCHours(0, 0, 0, 0);

  type TokensCostRow = { created_at: string; model: string | null; input_tokens: number | null; output_tokens: number | null; cost_usd: number | null };

  const importRows = ((importsRes.data as unknown as TokensCostRow[]) ?? []).map((r) => ({
    created_at: r.created_at,
    tokens: (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
    cost_usd: r.cost_usd,
  }));
  const importModeles = [
    ...new Set(((importsRes.data as unknown as TokensCostRow[]) ?? []).map((r) => r.model).filter((m): m is string => !!m)),
  ];

  const verifRows = (
    (verifRes.data as unknown as { created_at: string; cost_tokens: number; cost_usd: number | null }[]) ?? []
  ).map((r) => ({ created_at: r.created_at, tokens: r.cost_tokens, cost_usd: r.cost_usd }));

  const ajustRows = ((ajustRes.data as unknown as TokensCostRow[]) ?? []).map((r) => ({
    created_at: r.created_at,
    tokens: (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
    cost_usd: r.cost_usd,
  }));
  const ajustModeles = [
    ...new Set(((ajustRes.data as unknown as TokensCostRow[]) ?? []).map((r) => r.model).filter((m): m is string => !!m)),
  ];

  const importCat = categorie(importRows, importModeles, debutJour, debutMois);
  // Modération et (le cas échéant) recherche externe : pas de colonne `model`
  // par ligne, les deux modèles possibles sont donc listés statiquement.
  const verifCat = categorie(verifRows, [MODERATION_MODEL, EXTERNAL_SEARCH_MODEL], debutJour, debutMois);
  const ajustCat = categorie(ajustRows, ajustModeles, debutJour, debutMois);

  return {
    import: importCat,
    verification: verifCat,
    ajustement: ajustCat,
    ensemble: fusion([importCat, verifCat, ajustCat]),
    tauxEur: TAUX_EUR_AFFICHE,
  };
}

// ── Ingrédients / ustensiles non rattachés à la table de référence ───────
// « Inconnu » = nom saisi dans une recette qui ne correspond (insensible à la
// casse) à aucune entrée de `ingredient_refs` / `utensils`. Ne pas se fier à
// `ref_id IS NULL` seul : côté ustensiles, CreerForm ne renseigne jamais ce
// champ à l'enregistrement (cf. CLAUDE.md), donc `ref_id` y est toujours nul
// même pour un nom déjà référencé.
// RPC dédiées (`admin_unknown_ingredients` / `admin_unknown_utensils`, non
// encore dans lib/database.types.ts — cast `as never`, motif `list_ideas`) :
// une jointure ingrédient/ustensile → recette est plus simple à exprimer en
// SQL qu'en PostgREST, et évite de rapatrier toutes les recettes côté client.
// Pour un ingrédient, `step` (= `ingredient_groups.name`, qui porte le titre
// de l'étape — cf. CreerForm) repère l'étape concernée dans la recette ; sans
// ça, une recette à dix étapes obligerait à toutes les ouvrir pour retrouver
// la ligne visée. Absent pour un ustensile (`recipe_utensils` n'a pas
// d'étape, il est rattaché à la recette entière).
// `stepAnchor` : la fiche recette ancre chaque étape sur `sec-etape-{n}`, `n`
// étant sa position 1-based (`app/recette/[id]/page.tsx`, boucle `steps.map((s, i) …)`
// avec `id={`sec-etape-${i + 1}`}`). `ingredient_groups.order_index` est
// enregistré avec la même valeur 0-based que `recipe_steps.order_index` pour
// la même étape (CreerForm insère les deux avec `order_index: gi`), donc
// `order_index + 1` retombe exactement sur ce même `n` sans requête
// supplémentaire pour retrouver la position de l'étape dans la recette.
// `author` : nom (ou e-mail à défaut) de l'auteur de la recette — pour savoir
// à qui demander avant de corriger une saisie, sans ouvrir chaque recette.
// `authorId` : lie ce nom au profil public `/u/{authorId}` — la route accepte
// l'id en handle de repli quand l'auteur n'a pas choisi de nom d'utilisateur
// (cf. `getPublicProfile`), donc l'id seul suffit à construire un lien valide
// dans tous les cas, sans requête supplémentaire pour résoudre un username.
// `status` / `isPublic` : un ingrédient inconnu peut dormir dans un brouillon
// jamais publié — sans cette info, rien ne distingue une correction urgente
// (recette publique déjà visible) d'une saisie encore en chantier.
export type UnknownItem = {
  name: string;
  recipes: {
    id: string;
    title: string;
    author: string | null;
    authorId: string | null;
    status: string | null;
    isPublic: boolean | null;
    step?: string;
    stepAnchor?: string;
  }[];
};

function groupUnknownRows(
  rows: {
    name: string;
    recipe_id: string;
    recipe_title: string;
    author_name?: string | null;
    author_id?: string | null;
    recipe_status?: string | null;
    is_public?: boolean | null;
    step_name?: string | null;
    step_order?: number | null;
  }[],
): UnknownItem[] {
  const map = new Map<string, UnknownItem>();
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    const entry = map.get(key) ?? { name: r.name.trim(), recipes: [] };
    const step = r.step_name ?? undefined;
    const stepAnchor = step != null && r.step_order != null ? `sec-etape-${r.step_order + 1}` : undefined;
    const dedupeKey = `${r.recipe_id}:${step ?? ''}`;
    if (!entry.recipes.some((x) => `${x.id}:${x.step ?? ''}` === dedupeKey)) {
      entry.recipes.push({
        id: r.recipe_id,
        title: r.recipe_title,
        author: r.author_name ?? null,
        authorId: r.author_id ?? null,
        status: r.recipe_status ?? null,
        isPublic: r.is_public ?? null,
        step,
        stepAnchor,
      });
    }
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function getUnknownIngredients(): Promise<UnknownItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_unknown_ingredients' as never);
  if (error) {
    console.error('getUnknownIngredients:', error.message);
    return [];
  }
  return groupUnknownRows(
    (data as unknown as {
      name: string;
      recipe_id: string;
      recipe_title: string;
      step_name: string | null;
      step_order: number | null;
      author_name: string | null;
      author_id: string | null;
      recipe_status: string | null;
      is_public: boolean | null;
    }[]) ?? [],
  );
}

export async function getUnknownUtensils(): Promise<UnknownItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_unknown_utensils' as never);
  if (error) {
    console.error('getUnknownUtensils:', error.message);
    return [];
  }
  return groupUnknownRows(
    (data as unknown as {
      name: string;
      recipe_id: string;
      recipe_title: string;
      author_name: string | null;
      author_id: string | null;
      recipe_status: string | null;
      is_public: boolean | null;
    }[]) ?? [],
  );
}

// ── Ingrédients en volume sans masse volumique de référence ──────────────
// Distinct des « inconnus » ci-dessus : ces ingrédients SONT déjà référencés
// — rapprochés par NOM (pas par `ingredients.ref_id`, qui n'est résolu qu'à
// l'enregistrement de la recette et n'est jamais rattrapé après coup, cf.
// « Ne pas se fier à ref_id IS NULL seul » plus haut) — c'est
// `ingredient_refs.density_g_per_ml` qui manque, colonne utilisée pour
// estimer le poids d'une étape en volume au remplacement par une recette
// (cf. lib/ingredient-conversions.ts `estimateWeightGrams`, CLAUDE.md
// « Fournées »). Réutilise `UnknownItem` / `groupUnknownRows` : même forme
// de ligne (nom, recette, étape), seule la RPC source diffère
// (`admin_volume_ingredients_missing_density`).
//
// Toutes les recettes remontent, brouillon compris (contrairement à un
// premier réglage sur `status = 'published'`) : une fournée peut être
// lancée dès un brouillon, sans attendre la publication — l'écart compte
// dès cet instant. Le statut de chaque recette est affiché en étiquette
// devant son titre (`RecipeStatusBadge`, UnknownItemsManager.tsx) pour
// rester visible malgré ce périmètre élargi. Pas d'action de rattachement
// ici (l'ingrédient est déjà référencé) : la fiche pointe simplement vers
// Admin → Gestion des listes pour renseigner la valeur.
export async function getVolumeIngredientsMissingDensity(): Promise<UnknownItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_volume_ingredients_missing_density' as never);
  if (error) {
    console.error('getVolumeIngredientsMissingDensity:', error.message);
    return [];
  }
  return groupUnknownRows(
    (data as unknown as {
      name: string;
      recipe_id: string;
      recipe_title: string;
      step_name: string | null;
      step_order: number | null;
      author_name: string | null;
      author_id: string | null;
      recipe_status: string | null;
      is_public: boolean | null;
    }[]) ?? [],
  );
}

// Éléments explicitement exclus du rattachement (l'admin ne veut pas les
// ajouter à la référence) — table `admin_ignored_refs`, jamais lue/écrite en
// direct depuis le client : uniquement via ces RPC SECURITY DEFINER, qui
// vérifient elles-mêmes `is_admin_user()` (motif `merge_ideas`).
export type IgnoredRef = { id: number; kind: 'ingredient' | 'utensil'; name: string; createdAt: string; createdByName: string | null };

export async function getIgnoredRefs(): Promise<IgnoredRef[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_list_ignored_refs' as never);
  if (error) {
    console.error('getIgnoredRefs:', error.message);
    return [];
  }
  return (
    (data as unknown as { id: number; kind: string; name: string; created_at: string; created_by_name: string | null }[]) ?? []
  ).map((r) => ({ id: r.id, kind: r.kind as 'ingredient' | 'utensil', name: r.name, createdAt: r.created_at, createdByName: r.created_by_name }));
}
