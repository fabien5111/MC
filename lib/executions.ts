// Chargeurs de données « exécutions » (sessions de préparation guidées).
// Server-side, RLS via session. Les mutations se font côté client (écritures
// ciblées par ligne — voir components/execution/ExecutionView.tsx et
// components/recipe/PlanNoticeBanner.tsx pour la création).
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { EXECUTION_FULL_SELECT, type ExecutionFull } from '@/lib/recipe-plan';

export type Execution = ExecutionFull;
export type ExecutionSummary = Pick<Execution, 'id' | 'status' | 'date_debut' | 'date_fin' | 'degustation_at' | 'commentaire_global'>;
export type ActiveExecutionRow = Pick<Execution, 'id' | 'date_debut' | 'degustation_at'> & {
  planning: {
    recipe_title: string | null;
    planned_date: string | null;
    recipes: { hero_image_url: string | null } | null;
  } | null;
  // Avancement constaté de la session, calculé depuis `execution_steps` :
  // nombre d'étapes cochées, total, et titre de la première étape restante.
  //
  // C'est ce qui remplace le décompte « dans 12 min » des maquettes. Le modèle
  // ne porte aucun ancrage horaire par étape (`planning.planned_date` est une
  // date, `plan_steps.day_offset` un nombre de jours, les temps sont des durées
  // sans heure de départ) : un décompte serait une estimation déguisée en
  // horloge, et on cuisine avec. « Étape 2 sur 5 · Crème Chiboust » dit ce que
  // l'on sait, et rien de plus. Le décompte viendra avec l'ancrage horaire.
  progress: { done: number; total: number; currentTitle: string | null };
};

export async function getExecution(id: number): Promise<Execution | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('executions').select(EXECUTION_FULL_SELECT).eq('id', id).maybeSingle();
  if (error) console.error('getExecution:', error.message);
  return (data as unknown as Execution | null) ?? null;
}

// Historique des sessions d'un plan (bandeau « Sessions de préparation »).
export async function getExecutions(planningId: number): Promise<ExecutionSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('executions')
    .select('id, status, date_debut, date_fin, degustation_at, commentaire_global')
    .eq('planning_id', planningId)
    .order('date_debut', { ascending: false });
  if (error) console.error('getExecutions:', error.message);
  return data ?? [];
}

// Sessions en cours de l'utilisateur, tous plans confondus (section « Sessions
// en cours » d'`/en-cuisine`) — `executions.user_id` évite un détour par
// `planning` pour filtrer par propriétaire.
export async function getActiveExecutions(userId: string): Promise<ActiveExecutionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('executions')
    .select('id, date_debut, degustation_at, planning(recipe_title, planned_date, recipes(hero_image_url))')
    .eq('user_id', userId)
    .eq('status', 'en_cours');
  if (error) console.error('getActiveExecutions:', error.message);
  const rows = (data as unknown as Omit<ActiveExecutionRow, 'progress'>[]) ?? [];
  if (rows.length === 0) return [];

  // Avancement : une seule requête pour toutes les sessions en cours, plutôt
  // qu'une par carte.
  const { data: stepRows, error: stepErr } = await supabase
    .from('execution_steps')
    .select('execution_id, titre, done, order_index')
    .in(
      'execution_id',
      rows.map((r) => r.id),
    )
    .order('order_index', { ascending: true });
  if (stepErr) console.error('getActiveExecutions (étapes):', stepErr.message);

  const byExec = new Map<number, { done: number; total: number; currentTitle: string | null }>();
  for (const s of (stepRows as { execution_id: number; titre: string | null; done: boolean }[]) ?? []) {
    const acc = byExec.get(s.execution_id) ?? { done: 0, total: 0, currentTitle: null };
    acc.total += 1;
    if (s.done) acc.done += 1;
    // Première étape non cochée dans l'ordre du déroulé : celle où l'on en est.
    else if (acc.currentTitle === null) acc.currentTitle = s.titre;
    byExec.set(s.execution_id, acc);
  }

  return rows
    .map((r) => ({ ...r, progress: byExec.get(r.id) ?? { done: 0, total: 0, currentTitle: null } }))
    .sort(sortByPlannedDate);
}

// Tri des sessions : par date de dégustation prévue, la plus proche d'abord —
// jamais par heure de démarrage. Ce qui compte quand plusieurs préparations
// tournent (un levain sur trois jours pendant qu'un entremets se monte), c'est
// celle qui arrive à échéance, pas celle qu'on a lancée en dernier.
// Une session sans date planifiée passe en fin de liste, puis on départage par
// date de démarrage pour que l'ordre reste stable d'un rendu à l'autre.
function sortByPlannedDate(a: ActiveExecutionRow, b: ActiveExecutionRow): number {
  const da = a.planning?.planned_date;
  const db = b.planning?.planned_date;
  if (da && db && da !== db) return da < db ? -1 : 1;
  if (da && !db) return -1;
  if (!da && db) return 1;
  return +new Date(a.date_debut) - +new Date(b.date_debut);
}

