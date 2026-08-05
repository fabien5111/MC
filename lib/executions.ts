// Chargeurs de données « exécutions » (sessions de préparation guidées).
// Server-side, RLS via session. Les mutations se font côté client (écritures
// ciblées par ligne — voir components/execution/ExecutionView.tsx et
// components/recipe/PlanNoticeBanner.tsx pour la création).
import { createClient } from '@/lib/supabase/server';
import { EXECUTION_FULL_SELECT, type ExecutionFull } from '@/lib/recipe-plan';

export type Execution = ExecutionFull;
export type ExecutionSummary = Pick<Execution, 'id' | 'status' | 'date_debut' | 'date_fin' | 'degustation_at' | 'commentaire_global'>;
export type ActiveExecutionRow = Pick<Execution, 'id' | 'date_debut' | 'degustation_at'> & {
  planning: { recipe_title: string | null } | null;
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

// Sessions en cours de l'utilisateur, tous plans confondus (onglet « Sessions
// actives » du profil) — `executions.user_id` évite un détour par `planning`
// pour filtrer par propriétaire.
export async function getActiveExecutions(userId: string): Promise<ActiveExecutionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('executions')
    .select('id, date_debut, degustation_at, planning(recipe_title)')
    .eq('user_id', userId)
    .eq('status', 'en_cours')
    .order('date_debut', { ascending: false });
  if (error) console.error('getActiveExecutions:', error.message);
  return (data as unknown as ActiveExecutionRow[]) ?? [];
}

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
export type RunningExecStep = { execution_id: number; execution_step_id: number };

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
    .select('id, plan_step_id, execution_id, executions!inner(id, status, user_id)')
    .eq('executions.user_id', userId)
    .eq('executions.status', 'en_cours')
    .not('plan_step_id', 'is', null);
  if (error) console.error('getActiveExecutionStepsForUser:', error.message);
  const rows = (data as unknown as { id: number; plan_step_id: number; execution_id: number }[]) ?? [];
  const map: Record<number, RunningExecStep[]> = {};
  rows.forEach((r) => {
    (map[r.plan_step_id] = map[r.plan_step_id] || []).push({ execution_id: r.execution_id, execution_step_id: r.id });
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
