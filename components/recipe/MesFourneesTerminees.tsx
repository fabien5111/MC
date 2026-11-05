'use client';

// « Mes fournées terminées » de la fiche recette : historique personnel avec,
// sur chaque fournée, le bouton « Refaire » (reprise à l'identique, cf.
// `useRefaireFournee`) et la pastille « À refaire en l'état » quand le membre
// a marqué la fournée comme réussie. Déplié d'office dès qu'une fournée est
// marquée : c'est la porte d'entrée de « Refaire » depuis la recette.
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { fmtNum, batchFactor } from '@/lib/recipe-plan';
import type { CompletedBatchRow } from '@/lib/profile';
import { useRefaireFournee } from '@/components/batch/RefaireFournee';

export function MesFourneesTerminees({ batches, recipeTitle }: { batches: CompletedBatchRow[]; recipeTitle: string }) {
  const { refaire, element } = useRefaireFournee();
  const nbRefaisables = batches.filter((b) => b.refaisable).length;
  if (!batches.length) return null;
  return (
    <>
      {element}
      <details open={nbRefaisables > 0} className="no-print group border border-outline-variant mb-12">
        <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
          <span className="font-label-md text-label-md text-primary">
            MES FOURNÉES TERMINÉES ({batches.length})
            {nbRefaisables > 0 && (
              <span className="ml-3 normal-case font-normal text-green-700">
                · {nbRefaisables} à refaire en l’état
              </span>
            )}
          </span>
          <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
        </summary>
        <div className="p-4 bg-white">
          <ul className="divide-y divide-outline-variant/30">
            {batches.map((b) => (
              <li key={b.id} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                <Link href={`/fournee/${b.id}?mode=preparer`} className="font-body-md text-body-md text-primary underline underline-offset-2 hover:text-secondary">
                  {formatDate(b.date_fin ?? b.planned_date)}
                </Link>
                <span className="flex items-center gap-3 text-on-surface-variant font-label-md text-label-md flex-wrap">
                  <span className="bg-surface-variant px-2 py-1">× {fmtNum(batchFactor(b))}</span>
                  {b.refaisable && (
                    <span className="inline-flex items-center gap-1 text-green-700">
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      À refaire en l’état
                    </span>
                  )}
                  {b.user_note && <span className="italic">{b.user_note}</span>}
                  <button
                    type="button"
                    onClick={() => refaire({ id: b.id, recipe_title: recipeTitle })}
                    title="Refaire cette fournée à l’identique (mêmes ajustements)"
                    className="inline-flex items-center gap-1 border border-primary text-primary px-3 py-1 hover:bg-primary hover:text-on-primary"
                  >
                    <span className="material-symbols-outlined text-[16px]">replay</span>
                    Refaire
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </details>
    </>
  );
}
