'use client';

// Note globale d'une recette planifiée (`planning.notes`).
//
// La colonne existait déjà — saisissable dans le dialogue de planification
// (PlanWidget) et affichée dans Profil → Planning — mais jamais sur la fiche
// de la recette planifiée, là où elle est justement utile. Ce bloc l'affiche
// et permet de la modifier sans rouvrir le dialogue.
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
    <div className="mb-12 border border-outline-variant rounded-xl bg-surface-container-lowest p-6">
      <LoadingOverlay visible={busy} label="Enregistrement…" />
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="font-label-md text-label-md text-primary uppercase tracking-widest">Ma note</h3>
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
            className="border border-outline-variant rounded px-3 py-2 font-body-md text-body-md w-full"
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
        <p className="no-print font-body-md text-body-md italic text-on-surface-variant">Aucune note pour cette planification.</p>
      )}
    </div>
  );
}
