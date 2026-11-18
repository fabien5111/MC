'use client';

// Écran de fin de fournée : remplace la suite de fenêtres de clôture (confirmation,
// bilan, « Fournée validée », tri des retours, verdict de l'essai). Ouvert par la
// barre « Fournée prête à être clôturée » ou par le rail « Marquer comme terminé » ;
// la fournée n'est close qu'au bouton final — fermer l'écran n'écrit rien.
//
// Fournée d'une recette : bilan, case « Fournée validée » (qui déplie le tri des
// retours à garder), puis l'avis, proposé après la clôture (carte `#sec-avis`).
// Essai d'un projet en cours : bilan, verdict de l'essai, retour au projet.
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TriRetours } from '@/components/batch/ValidationFournee';
import { BILAN_MAX, type Remarque } from '@/lib/batch-lecons';
import { phraseAutresValidees } from '@/lib/batch-lecons-client';

export type VerdictEssai = 'to_review' | 'ok' | 'validated';

export type DemandeCloture = {
  bilan: string;
  valide: boolean;
  verdict: VerdictEssai | null;
  retourProjet: boolean;
  donnerAvis: boolean;
};

const VERDICTS: { value: VerdictEssai; label: string }[] = [
  { value: 'to_review', label: 'À revoir' },
  { value: 'ok', label: 'Correct' },
  { value: 'validated', label: 'Validé' },
];

