'use client';

// Note « points à vérifier » d'une étape du projet (JEP-403) : ce qu'il faudra
// contrôler à la prochaine fournée d'essai (« la ganache a-t-elle tranché ? »).
// Visible dans le projet seulement, jamais sur la fiche recette ; rappelée
// dans le « Reste à faire » tant qu'elle n'est pas effacée.
//
// Enregistrée à la sortie du champ, par le `mutate` du parent (voile et
// resynchronisation). Colonne `recipe_steps.points_a_verifier` posée à la
// main : sans elle (`disponible` faux), rien n'est affiché.
import { useState, type ReactNode } from 'react';
import { useLecons } from '@/components/batch/DerniereFois';
import { NOTE_VERIF_MAX } from '@/lib/projects';
import { autoGrow } from '@/lib/auto-grow';

// « À vérifier sur cette étape » : un seul cadre pour ce qu'il reste à contrôler
// sur l'étape — la note du membre (éditable, comptée dans « Reste à faire ») et,
// dessous, les retours de ses fournées d'essai (`retours`, lecture seule, épingle
// et ajustement). Deux sources distinctes, seul l'habillage est commun : effacer
// la note ne touche pas aux retours, et les retours ne sont jamais des « points
// restants ». Le cadre s'affiche dès que l'étape a des retours, même sans note.
export function PointsAVerifier({
  valeur,
  onSave,
  busy,
  stepId,
  retours,
}: {
  valeur: string | null;
  onSave: (texte: string | null) => Promise<boolean>;
  busy: boolean;
  stepId: number;
  retours?: ReactNode;
}) {
  const v = useLecons();
  const aDesRetours = !!retours && (v?.lecons.parEtape[stepId]?.remarques ?? []).some((r) => r.nature === 'etape');
  const [ouvert, setOuvert] = useState(!!valeur);
  const [texte, setTexte] = useState(valeur ?? '');

  if (!ouvert && !aDesRetours) {
    return (
      <button
        type="button"
        onClick={() => setOuvert(true)}
        disabled={busy}
        className="no-print flex items-center gap-1.5 self-start text-[13px] text-secondary hover:text-primary disabled:opacity-40"
      >
        <span className="material-symbols-outlined text-[18px]">flag</span>
        Ajouter un point à vérifier
      </button>
    );
  }

  const enregistrer = async () => {
    const net = texte.trim().slice(0, NOTE_VERIF_MAX);
    if (net === (valeur ?? '').trim()) {
      if (!net) setOuvert(false);
      return;
    }
    const ok = await onSave(net || null);
    if (ok && !net) setOuvert(false);
  };

  return (
    <div
      className={`no-print flex flex-col gap-2 rounded-lg border px-3 py-2 ${valeur || aDesRetours ? 'border-amber-600/60 bg-amber-50' : 'border-outline-variant bg-surface-container-lowest'}`}
    >
      <p className="flex items-center gap-1.5 font-label-md text-[12px] uppercase tracking-widest text-amber-800">
        <span className="material-symbols-outlined text-[18px]">flag</span>
        À vérifier sur cette étape
      </p>
      {ouvert ? (
        <div>
          {aDesRetours && <p className="mb-0.5 font-label-md text-[12px] font-bold text-on-surface-variant">Ma note</p>}
          <textarea
            ref={autoGrow}
            value={texte}
            onChange={(e) => {
              setTexte(e.target.value.slice(0, NOTE_VERIF_MAX));
              autoGrow(e.target);
            }}
            onBlur={() => void enregistrer()}
            disabled={busy}
            rows={2}
            aria-label="Points à vérifier"
            placeholder="Ce qu’il faudra contrôler à la prochaine fournée d’essai…"
            className="w-full resize-none overflow-hidden bg-transparent font-body-md text-[15px] outline-none"
          />
          <p className="text-[11.5px] text-on-surface-variant">
            Rappelé dans « Reste à faire » ; effacez le texte quand c’est vérifié.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOuvert(true)}
          disabled={busy}
          className="flex items-center gap-1.5 self-start text-[13px] text-secondary hover:text-primary disabled:opacity-40"
        >
          <span className="material-symbols-outlined text-[18px]">add</span>
          Ajouter un point à vérifier
        </button>
      )}
      {aDesRetours && <div className="border-t border-amber-600/30 pt-2">{retours}</div>}
    </div>
  );
}
