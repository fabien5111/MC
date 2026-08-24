// Mode projet — lecture des données d'un projet. Server-only (importe
// `next/headers` via lib/supabase/server) : jamais importé par un composant
// client, qui n'y tirerait que le build cassé. Le pendant pur —
// constantes, types et prédicats — est dans lib/projects.ts.
import { createClient } from '@/lib/supabase/server';
import { parseWizardStep, type WizardStep } from '@/lib/projects';
import type { Json } from '@/lib/database.types';

// Un composant tel que l'écran de dialogue en a besoin. `steps` n'est pas la
// liste des étapes mais leur nombre : le parcours guidé n'affiche pas le
// contenu d'un composant, seulement s'il est résolu et ce qu'il pèse.
// Une ligne d'ingrédient d'un composant, telle que l'étape « Quantités » la
// manipule. `baseQuantity` est la valeur figée à la copie : c'est elle que
// multiplie tout ajustement, jamais la quantité affichée — sans quoi deux
// changements de coefficient multiplieraient deux fois. `null` = ligne non
// recalculable (quantité non chiffrée, ou modifiée à la main).
export type ProjectLine = {
  id: number;
  name: string;
  quantity: string | null;
  baseQuantity: number | null;
  unit: string | null;
  scalingMode: string | null;
  stepTitle: string | null;
};

export type ProjectComponent = {
  id: number;
  position: number;
  name: string;
  role: string | null;
  source_kind: string;
  source_recipe_id: string | null;
  source_author_id: string | null;
  source_title: string | null;
  source_author_name: string | null;
  resolved: boolean;
  scaleFactor: number | null;
  scaleReason: string | null;
  manuallyAdjusted: boolean;
  stepCount: number;
  lines: ProjectLine[];
};

export type ProjectFull = {
  id: string;
  title: string;
  // Avancement du mode projet (`wizard` / `ready` / `dissolved`) — à ne pas
  // confondre avec `wizardStep`, qui est l'étape du dialogue.
  stage: string | null;
  intent: string | null;
  wizardStep: WizardStep;
  measure_type: string | null;
  mold_type_id: number | null;
  mold_dims: Json | null;
  servings: number | null;
  yield_qty: string | null;
  yield_desc: string | null;
  components: ProjectComponent[];
};

