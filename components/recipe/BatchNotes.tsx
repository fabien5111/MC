'use client';

// Note globale d'une fournée (`batches.user_note`), éditable directement sur
// sa fiche.
//
// Distincte de `batches.notes` — le commentaire saisi dans le dialogue de
// création (BatchWidget), affiché dans le bandeau de la fiche et Profil →
// Fournées. Deux colonnes séparées et non deux surfaces d'édition du même
// champ : modifier l'une ne doit jamais faire apparaître son contenu dans
// l'autre.
//
// Même mise en forme que la note d'étape (BatchStepDonePanel) : les deux sont
// des notes personnelles au même titre, l'une pour toute la fournée, l'autre
// pour une étape précise — une seule convention visuelle pour ne pas les
// faire lire comme deux choses différentes.
//
// C'est une note personnelle : elle ne se confond pas avec les textes de la
// recette (astuces des étapes...), qui restent affichés à leur place et ne
// sont jamais écrasés. Elle s'imprime — on imprime la fiche pour cuisiner —
// seuls les contrôles d'édition sont en `no-print`.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import Link from 'next/link';

export function BatchNotes({
  batchId,
  notes: initialNotes,
  canPersonalNotes = true,
  readOnly = false,
}: {
  batchId: number;
  notes: string | null;
  // Droit d'abonnement (`notes_personnelles`) — même règle que la note
  // d'étape (BatchStepDonePanel) : l'existant reste visible, seule la
  // saisie d'une nouvelle note est bridée (§7.4).
  canPersonalNotes?: boolean;
  // Fournée close ou consultation : la note reste lisible, seul le bouton
  // d'édition disparaît — distinct de `canPersonalNotes`, qui renvoie vers
  // les formules, alors qu'ici il n'y a rien à souscrire.
  readOnly?: boolean;
}) {
  const { mutate, busy } = useMutation();
  const [notes, setNotes] = useState(initialNotes);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialNotes || '');
  // `busy` retombe dès l'écriture réseau, avant que router.refresh() n'ait
  // resynchronisé les props : état local mis à jour au succès de la mutation
  // (cf. CLAUDE.md « Suppression optimiste dans une liste »).
  useEffect(() => setNotes(initialNotes), [initialNotes]);

  async function save() {
    if (readOnly) return;
    const next = draft.trim() || null;
    const ok = await mutate(() => createClient().from('batches').update({ user_note: next } as never).eq('id', batchId), {
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
    <div className="mb-12 border-l-4 border-green-700 bg-surface-container-low pl-4 pr-3 py-3 flex flex-col gap-2">
      <LoadingOverlay visible={busy} label="Enregistrement…" />
      <div className="flex items-center justify-between gap-3">
        <span className="font-label-md text-[10px] uppercase tracking-widest text-secondary">Ma note</span>
        {!editing && canPersonalNotes && !readOnly && (
          <button type="button" onClick={open} title={notes ? 'Modifier ma note' : 'Ajouter une note'} className="no-print text-primary hover:opacity-70">
            <span className="material-symbols-outlined text-[18px]">{notes ? 'edit' : 'add_circle'}</span>
          </button>
        )}
      </div>
      {!canPersonalNotes && !notes && !readOnly ? (
        <p className="no-print font-body-md text-sm italic text-on-surface-variant">
          Non incluses dans votre formule —{' '}
          <Link href="/plans" className="text-primary underline">
            voir les formules
          </Link>
          .
        </p>
      ) : editing ? (
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
