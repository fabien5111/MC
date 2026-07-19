import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { getExecution, getPastExecutions } from '@/lib/executions';
import { ExecutionView } from '@/components/execution/ExecutionView';

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lecture?: string }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const exec = Number.isFinite(Number(id)) ? await getExecution(Number(id)) : null;
  return { title: exec ? `Exécution — ${exec.snapshot.titre} | Maryse-Club` : 'Exécution | Maryse-Club' };
}

export default async function ExecutionPage({ params, searchParams }: Params) {
  const { id } = await params;
  const { lecture } = await searchParams;
  await requireUser(`/execution/${id}`);

  const execId = Number(id);
  const exec = Number.isFinite(execId) ? await getExecution(execId) : null;

  return (
    <>
      <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 sticky top-0 z-50">
        <div className="max-w-[900px] mx-auto flex justify-between items-center px-margin-mobile py-3">
          <Link className="maryse-logo-font text-3xl text-primary leading-none" href="/">
            maryse club
          </Link>
          <Link href="/profil#planning" className="font-label-md text-label-md text-on-surface-variant hover:text-primary flex items-center gap-1">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span> Planning
          </Link>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-margin-mobile py-6 pb-32">
        {!exec ? (
          <p className="text-error">Session introuvable.</p>
        ) : (
          <ExecutionView
            exec={exec}
            prevComments={exec.status === 'en_cours' ? await buildPrevComments(exec.planning_id, exec.id) : {}}
            lecture={lecture === '1'}
          />
        )}
      </main>
    </>
  );
}

async function buildPrevComments(planningId: number, excludeId: number): Promise<Record<number, { date: string; texte: string }[]>> {
  const past = await getPastExecutions(planningId, excludeId);
  const map: Record<number, { date: string; texte: string }[]> = {};
  past.forEach((p) => {
    (p.snapshot?.jalons || []).forEach((j) => {
      (j.etapes || []).forEach((e) => {
        if (e.commentaire) (map[e.id] = map[e.id] || []).push({ date: p.date_debut, texte: e.commentaire });
      });
    });
  });
  return map;
}
