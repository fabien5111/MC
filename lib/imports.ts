// Imports de recettes (brouillons IA) — porté de db.js (getImports). Server-side.
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';

export type ImportRow = {
  id: number;
  source_type: string;
  source_url: string | null;
  statut: string;
  recette: Json;
  alertes: Json;
  created_at: string;
};

export type ImportFull = {
  id: number;
  source_type: string;
  source_url: string | null;
  statut: string;
  recette: Json;
  alertes: Json;
  recipe_id: string | null;
  created_at: string;
};

// Un import complet (relecture). null si introuvable ou hors périmètre RLS.
export async function getImport(id: number): Promise<ImportFull | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('imports').select('*').eq('id', id).maybeSingle();
  if (error) console.error('getImport:', error.message);
  return (data as ImportFull | null) ?? null;
}

// Libellés d'ingrédients de référence (autocomplétion de la relecture).
export async function getIngredientRefNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('ingredient_refs').select('name').order('name');
  return (data ?? []).map((r) => r.name).filter(Boolean);
}

// Mapping nom d'ingrédient de référence (normalisé) → libellé de son allergène.
// Sert à pré-remplir l'allergène dans l'éditeur quand l'ingrédient est choisi
// dans la liste de référence. Toutes les entrées sont incluses (chaîne vide si
// pas d'allergène) pour que le choix d'un ingrédient synchronise toujours le
// champ.
export async function getIngredientRefAllergens(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from('ingredient_refs').select('name, allergens(name)');
  const map: Record<string, string> = {};
  (data as unknown as { name: string | null; allergens: { name: string | null } | null }[] | null)?.forEach((r) => {
    if (r.name) map[r.name.trim().toLowerCase()] = r.allergens?.name || '';
  });
  return map;
}

// Libellés d'allergènes de référence (autocomplétion du champ « Allergène »
// de l'éditeur, lié à la table `allergens`).
export async function getAllergenNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('allergens').select('name').order('name');
  return (data ?? []).map((r) => r.name).filter(Boolean);
}

export async function getImports(userId: string): Promise<ImportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('imports')
    .select('id, source_type, source_url, statut, recette, alertes, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) console.error('getImports:', error.message);
  return (data as unknown as ImportRow[]) ?? [];
}
