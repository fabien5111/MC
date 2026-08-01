// Chargeurs de données « exécutions » (sessions de préparation guidées).
// Server-side, RLS via session. Les mutations se font côté client (écritures
// ciblées par ligne — voir components/execution/ExecutionView.tsx et
// components/recipe/PlanNoticeBanner.tsx pour la création).
import { createClient } from '@/lib/supabase/server';
import { EXECUTION_FULL_SELECT, type ExecutionFull } from '@/lib/recipe-plan';

export type Execution = ExecutionFull;
export type ExecutionSummary = Pick<Execution, 'id' | 'status' | 'date_debut' | 'date_fin' | 'degustation_at' | 'commentaire_global'>;

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
