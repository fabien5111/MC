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
  // Mode d'ajustement choisi à l'étape 3 (`simple` = volume, `foncage` =
  // surface, `aucun`), `null` = celui de la recette d'origine (JEP-254).
  scalingMode: string | null;
  // Rendement de la recette d'origine, en clair (« Cercle Ø 22 × 4 cm —
  // 8 pers »), lu en direct sur la source : `null` si elle n'existe pas
  // (IA, saisie à la main) ou n'est plus accessible (JEP-254, point 13).
  sourceYield: string | null;
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
  // Description du dessert visé (JEP-254) : saisie à l'étape 2 en format
  // libre, seul format sans moule ni dimensions où s'accrocher. Réutilise
  // `recipes.description`, déjà affichée sur la fiche une fois le projet
  // validé — pas de colonne dédiée.
  description: string | null;
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
      .select(
        'id, title, kind, project_stage, measure_type, mold_type_id, mold_dims, servings, yield_qty, yield_desc, description',
      )
      .eq('id', recipeId)
      .maybeSingle(),
    supabase.from('recipe_projects').select('intent, wizard_step').eq('recipe_id', recipeId).maybeSingle(),
    supabase
      .from('recipe_project_components')
      // `*` et non une liste : `scaling_mode` (JEP-254) arrive par une
      // migration séparée, une liste explicite ferait échouer toute la
      // lecture du projet tant qu'elle n'est pas jouée.
      .select('*')
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

  type ComponentRow = Omit<
    ProjectComponent,
    | 'stepCount'
    | 'lines'
    | 'scaleFactor'
    | 'scaleReason'
    | 'manuallyAdjusted'
    | 'scalingMode'
    | 'sourceYield'
  > & {
    scale_factor: number | null;
    scale_reason: string | null;
    manually_adjusted: boolean;
    scaling_mode?: string | null;
  };
  const rows = (componentsRes.data ?? []) as unknown as ComponentRow[];
  const rendements = await sourceYields(
    supabase,
    rows.map((c) => c.source_recipe_id).filter((id): id is string => !!id),
  );
  const components = rows.map((c) => ({
    id: c.id,
    position: Number(c.position),
    name: c.name,
    role: c.role,
    source_kind: c.source_kind,
    source_recipe_id: c.source_recipe_id,
    source_author_id: c.source_author_id,
    source_title: c.source_title,
    source_author_name: c.source_author_name,
    resolved: c.resolved,
    scaleFactor: c.scale_factor,
    scaleReason: c.scale_reason,
    manuallyAdjusted: c.manually_adjusted,
    scalingMode: c.scaling_mode ?? null,
    sourceYield: c.source_recipe_id ? (rendements.get(c.source_recipe_id) ?? null) : null,
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
    description: recipe.description,
    components,
  };
}

// Rendement des recettes d'origine des composants, en clair. Une seule
// requête pour tout le projet ; une source devenue illisible (supprimée,
// dépubliée) est simplement absente de la table.
async function sourceYields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  const { data, error } = await supabase
    .from('recipes')
    .select('id, measure_type, servings, yield_qty, yield_unit, yield_desc, yield_notes, mold_types(name)')
    .in('id', [...new Set(ids)]);
  if (error) {
    console.error('getProjectFull (rendements):', error.message);
    return out;
  }
  type Row = {
    id: string;
    measure_type: string | null;
    servings: number | null;
    yield_qty: string | null;
    yield_unit: string | null;
    yield_desc: string | null;
    yield_notes: string | null;
    mold_types: { name: string | null } | null;
  };
  for (const r of (data ?? []) as unknown as Row[]) {
    const morceaux: string[] = [];
    if (r.measure_type === 'mold') {
      const moule = [r.mold_types?.name, r.yield_desc].filter(Boolean).join(' ');
      if (moule) morceaux.push(moule);
      if (r.servings) morceaux.push(`${r.servings} pers.`);
    } else if (r.yield_qty) {
      morceaux.push(`${r.yield_qty} ${r.yield_unit ?? ''}`.trim());
    }
    if (r.yield_notes) morceaux.push(r.yield_notes);
    if (morceaux.length) out.set(r.id, morceaux.join(' — '));
  }
  return out;
}

// ── Essais (spec §7) ──────────────────────────────────────────────────────
//
// Un essai n'est pas un objet de plus : **c'est une fournée du projet**. Les
// fournées portent déjà tout ce que la spec demande — les quantités
// réellement utilisées (`batch_ingredients.real_quantity`), les notes du jour
// J (`batches.commentaire_global`), l'état d'avancement et la filiation d'un
// essai au suivant (`batches.source_plan_id`). Une table `recipe_project_trials`
// aurait dupliqué tout cela, et créé une seconde source de vérité sur
// « combien j'ai vraiment mis ». Seul le verdict (`batches.trial_verdict`)
// manquait.

