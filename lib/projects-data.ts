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
  stepCount: number;
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
  components: ProjectComponent[];
};

// Projet complet, ou `null` s'il est introuvable, hors périmètre RLS, ou si
// ce n'est pas un projet. L'appelant (app/projets/[id]/page.tsx) a déjà
// vérifié l'authentification ; la propriété, elle, est tenue par la RLS —
// `recipe_projects` n'est lisible que par le propriétaire de sa recette.
export async function getProjectFull(recipeId: string): Promise<ProjectFull | null> {
  const supabase = await createClient();

  const [recipeRes, projectRes, componentsRes, stepsRes] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, title, kind, project_stage, measure_type, mold_type_id, mold_dims, servings, yield_qty')
      .eq('id', recipeId)
      .maybeSingle(),
    supabase.from('recipe_projects').select('intent, wizard_step').eq('recipe_id', recipeId).maybeSingle(),
    supabase
      .from('recipe_project_components')
      .select(
        'id, position, name, role, source_kind, source_recipe_id, source_author_id, source_title, source_author_name, resolved',
      )
      .eq('recipe_id', recipeId)
      .order('position'),
    // Compte des étapes par composant : une seule requête pour tout le
    // projet, recoupée en mémoire. Les étapes elles-mêmes ne sont pas
    // chargées ici — le dialogue n'en montre pas le contenu.
    supabase.from('recipe_steps').select('component_id').eq('recipe_id', recipeId),
  ]);

  if (recipeRes.error) console.error('getProjectFull (recette):', recipeRes.error.message);
  if (projectRes.error) console.error('getProjectFull (projet):', projectRes.error.message);
  if (componentsRes.error) console.error('getProjectFull (composants):', componentsRes.error.message);

  const recipe = recipeRes.data;
  if (!recipe || recipe.kind !== 'project') return null;

  const parStep = new Map<number, number>();
  for (const s of (stepsRes.data ?? []) as { component_id: number | null }[]) {
    if (s.component_id == null) continue;
    parStep.set(s.component_id, (parStep.get(s.component_id) ?? 0) + 1);
  }

  const components = ((componentsRes.data ?? []) as Omit<ProjectComponent, 'stepCount'>[]).map((c) => ({
    ...c,
    position: Number(c.position),
    stepCount: parStep.get(c.id) ?? 0,
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
    components,
  };
}
