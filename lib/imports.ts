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
  // Repère de la rétention (§ 7.9) : c'est `updated_at`, pas `created_at`,
  // qui date l'échéance affichée — cf. lib/imports-retention.ts.
  updated_at: string;
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

// Référentiels d'autocomplétion de l'éditeur (ingrédients, allergènes,
// ustensiles) : servis par le cache de `lib/data/reference.ts`, ré-exportés
// ici pour ne pas toucher les sites d'appel.
export {
  getIngredientRefNames,
  getIngredientRefAllergens,
  getAllergenRefs,
  getUtensilRefNames,
} from '@/lib/data/reference';

// Imports pas encore relus, pour le renvoi affiché en tête du carnet.
//
// Un import n'est pas encore une recette : tant qu'il n'est pas relu, il vit
// dans `imports` et n'a aucune ligne dans `recipes`. Le carnet ne peut donc pas
// l'afficher dans sa grille — il le signale et renvoie vers `/importer`, qui
// reste le tunnel d'entrée. C'est aussi ce qui évite de faire croire qu'une
// recette existe alors qu'elle n'a pas encore été vérifiée.
//
// Le filtre porte sur `statut = 'brouillon'`, pas sur `recipe_id IS NULL` :
// `recipe_id` repasse à `null` (`imports_recipe_id_fkey`, `ON DELETE SET
// NULL`) si la recette créée par la relecture est supprimée par la suite,
// alors que l'import lui-même reste `verifiee` — il a bien été relu, la
// suppression de la recette est un événement distinct. Compter sur
// `recipe_id` gonflait donc le bandeau d'un import déjà relu dont la recette
// avait été retirée du carnet, en désaccord avec le badge de `/importer`
// (`ImporterList`), qui n'affiche « Brouillon » que pour ce même statut.
export async function countImportsEnAttente(userId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('imports')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('statut', 'brouillon');
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
    .select('id, source_type, source_url, fichier_original, statut, recette, alertes, recipe_id, cost_usd, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) console.error('getImports:', error.message);
  return (data as unknown as ImportRow[]) ?? [];
}
