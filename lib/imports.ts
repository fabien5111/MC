// Imports de recettes (brouillons IA) — porté de db.js (getImports). Server-side.
import { createClient } from '@/lib/supabase/server';
import type { Json } from '@/lib/database.types';

export type ImportRow = {
  id: number;
  source_type: string;
  source_url: string | null;
  fichier_original: string | null;
  statut: string;
  recette: Json;
  alertes: Json;
  recipe_id: string | null;
  cost_usd: number | null;
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
  const { data } = await supabase.from('ingredient_refs').select('name, allergen');
  const map: Record<string, string> = {};
  data?.forEach((r) => {
    if (r.name) map[r.name.trim().toLowerCase()] = r.allergen || '';
  });
  return map;
}

// Allergènes de référence (id + libellé) : autocomplétion du champ « Allergène »
// de l'éditeur et liaison de l'allergène lors de l'ajout d'un ingrédient au
// référentiel (table `allergens`).
export async function getAllergenRefs(): Promise<{ id: number; name: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('allergens').select('id, name').order('name');
  return (data ?? []).filter((a) => a.name).map((a) => ({ id: a.id, name: a.name }));
}

// Libellés d'ustensiles de référence (autocomplétion de l'éditeur).
export async function getUtensilRefNames(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('utensils').select('name').order('name');
  return (data ?? []).map((r) => r.name).filter(Boolean);
}

// Imports pas encore relus, pour le renvoi affiché en tête du carnet.
//
// Un import n'est pas encore une recette : tant qu'il n'est pas relu, il vit
// dans `imports` et n'a aucune ligne dans `recipes`. Le carnet ne peut donc pas
// l'afficher dans sa grille — il le signale et renvoie vers `/importer`, qui
// reste le tunnel d'entrée. C'est aussi ce qui évite de faire croire qu'une
// recette existe alors qu'elle n'a pas encore été vérifiée.
export async function countImportsEnAttente(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('imports')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('recipe_id', null);
  if (error) {
    console.error('countImportsEnAttente:', error.message);
    return 0;
  }
  return count ?? 0;
}

export async function getImports(userId: string): Promise<ImportRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('imports')
    .select('id, source_type, source_url, fichier_original, statut, recette, alertes, recipe_id, cost_usd, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) console.error('getImports:', error.message);
  return (data as unknown as ImportRow[]) ?? [];
}
