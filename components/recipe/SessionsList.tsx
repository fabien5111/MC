'use client';

// Historique des sessions de préparation d'un plan (extrait de la fiche
// recette planifiée) : mêmes lignes qu'avant, plus un bouton de suppression
// sur une session `en_cours` — démarrée par erreur, ou devenue obsolète après
// une modification du plan (cf. PlanStepDonePanel / PlanIngredientsEditor,
// qui proposent la même suppression juste après une écriture qui rend une
// session en cours caduque).
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import type { ExecutionSummary } from '@/lib/executions';

const STATUS_LBL: Record<string, { label: string; cls: string }> = {
  en_cours: { label: 'En cours', cls: 'bg-secondary' },
  terminee: { label: 'Terminée', cls: 'bg-green-700' },
  abandonnee: { label: 'Abandonnée', cls: 'bg-error' },
};

export function SessionsList({ execHistory }: { execHistory: ExecutionSummary[] }) {
  const { mutate, busy } = useMutation();
  // `busy` retombe dès l'écriture réseau aboutie, avant que router.refresh()
  // n'ait fini de resynchroniser `execHistory` — état local + filtre au
  // succès pour que la ligne disparaisse en même temps que le spinner (cf.
  // CLAUDE.md « Suppression optimiste dans une liste »).
  const [list, setList] = useState(execHistory);
  useEffect(() => setList(execHistory), [execHistory]);

  async function supprimer(x: ExecutionSummary) {
    const ok = await mutate(() => createClient().from('executions').delete().eq('id', x.id), {
      confirm: 'Supprimer cette session en cours ? Cette action est irréversible.',
      errorLabel: 'Suppression impossible',
    });
    if (ok) setList((prev) => prev.filter((p) => p.id !== x.id));
  }

  if (list.length === 0) return null;

  return (
    <div className="no-print mb-12 border border-outline-variant rounded-xl bg-surface-container-lowest p-6">
      <LoadingOverlay visible={busy} label="Suppression en cours…" />
      <h3 className="font-label-md text-label-md text-primary uppercase tracking-widest mb-3">Sessions de préparation</h3>
      <ul className="flex flex-col">
        {list.map((x) => {
          const st = STATUS_LBL[x.status] || { label: x.status, cls: 'bg-secondary' };
          return (
            <li key={x.id} className="flex items-center gap-3 py-2.5 border-b border-outline-variant/30 last:border-0 flex-wrap">
              <span className={`font-label-md text-[11px] px-2.5 py-0.5 rounded-full text-white ${st.cls}`}>{st.label}</span>
              <span className="font-body-md text-sm flex-1 min-w-[180px]">
                {new Date(x.date_debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
              <Link href={`/execution/${x.id}${x.status !== 'en_cours' ? '?lecture=1' : ''}`} className="font-label-md text-label-md text-primary hover:underline">
                {x.status === 'en_cours' ? 'Reprendre' : 'Voir'}
              </Link>
              {x.status === 'en_cours' && (
                <button type="button" onClick={() => supprimer(x)} title="Supprimer cette session" className="text-error hover:opacity-70">
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
