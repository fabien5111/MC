// Chargeurs de données « exécutions » (sessions de préparation guidées),
// portés de db.js (getExecution, getExecutions, getPastExecutions). Server-side,
// RLS via session. Les mutations (createExecution/updateExecution) se font
// côté client — voir components/recipe/*, app/execution/[id]/*.
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import type { ExecutionSnapshot } from '@/lib/recipe-plan';

export type Execution = Omit<Database['public']['Tables']['executions']['Row'], 'snapshot'> & {
  snapshot: ExecutionSnapshot;
};
export type ExecutionSummary = Pick<Execution, 'id' | 'status' | 'date_debut' | 'date_fin' | 'degustation_at' | 'commentaire_global'>;
export type PastExecution = Pick<Execution, 'id' | 'status' | 'date_debut' | 'date_fin' | 'snapshot'>;

export async function getExecution(id: number): Promise<Execution | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('executions').select('*').eq('id', id).maybeSingle();
  if (error) console.error('getExecution:', error.message);
  return (data as unknown as Execution | null) ?? null;
}

// Historique des sessions d'une entrée de planning (bandeau « Sessions de préparation »).
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

// Exécutions passées avec snapshot (commentaires des sessions précédentes affichés par étape).
export async function getPastExecutions(planningId: number, excludeId?: number): Promise<PastExecution[]> {
  const supabase = await createClient();
  let q = supabase.from('executions').select('id, status, date_debut, date_fin, snapshot').eq('planning_id', planningId).order('date_debut', { ascending: false });
  if (excludeId != null) q = q.neq('id', excludeId);
  const { data, error } = await q;
  if (error) console.error('getPastExecutions:', error.message);
  return (data as unknown as PastExecution[]) ?? [];
}
