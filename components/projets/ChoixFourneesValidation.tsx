'use client';

// Fenêtre « Quelles fournées envoyer dans la recette ? » (JEP-430), ouverte par
// « Valider le projet » quand le projet a des fournées d'essai.
//
// Chaque essai est proposé avec une case : cochée, la fournée perd sa marque
// d'essai (`batches.essai_projet`) et devient une fournée ordinaire de la
// recette (« Mes fournées terminées », avis, retours) ; décochée, elle reste un
// essai, visible seulement sur la page du projet. Cases pré-cochées :
// `selectionInitialeEssais` (lib/projects.ts). Portée dans `document.body` : le
// conteneur flouté de la page piégerait un `fixed` dans son propre repère.

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDate } from '@/lib/format';
import { selectionInitialeEssais } from '@/lib/projects';
import type { ProjectTrial } from '@/lib/projects-data';
import { useVoile } from '@/lib/use-voile';

const VERDICT: Record<string, string> = { to_review: 'À revoir', ok: 'Correcte', validated: 'Validée' };
const STATUT: Record<string, string> = { terminee: 'Terminée', abandonnee: 'Abandonnée', planifiee: 'En cours' };

export default function ChoixFourneesValidation({
  essais,
  onConfirm,
  onCancel,
}: {
  essais: ProjectTrial[];
  onConfirm: (retenues: number[]) => void;
  onCancel: () => void;
}) {
  const [cochees, setCochees] = useState<Set<number>>(() => new Set(selectionInitialeEssais(essais)));
  const voile = useVoile(onCancel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (typeof document === 'undefined') return null;

  const basculer = (id: number) =>
    setCochees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Valider le projet"
      className="fixed inset-0 z-[115] flex items-center justify-center bg-background/40 px-6 backdrop-blur-[2px]"
      {...voile}
    >
      <div className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-xl border border-outline-variant bg-surface-container-low p-6 shadow-lg">
        <p className="font-headline-md text-[20px] text-primary">Valider le projet</p>
        <p className="mt-2 font-body-md text-[14px] text-on-surface">
          Le projet devient une recette de votre carnet (non publiée). Il reste visible dans « Projets », avec
          l’étiquette « Projet validé ».
        </p>
        <p className="mt-4 font-label-md text-[14px] text-on-surface">Quelles fournées voulez-vous envoyer dans la recette ?</p>
        <p className="mt-1 text-[12.5px] text-on-surface-variant">
          Cochées, elles apparaîtront sur la fiche comme des fournées classiques (avec leurs retours). Les autres
          restent des essais, consultables sur la page du projet.
        </p>
        <ul className="mt-3 space-y-1">
          {essais.map((t) => (
            <li key={t.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-surface-container">
                <input type="checkbox" checked={cochees.has(t.id)} onChange={() => basculer(t.id)} className="accent-primary" />
                <span className="min-w-0 flex-1 text-on-surface">
                  Fournée du {t.plannedDate ? formatDate(t.plannedDate) : '—'}
                  <span className="text-on-surface-variant"> · {STATUT[t.status] ?? t.status}</span>
                </span>
                {t.verdict && VERDICT[t.verdict] && (
                  <span className="shrink-0 text-[12px] text-on-surface-variant">{VERDICT[t.verdict]}</span>
                )}
              </label>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            autoFocus
            className="rounded-pill border border-outline-variant px-4 py-2 font-label-md text-[12.5px] font-semibold text-primary transition-colors hover:bg-surface-container"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm([...cochees])}
            className="rounded-pill bg-primary px-5 py-2.5 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95"
          >
            Valider le projet
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
