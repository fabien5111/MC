// Écriture d'une fournée matérialisée.
//
// Extrait de `components/recipe/BatchWidget.tsx`, où ces deux fonctions
// vivaient : le mode projet lance lui aussi des fournées (fournées d'essai,
// spec §7) et doit passer par le MÊME moteur — « un projet est une recette »
// perdrait tout son sens si la fournée d'un projet était insérée autrement
// que celle d'une recette ordinaire.
import type { createClient } from '@/lib/supabase/client';
import { materializeBatch } from '@/lib/recipe-plan';
import type { RecipeFull } from '@/lib/recipes';

type Supabase = ReturnType<typeof createClient>;

// Insère le contenu matérialisé (étapes → sous-étapes/ingrédients, puis
// ustensiles) sous une ligne `batches` déjà créée. Séquentiel : chaque
// batch_step doit exister avant d'insérer ses batch_substeps/batch_ingredients
// (FK batch_step_id), donc pas de simple insert() en lot pour les étapes.
export async function insertMaterializedBatch(
  supabase: Supabase,
  batchId: number,
  recipe: RecipeFull,
  factor: number,
  moldCoefs: { surface: number; volume: number } | null,
) {
  const mat = materializeBatch(recipe, { factor, moldCoefs });
  for (const step of mat.steps) {
    const { data: stepRow, error: stepErr } = await supabase
      .from('batch_steps')
      .insert({
        batch_id: batchId,
        order_index: step.order_index,
        day_offset: step.day_offset,
        base_day_offset: step.base_day_offset,
        title: step.title,
        description: step.description,
        tips: step.tips,
        video_url: step.video_url,
        prep_time: step.prep_time,
        cook_time: step.cook_time,
        wait_time: step.wait_time,
        cook_temp: step.cook_temp,
        scaling_mode: step.scaling_mode,
        source_recipe_id: recipe.id,
        source_step_id: step.source_step_id,
      })
      .select('id')
      .single();
    if (stepErr || !stepRow) throw stepErr || new Error('Étape non créée');
    if (step.substeps.length) {
      const { error } = await supabase.from('batch_substeps').insert(step.substeps.map((texte, i) => ({ batch_step_id: stepRow.id, order_index: i, texte })));
      if (error) throw error;
    }
    if (step.ingredients.length) {
      const { error } = await supabase.from('batch_ingredients').insert(
        step.ingredients.map((it) => ({
          batch_id: batchId,
          batch_step_id: stepRow.id,
          order_index: it.order_index,
          ref_id: it.ref_id,
          name: it.name,
          base_quantity: it.base_quantity,
          quantity: it.quantity,
          quantity_text: it.quantity_text,
          unit: it.unit,
          comment: it.comment,
          url: it.url,
          allergen: it.allergen,
          source_recipe_id: recipe.id,
        })),
      );
      if (error) throw error;
    }
  }
  if (mat.utensils.length) {
    const { error } = await supabase
      .from('batch_utensils')
      .insert(mat.utensils.map((u) => ({ batch_id: batchId, order_index: u.order_index, name: u.name, comment: u.comment, url: u.url, source_recipe_id: recipe.id })));
    if (error) throw error;
  }
}

// Contenu texte de la recette, copié une fois pour toutes sur la fournée
// (décision « tout sauf les images ») : la fournée reste lisible même si la
// recette de base est ensuite dépubliée ou supprimée.
export function recipeContentColumns(recipe: RecipeFull) {
  return {
    recipe_description: recipe.description,
    recipe_tips: recipe.tips,
    recipe_serving_advice: recipe.serving_advice,
    measure_type: recipe.measure_type,
    yield_qty: recipe.yield_qty,
    yield_unit: recipe.yield_unit,
    yield_desc: recipe.yield_desc,
    yield_notes: recipe.yield_notes,
    recipe_source: recipe.source,
    recipe_source_url: recipe.source_url,
    recipe_video_url: recipe.video_url,
    difficulty_name: recipe.difficulties?.name ?? null,
    difficulty_level: recipe.difficulties?.level ?? null,
    mold_type_name: recipe.mold_types?.name ?? null,
    mold_forme: recipe.mold_types?.forme ?? null,
    mold_dims: recipe.mold_dims,
    tags_text: recipe.recipe_tags.map((t) => t.tags?.name).filter((n): n is string => !!n),
  };
}