// Y a-t-il au moins une session en cours ? Sert la pastille d'« En cuisine »
// dans les deux chromes. Volontairement un `count` sans corps de réponse : la
// pastille ne porte aucun chiffre (le compte est donné dans l'écran, pas dans
// le menu), et cette requête est faite sur **chaque page** du site — elle doit
// rester la plus légère possible.
// `cache()` : les deux chromes sont rendus sur la même page (l'en-tête bureau
// et la barre basse coexistent dans le DOM, seul le CSS en masque un). Sans
// mémoïsation par requête, la pastille coûterait deux allers-retours à la base
// sur chaque page du site.
export const hasActiveExecutions = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from('executions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'en_cours');
  if (error) {
    console.error('hasActiveExecutions:', error.message);
    return false;
  }
  return (count ?? 0) > 0;
});

// Étapes des sessions **en cours** d'un plan, indexées par `plan_step_id`.
//
// Sert à répercuter une sous-étape ajoutée après le démarrage d'une session :
// sans ligne `execution_substeps`, la puce n'apparaîtrait pas dans l'écran
// d'exécution et surtout ne pourrait pas être cochée — l'utilisateur ajoute
// pourtant une sous-étape précisément parce qu'il compte la faire.
//
// Ce n'est pas une resynchronisation des colonnes figées (interdite, cf.
// CLAUDE.md : elle détruirait la trace de ce qui a réellement été fait) :
// c'est une insertion, rien n'est écrasé. Réservé aux sessions `en_cours` —
// compléter une session terminée reviendrait à réécrire son histoire.
export type RunningExecStep = { execution_id: number; execution_step_id: number; done?: boolean };

export async function getRunningExecutionSteps(planningId: number): Promise<Record<number, RunningExecStep[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('execution_steps')
    .select('id, plan_step_id, execution_id, executions!inner(id, status, planning_id)')
    .eq('executions.planning_id', planningId)
    .eq('executions.status', 'en_cours')
    .not('plan_step_id', 'is', null);
  if (error) console.error('getRunningExecutionSteps:', error.message);
  const rows = (data as unknown as { id: number; plan_step_id: number; execution_id: number }[]) ?? [];
  const map: Record<number, RunningExecStep[]> = {};
  rows.forEach((r) => {
    (map[r.plan_step_id] = map[r.plan_step_id] || []).push({ execution_id: r.execution_id, execution_step_id: r.id });
  });
  return map;
}

// Même chose que `getRunningExecutionSteps`, mais transverse à tous les plans
// de l'utilisateur (au lieu d'un seul `planning_id`) — pour faire pointer un
// lien depuis la vue par jour du Planning (PlanningDayView) directement vers
// l'étape correspondante dans sa session active, plutôt que vers la fiche
// recette planifiée, quand une session est en cours pour ce plan.
export async function getActiveExecutionStepsForUser(userId: string): Promise<Record<number, RunningExecStep[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('execution_steps')
    .select('id, plan_step_id, execution_id, done, executions!inner(id, status, user_id)')
    .eq('executions.user_id', userId)
    .eq('executions.status', 'en_cours')
    .not('plan_step_id', 'is', null);
  if (error) console.error('getActiveExecutionStepsForUser:', error.message);
  const rows = (data as unknown as { id: number; plan_step_id: number; execution_id: number; done: boolean }[]) ?? [];
  const map: Record<number, RunningExecStep[]> = {};
  rows.forEach((r) => {
    (map[r.plan_step_id] = map[r.plan_step_id] || []).push({ execution_id: r.execution_id, execution_step_id: r.id, done: r.done });
  });
  return map;
}

// Commentaires d'étape laissés lors de précédentes sessions du même plan,
// pour rappel dans l'écran d'exécution en cours (« Sessions précédentes »).
// Clé : `plan_step_id` (stable entre sessions d'un même plan, contrairement
// à l'ancien id de recipe_steps qui changeait à chaque enregistrement de la
// recette par l'auteur).
export async function getPastStepComments(planningId: number, excludeExecutionId: number): Promise<Record<number, { date: string; texte: string }[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('execution_steps')
    .select('plan_step_id, commentaire, executions!inner(id, date_debut, planning_id)')
    .eq('executions.planning_id', planningId)
    .neq('executions.id', excludeExecutionId)
    .not('commentaire', 'is', null)
    .not('plan_step_id', 'is', null);
  if (error) console.error('getPastStepComments:', error.message);
  const rows = (data as unknown as { plan_step_id: number; commentaire: string; executions: { date_debut: string } }[]) ?? [];
  rows.sort((a, b) => +new Date(b.executions.date_debut) - +new Date(a.executions.date_debut));
  const map: Record<number, { date: string; texte: string }[]> = {};
  rows.forEach((r) => {
    (map[r.plan_step_id] = map[r.plan_step_id] || []).push({ date: r.executions.date_debut, texte: r.commentaire });
  });
  return map;
}