export type TrialLine = {
  id: number;
  name: string;
  unit: string | null;
  // Quantité prévue par la fournée, et quantité réellement utilisée le jour J.
  quantity: number | null;
  quantityText: string | null;
  realQuantity: number | null;
  // Étape de la recette dont cette ligne est issue : c'est par elle que la
  // promotion retrouve l'ingrédient du projet à mettre à jour.
  sourceStepId: number | null;
};

export type ProjectTrial = {
  id: number;
  plannedDate: string | null;
  status: string;
  verdict: string | null;
  note: string | null;
  createdAt: string | null;
  lines: TrialLine[];
};

export async function getProjectTrials(recipeId: string): Promise<ProjectTrial[]> {
  const supabase = await createClient();

  // `trial_verdict` est absente de lib/database.types.ts tant que sa migration
  // n'a pas été régénérée (cf. CLAUDE.md) — d'où le typage explicite, la
  // colonne existant bien en base.
  type BatchRow = {
    id: number;
    planned_date: string | null;
    status: string;
    commentaire_global: string | null;
    created_at: string | null;
    trial_verdict?: string | null;
  };
  const { data, error } = await supabase
    .from('batches')
    .select('*')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getProjectTrials:', error.message);
    return [];
  }
  const batches = (data ?? []) as unknown as BatchRow[];
  if (!batches.length) return [];

  const ids = batches.map((b) => b.id);
  const [ingRes, stepRes] = await Promise.all([
    supabase
      .from('batch_ingredients')
      .select('id, batch_id, batch_step_id, name, unit, quantity, quantity_text, real_quantity')
      .in('batch_id', ids)
      .order('order_index'),
    supabase.from('batch_steps').select('id, source_step_id').in('batch_id', ids),
  ]);
  if (ingRes.error) console.error('getProjectTrials (ingrédients):', ingRes.error.message);
  if (stepRes.error) console.error('getProjectTrials (étapes):', stepRes.error.message);

  const sourceParStep = new Map<number, number | null>();
  for (const st of (stepRes.data ?? []) as { id: number; source_step_id: number | null }[]) {
    sourceParStep.set(st.id, st.source_step_id);
  }

  const parBatch = new Map<number, TrialLine[]>();
  for (const it of (ingRes.data ?? []) as {
    id: number;
    batch_id: number;
    batch_step_id: number | null;
    name: string;
    unit: string | null;
    quantity: number | null;
    quantity_text: string | null;
    real_quantity: number | null;
  }[]) {
    const list = parBatch.get(it.batch_id) ?? [];
    list.push({
      id: it.id,
      name: it.name,
      unit: it.unit,
      quantity: it.quantity,
      quantityText: it.quantity_text,
      realQuantity: it.real_quantity,
      sourceStepId: it.batch_step_id != null ? (sourceParStep.get(it.batch_step_id) ?? null) : null,
    });
    parBatch.set(it.batch_id, list);
  }

  return batches.map((b) => ({
    id: b.id,
    plannedDate: b.planned_date,
    status: b.status,
    verdict: b.trial_verdict ?? null,
    note: b.commentaire_global,
    createdAt: b.created_at,
    lines: parBatch.get(b.id) ?? [],
  }));
}

// ── Marquage sur la fiche recette (spec §8.4, §9) ─────────────────────────
//
// Réduit à ce que la fiche affiche : crédits et rôle, jamais l'avancement du
// dialogue (`recipe_projects` reste hors de cette lecture). RLS : lecture
// publique quand la recette est publiée, propriétaire sinon — la policy
// `recipe_project_components_credits_publics` fait tout le travail, cette
// fonction ne fait qu'une lecture simple.
export type ProjectCredit = {
  name: string;
  role: string | null;
  sourceRecipeId: string | null;
  sourceTitle: string | null;
  sourceAuthorName: string | null;
};

export async function getProjectCredits(recipeId: string): Promise<ProjectCredit[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipe_project_components')
    .select('position, name, role, source_recipe_id, source_title, source_author_name')
    .eq('recipe_id', recipeId)
    .order('position');
  if (error) {
    console.error('getProjectCredits:', error.message);
    return [];
  }
  return (data ?? []).map((c) => ({
    name: c.name,
    role: c.role,
    sourceRecipeId: c.source_recipe_id,
    sourceTitle: c.source_title,
    sourceAuthorName: c.source_author_name,
  }));
}