export function EcranFinFournee({
  batchId,
  titre,
  bilanInitial,
  deja,
  essaiProjet,
  avisPossible,
  peutValider,
  propres,
  etapesIncompletes,
  onCloturer,
  onFermer,
}: {
  batchId: number;
  titre: string;
  bilanInitial: string | null;
  // Fournée déjà marquée « validée » (reprise puis reclôturée) : case cochée d'office.
  deja: boolean;
  essaiProjet: boolean;
  avisPossible: boolean;
  // Colonne `refaisable` présente et recette lisible : la case est proposée.
  peutValider: boolean;
  propres: Remarque[];
  // Étapes pas encore cochées (clôture anticipée depuis le rail).
  etapesIncompletes: number;
  onCloturer: (d: DemandeCloture) => Promise<void>;
  onFermer: () => void;
}) {
  const [bilan, setBilan] = useState(bilanInitial ?? '');
  const [valide, setValide] = useState(deja);
  const [verdict, setVerdict] = useState<VerdictEssai | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [phraseDeja, setPhraseDeja] = useState('');
  const [monte, setMonte] = useState(false);

  useEffect(() => setMonte(true), []);
  useEffect(() => {
    if (essaiProjet || !peutValider) return;
    let actif = true;
    phraseAutresValidees(batchId)
      .then((p) => actif && setPhraseDeja(p))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [batchId, essaiProjet, peutValider]);
  // Échap ferme (rien n'est écrit tant qu'on n'a pas terminé).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !envoi && onFermer();
    document.addEventListener('keydown', onKey);
    const avant = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = avant;
    };
  }, [envoi, onFermer]);

  async function terminer(retourProjet: boolean, donnerAvis: boolean) {
    if (envoi) return;
    setEnvoi(true);
    try {
      await onCloturer({ bilan, valide: valide && peutValider && !essaiProjet, verdict, retourProjet, donnerAvis });
    } finally {
      setEnvoi(false);
    }
  }

  if (!monte) return null;
  const btn = 'px-4 py-2.5 rounded-pill font-label-md text-label-md disabled:opacity-50';
  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Fin de la fournée">
      <div className="flex max-h-[100dvh] w-full max-w-2xl flex-col bg-white shadow-xl sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-outline-variant px-5 py-4">
          <div className="min-w-0">
            <p className="font-label-md text-[11px] uppercase tracking-widest text-on-surface-variant">{essaiProjet ? 'Fin de l’essai' : 'Fin de la fournée'}</p>
            <h2 className="truncate font-headline-sm text-primary">{titre}</h2>
          </div>
          <button type="button" onClick={onFermer} disabled={envoi} aria-label="Fermer sans terminer" className="rounded p-1 text-on-surface-variant hover:bg-surface-container">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-6 overflow-y-auto px-5 py-5">
          {etapesIncompletes > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {etapesIncompletes} étape{etapesIncompletes > 1 ? 's ne sont' : ' n’est'} pas encore cochée{etapesIncompletes > 1 ? 's' : ''}. Vous pouvez terminer quand même.
            </p>
          )}

          <section className="flex flex-col gap-2">
            <label htmlFor="fin-bilan" className="font-label-md text-label-md text-on-surface">
              Un commentaire sur cette fournée ?
            </label>
            <p className="text-sm text-on-surface-variant">
              Facultatif : ce que vous changeriez la prochaine fois. Il s’affichera au lancement de votre prochaine fournée de cette recette et reste modifiable depuis le résumé.
            </p>
            <textarea
              id="fin-bilan"
              value={bilan}
              onChange={(e) => setBilan(e.target.value)}
              maxLength={BILAN_MAX}
              rows={4}
              placeholder="Ex. : cuire 3 min de moins, mettre 20 g de sucre en moins…"
              className="w-full rounded-lg border border-outline-variant p-3 text-sm"
            />
          </section>

          {essaiProjet ? (
            <section className="flex flex-col gap-2">
              <p className="font-label-md text-label-md text-on-surface">Comment s’est passé cet essai ?</p>
              <p className="text-sm text-on-surface-variant">Votre appréciation s’affiche dans le bloc « Essais » du projet.</p>
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="Verdict de l’essai">
                {VERDICTS.map((v) => (
                  <button
                    key={v.value}
                    type="button"
                    aria-pressed={verdict === v.value}
                    onClick={() => setVerdict((cur) => (cur === v.value ? null : v.value))}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-label-md ${verdict === v.value ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant text-on-surface hover:border-primary'}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            peutValider && (
              <section className="flex flex-col gap-3">
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input type="checkbox" checked={valide} onChange={(e) => setValide(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
                  <span>
                    <strong>Fournée validée : tout s’est bien passé.</strong> Vous la retrouverez avec un bouton « Refaire » sur la fiche de la recette.
                    {phraseDeja && <span className="mt-1 block text-on-surface-variant">{phraseDeja}</span>}
                  </span>
                </label>
                {valide && (
                  <div className="flex flex-col gap-3 rounded-lg border border-outline-variant p-3">
                    <p className="text-sm text-on-surface-variant">
                      Gardez épinglés les retours à retrouver quand vous <strong>refaites</strong> cette fournée ; désépinglez ceux qui ne servent plus.
                    </p>
                    <TriRetours propres={propres} />
                  </div>
                )}
              </section>
            )
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-outline-variant px-5 py-4 sm:flex-row sm:justify-end" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
          <button type="button" onClick={onFermer} disabled={envoi} className={`${btn} border border-outline-variant text-on-surface`}>
            Pas maintenant
          </button>
          {essaiProjet ? (
            <>
              <button type="button" onClick={() => terminer(false, false)} disabled={envoi} className={`${btn} border border-primary text-primary`}>
                Terminer et rester ici
              </button>
              <button type="button" onClick={() => terminer(true, false)} disabled={envoi} className={`${btn} bg-primary text-on-primary`}>
                Terminer et retourner au projet
              </button>
            </>
          ) : (
            <>
              {avisPossible && (
                <button type="button" onClick={() => terminer(false, true)} disabled={envoi} className={`${btn} border border-primary text-primary`}>
                  Terminer et donner mon avis
                </button>
              )}
              <button type="button" onClick={() => terminer(false, false)} disabled={envoi} className={`${btn} bg-primary text-on-primary`}>
                Terminer la fournée
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
