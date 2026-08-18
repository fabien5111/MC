// Ancienne URL d'une session de préparation, conservée en redirection le
// temps que les liens et favoris existants se vident — voir CLAUDE.md
// « Fournées ». `executions` a été renommée `executions_legacy` par la
// fusion plan + session : l'identifiant reçu ici n'est pas celui d'une
// fournée, il faut d'abord retrouver la fournée dont elle provenait.
import { redirect, notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ id: string }> };

export default async function ExecutionRedirectPage({ params }: Params) {
  const { id } = await params;
  await requireUser(`/execution/${id}`);

  const execId = Number(id);
  if (!Number.isFinite(execId)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from('executions_legacy').select('planning_id').eq('id', execId).maybeSingle();
  if (!data?.planning_id) notFound();

  redirect(`/fournee/${data.planning_id}`);
}
