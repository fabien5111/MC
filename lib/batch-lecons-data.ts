// Lecture de la fournée de référence (« La dernière fois », JEP-381).
// Logique pure : `lib/batch-lecons.ts`.
//
// Sous la session du membre : la RLS (`owns_plan()`) ne laisse lire que ses
// propres fournées, aucune autre ne peut remonter ici.
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { lireLecon, type FourneeReference, type RefIngredient, type RefStep } from '@/lib/batch-lecons';

// `*` sur `batches` (et non une liste de colonnes) : `lecon` est posée à la
// main (DDL par psql) — la nommer ferait échouer la lecture avant la
// migration. Même doctrine que `adjust_ai`.
const REFERENCE_SELECT = `
  *,
  batch_steps(id, source_step_id, title, order_index, commentaire, batch_substeps(texte, commentaire, order_index)),
  batch_ingredients(batch_step_id, name, unit, quantity, real_quantity, commentaire, order_index)
`;

type Brut = {
  id: number;
  date_fin: string | null;
  planned_date: string | null;
  commentaire_global: string | null;
  batch_steps: RefStep[] | null;
  batch_ingredients: RefIngredient[] | null;
};

function versReference(row: Brut): FourneeReference {
  return {
    id: row.id,
    date: row.date_fin ?? row.planned_date,
    commentaire_global: row.commentaire_global,
    lecon: lireLecon(row),
    batch_steps: (row.batch_steps ?? []).map((s) => ({ ...s, batch_substeps: s.batch_substeps ?? [] })),
    batch_ingredients: row.batch_ingredients ?? [],
  };
}

// Fournée de référence :
//   • la fournée source (`source_plan_id`, « Refaire ») si elle est lisible ;
//   • sinon la plus récente fournée `terminee` du membre sur la même recette,
//     hors la fournée courante.
// `null` sans référence ou en cas d'échec (best-effort : la fournée s'affiche
// toujours, seules les leçons manquent).
export async function getFourneeReference(opts: {
  userId: string;
  recipeId: string | null;
  excludeId?: number | null;
  sourcePlanId?: number | null;
}): Promise<FourneeReference | null> {
  const supabase = await createClient();
  if (opts.sourcePlanId != null) {
    const { data, error } = await supabase.from('batches').select(REFERENCE_SELECT).eq('id', opts.sourcePlanId).maybeSingle();
    if (error) console.error('getFourneeReference (source):', error.message);
    if (data) return versReference(data as unknown as Brut);
  }
  if (!opts.recipeId) return null;
  let q = supabase
    .from('batches')
    .select(REFERENCE_SELECT)
    .eq('user_id', opts.userId)
    .eq('recipe_id', opts.recipeId)
    .eq('status', 'terminee');
  if (opts.excludeId != null) q = q.neq('id', opts.excludeId);
  const { data, error } = await q
    .order('date_fin', { ascending: false, nullsFirst: false })
    .order('planned_date', { ascending: false, nullsFirst: false })
    .limit(1);
  if (error) {
    console.error('getFourneeReference:', error.message);
    return null;
  }
  const row = (data as unknown as Brut[] | null)?.[0];
  return row ? versReference(row) : null;
}
