'use client';

// Note « points à vérifier » d'une étape du projet (JEP-403) : ce qu'il faudra
// contrôler à la prochaine fournée d'essai (« la ganache a-t-elle tranché ? »).
// Visible dans le projet seulement, jamais sur la fiche recette ; rappelée
// dans le « Reste à faire » tant qu'elle n'est pas effacée.
//
// Enregistrée à la sortie du champ, par le `mutate` du parent (voile et
// resynchronisation). Colonne `recipe_steps.points_a_verifier` posée à la
// main : sans elle (`disponible` faux), rien n'est affiché.
import { useState } from 'react';
import { NOTE_VERIF_MAX } from '@/lib/projects';
import { autoGrow } from '@/lib/auto-grow';

export function PointsAVerifier({
  valeur,
  onSave,
  busy,
}: {
  valeur: string | null;
  onSave: (texte: string | null) => Promise<boolean>;
  busy: boolean;
}) {
  const [ouvert, setOuvert] = useState(!!valeur);
  const [texte, setTexte] = useState(valeur ?? '');

  if (!ouvert) {
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
      className={`no-print rounded-lg border px-3 py-2 ${valeur ? 'border-amber-600/60 bg-amber-50' : 'border-outline-variant bg-surface-container-lowest'}`}
    >
      <label className="mb-1 flex items-center gap-1.5 font-label-md text-[12px] uppercase tracking-widest text-amber-800">
        <span className="material-symbols-outlined text-[18px]">flag</span>
        Points à vérifier
      </label>
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
        placeholder="Ce qu’il faudra contrôler à la prochaine fournée d’essai…"
        className="w-full resize-none overflow-hidden bg-transparent font-body-md text-[15px] outline-none"
      />
      <p className="text-[11.5px] text-on-surface-variant">
        Rappelé dans « Reste à faire » ; effacez le texte quand c’est vérifié.
      </p>
    </div>
  );
}