// Projet complet, ou `null` s'il est introuvable, hors périmètre RLS, ou si
// ce n'est pas un projet. L'appelant (app/projets/[id]/page.tsx) a déjà
// vérifié l'authentification ; la propriété, elle, est tenue par la RLS —
// `recipe_projects` n'est lisible que par le propriétaire de sa recette.
export async function getProjectFull(recipeId: string): Promise<ProjectFull | null> {
  const supabase = await createClient();

  const [recipeRes, projectRes, componentsRes, stepsRes, groupsRes] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, title, kind, project_stage, measure_type, mold_type_id, mold_dims, servings, yield_qty, yield_desc')
      .eq('id', recipeId)
      .maybeSingle(),
    supabase.from('recipe_projects').select('intent, wizard_step').eq('recipe_id', recipeId).maybeSingle(),
    supabase
      .from('recipe_project_components')
      .select(
        'id, position, name, role, source_kind, source_recipe_id, source_author_id, source_title, source_author_name, ' +
          'resolved, scale_factor, scale_reason, manually_adjusted',
      )
      .eq('recipe_id', recipeId)
      .order('position'),
    // Étapes du projet : une seule requête pour tout le projet, recoupée en
    // mémoire. Le dialogue n'affiche pas le déroulé, mais l'étape
    // « Quantités » a besoin de savoir quelle étape porte quels ingrédients —
    // et l'appariement se fait par `order_index` (cf. lib/projects-write.ts).
    supabase.from('recipe_steps').select('id, order_index, title, component_id').eq('recipe_id', recipeId),
    supabase.from('ingredient_groups').select('id, order_index, scaling_mode').eq('recipe_id', recipeId),
  ]);

  if (recipeRes.error) console.error('getProjectFull (recette):', recipeRes.error.message);
  if (projectRes.error) console.error('getProjectFull (projet):', projectRes.error.message);
  if (componentsRes.error) console.error('getProjectFull (composants):', componentsRes.error.message);

  const recipe = recipeRes.data;
  if (!recipe || recipe.kind !== 'project') return null;

  type StepRow = { id: number; order_index: number | null; title: string | null; component_id: number | null };
  type GroupRow = { id: number; order_index: number | null; scaling_mode: string | null };
  const steps = (stepsRes.data ?? []) as StepRow[];
  const groups = (groupsRes.data ?? []) as GroupRow[];

  // Ingrédients des groupes du projet. `base_quantity` est absente de
  // lib/database.types.ts tant que sa migration n'a pas été régénérée
  // (cf. CLAUDE.md) — d'où le typage explicite de la ligne, la colonne
  // existant bien en base. À simplifier une fois les types régénérés.
  type IngRow = {
    id: number;
    group_id: number | null;
    name: string;
    quantity: string | null;
    unit: string | null;
    order_index: number | null;
    base_quantity?: number | null;
  };
  let ingredients: IngRow[] = [];
  if (groups.length) {
    const { data, error } = await supabase
      .from('ingredients')
      .select('*')
      .in('group_id', groups.map((g) => g.id));
    if (error) console.error('getProjectFull (ingrédients):', error.message);
    ingredients = ((data ?? []) as unknown as IngRow[]).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }

  const groupByOrder = new Map<number, GroupRow>();
  groups.forEach((g) => groupByOrder.set(g.order_index ?? -1, g));
  const ingByGroup = new Map<number, IngRow[]>();
  ingredients.forEach((it) => {
    if (it.group_id == null) return;
    const list = ingByGroup.get(it.group_id) ?? [];
    list.push(it);
    ingByGroup.set(it.group_id, list);
  });

  const parStep = new Map<number, number>();
  const parComposant = new Map<number, ProjectLine[]>();
  for (const st of [...steps].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))) {
    if (st.component_id == null) continue;
    parStep.set(st.component_id, (parStep.get(st.component_id) ?? 0) + 1);
    const groupe = groupByOrder.get(st.order_index ?? -1);
    if (!groupe) continue;
    const lignes = parComposant.get(st.component_id) ?? [];
    for (const it of ingByGroup.get(groupe.id) ?? []) {
      lignes.push({
        id: it.id,
        name: it.name,
        quantity: it.quantity,
        baseQuantity: it.base_quantity ?? null,
        unit: it.unit,
        scalingMode: groupe.scaling_mode,
        stepTitle: st.title,
      });
    }
    parComposant.set(st.component_id, lignes);
  }

  type ComponentRow = Omit<ProjectComponent, 'stepCount' | 'lines' | 'scaleFactor' | 'scaleReason' | 'manuallyAdjusted'> & {
    scale_factor: number | null;
    scale_reason: string | null;
    manually_adjusted: boolean;
  };
  const components = ((componentsRes.data ?? []) as unknown as ComponentRow[]).map((c) => ({
    ...c,
    position: Number(c.position),
    scaleFactor: c.scale_factor,
    scaleReason: c.scale_reason,
    manuallyAdjusted: c.manually_adjusted,
    stepCount: parStep.get(c.id) ?? 0,
    lines: parComposant.get(c.id) ?? [],
  }));

  return {
    id: recipe.id,
    title: recipe.title,
    stage: recipe.project_stage,
    intent: projectRes.data?.intent ?? null,
    wizardStep: parseWizardStep(projectRes.data?.wizard_step),
    measure_type: recipe.measure_type,
    mold_type_id: recipe.mold_type_id,
    mold_dims: recipe.mold_dims,
    servings: recipe.servings,
    yield_qty: recipe.yield_qty,
    yield_desc: recipe.yield_desc,
    components,
  };
}
