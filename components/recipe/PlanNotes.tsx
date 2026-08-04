'use client';

// Note globale d'une recette planifiée (`planning.notes`).
//
// La colonne existait déjà — affichée dans Profil → Planning — mais jamais
// éditable directement sur la fiche de la recette planifiée, là où elle est
// justement utile. Ce bloc l'affiche et permet de la modifier sans passer
// par le dialogue de planification (PlanWidget), qui n'a plus son propre
// champ « Commentaire » : une seule surface d'édition pour cette note, sinon
// la fiche recette reprendrait silencieusement un texte saisi ailleurs.
//
// Même mise en forme que la note d'étape (PlanStepDonePanel) : les deux sont
// des notes personnelles au même titre, l'une pour toute la planification,
// l'autre pour une étape précise — une seule convention visuelle pour ne pas
// les faire lire comme deux choses différentes.
//
// C'est une note personnelle : elle ne se confond pas avec les textes de la
// recette (`recipes.notes`, astuces des étapes), qui restent affichés à leur
// place et ne sont jamais écrasés. Elle s'imprime — on imprime la fiche pour
// cuisiner — seuls les contrôles d'édition sont en `no-print`.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';

export function PlanNotes({ planId, notes: initialNotes }: { planId: number; notes: string | null }) {
  const { mutate, busy } = useMutation();
  const [notes, setNotes] = useState(initialNotes);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNotes || '');
  // `busy` retombe dès l'écriture réseau, avant que router.refresh() n'ait
  // resynchronisé les props : état local mis à jour au succès de la mutation
  // (cf. CLAUDE.md « Suppression optimiste dans une liste »).
  useEffect(() => setNotes(initialNotes), [initialNotes]);

  async function save() {
    const next = draft.trim() || null;
    const ok = await mutate(() => createClient().from('planning').update({ notes: next }).eq('id', planId), {
      errorLabel: 'Note non enregistrée',
    });
    if (ok) {
      setNotes(next);
      setEditing(false);
    }
  }

  function open() {
    setDraft(notes || '');
    setEditing(true);
  }

  return (
    <div className="mb-12 border-l-4 border-secondary bg-surface-container-low pl-4 pr-3 py-3 flex flex-col gap-2">
      <LoadingOverlay visible={busy} label="Enregistrement…" />
      <div className="flex items-center justify-between gap-3">
        <span className="font-label-md text-[10px] uppercase tracking-widest text-secondary">Ma note</span>
        {!editing && (
          <button type="button" onClick={open} title={notes ? 'Modifier ma note' : 'Ajouter une note'} className="no-print text-primary hover:opacity-70">
            <span className="material-symbols-outlined text-[18px]">{notes ? 'edit' : 'add_circle'}</span>
          </button>
        )}
      </div>
      {editing ? (
        <div className="no-print flex flex-col gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoFocus
            placeholder="Ce que je veux retenir pour cette fois-ci : matériel à sortir, adaptation, invités…"
            className="border border-outline-variant rounded px-3 py-2 font-body-md text-sm w-full bg-white"
          />
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} className="bg-primary text-white font-label-md text-label-md px-4 py-2 rounded hover:opacity-90">
              Enregistrer
            </button>
            <button type="button" onClick={() => setEditing(false)} className="font-label-md text-label-md text-on-surface-variant hover:text-primary">
              Annuler
            </button>
          </div>
        </div>
      ) : notes ? (
        <p className="font-body-md text-body-md whitespace-pre-line text-on-surface">{notes}</p>
      ) : (
        <p className="no-print font-body-md text-sm italic text-on-surface-variant">Aucune note.</p>
      )}
    </div>
  );
}
