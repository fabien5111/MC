// Chargeurs de données admin, typés — portés de db.js (getMolds, getMoldTypes).
import { createClient } from '@/lib/supabase/server';
import { TAUX_EUR_AFFICHE } from '@/lib/ai/cost';
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

export async function getPendingComments(): Promise<PendingComment[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('comments')
    .select('*, profiles(full_name), recipes(title)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  return (data as unknown as PendingComment[]) ?? [];
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
};

export async function getAllowlistMembers(): Promise<Member[]> {
  const supabase = await createClient();
  const [{ data: profiles }, { data: allowlist }, { data: recipes }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, provider, status, role, plan, is_demo, notes, created_at')
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
    }));

  return [...registered, ...pending];
}

// ── Listes / taxonomies (CRUD générique) ─────────────────────
export async function getListEntries(table: string, orderBy = 'name'): Promise<Record<string, unknown>[]> {
  const supabase = await createClient();
  try {
    // Table dynamique : hors du typage statique, cast local assumé.
    const { data, error } = await (supabase.from(table as never) as ReturnType<typeof supabase.from>)
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
  // Colonnes de coût hors typage généré tant que `npm run gen:types` n'a pas
  // été rejoué après la migration → client non typé pour cette lecture.
  const table = supabase.from('imports' as never) as ReturnType<typeof supabase.from>;
  const { data, error } = await table
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
