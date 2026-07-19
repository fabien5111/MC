// Chargeurs de données admin, typés — portés de db.js (getMolds, getMoldTypes).
import { createClient } from '@/lib/supabase/server';
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
