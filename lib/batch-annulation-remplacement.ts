// Annulation du remplacement d'un ingrédient de fournée par une recette —
// partagée par le bloc « Ingrédients de l'étape » (BatchStepIngredients) et la
// « Liste totale des ingrédients » (BatchView), pour qu'un seul code défasse un
// remplacement.
//
// Les étapes insérées (et tout ce qu'elles portent) sont retirées, puis la
// ligne d'ingrédient reprend sa place — elle n'a jamais été modifiée
// entre-temps, seulement marquée.
//
// Toutes les occurrences du même remplacement (JEP-254) : annuler depuis
// N'IMPORTE LAQUELLE retire les étapes insérées ET rétablit TOUTES les
// occurrences d'un coup — sinon les autres resteraient marquées « fabriquées »
// alors que les étapes qui les fabriquent auraient disparu.
//
// Les ustensiles venus de la sous-recette ne sont retirés que s'ils ne
// servent plus : `batch_utensils` ne porte pas de lien vers la ligne
// remplacée (une seule colonne `source_recipe_id`), donc un second éclatement
// de la même recette ailleurs dans la fournée doit les conserver. Et jamais
// quand la sous-recette est la recette de la fournée elle-même : on
// supprimerait ses propres ustensiles.
import { createClient } from '@/lib/supabase/client';
import { expandedGroupAnyUnit, type BatchFull, type BatchIngredientRow } from '@/lib/recipe-plan';

export function annulationRemplacement(batch: BatchFull, row: BatchIngredientRow) {
  const subRecipeId = row.expanded_into_recipe_id;
  const group = expandedGroupAnyUnit(batch, row);
  const groupIds = group.map((it) => it.id);
  const stepIds = batch.batch_steps.filter((s) => s.source_ingredient_id != null && groupIds.includes(s.source_ingredient_id)).map((s) => s.id);
  const stillUsed = batch.batch_ingredients.some((it) => !groupIds.includes(it.id) && it.expanded_into_recipe_id === subRecipeId);
  const dropUtensils = !!subRecipeId && !stillUsed && subRecipeId !== batch.recipe_id;

  async function ecrire() {
    const supabase = createClient();
    // Le contenu des étapes et les ustensiles ne dépendent pas les uns des
    // autres : une seule salve. Seule la suppression des étapes doit attendre
    // (leurs lignes filles d'abord), et le démarquage de l'ingrédient vient en
    // dernier — si une suppression échoue, la ligne reste marquée
    // « remplacée », donc cohérente avec ce qui subsiste dans le déroulé, et
    // l'annulation reste rejouable.
    if (stepIds.length || dropUtensils) {
      const results = await Promise.all([
        ...(stepIds.length
          ? [supabase.from('batch_ingredients').delete().in('batch_step_id', stepIds), supabase.from('batch_substeps').delete().in('batch_step_id', stepIds)]
          : []),
        ...(dropUtensils ? [supabase.from('batch_utensils').delete().eq('batch_id', batch.id).eq('source_recipe_id', subRecipeId!)] : []),
      ]);
      const failed = results.find((r) => r.error);
      if (failed) return failed;
    }
    if (stepIds.length) {
      const steps = await supabase.from('batch_steps').delete().in('id', stepIds);
      if (steps.error) return steps;
    }
    return supabase.from('batch_ingredients').update({ expanded_into_recipe_id: null }).in('id', groupIds);
  }

  const confirm =
    `Annuler le remplacement de « ${row.name} » ?\n\n` +
    (group.length > 1 ? `${group.length} étapes utilisent cet ingrédient, toutes seront rétablies. ` : '') +
    (stepIds.length ? `${stepIds.length} étape${stepIds.length > 1 ? 's' : ''} seront retirées du déroulé. ` : '') +
    "L'ingrédient revient dans la liste de courses et la mise en place.";

  return { ecrire, confirm };
}
