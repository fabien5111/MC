'use client';

// Modération de la boîte à idées (back-office) : statut + note admin (une
// idée à la fois), fusion manuelle d'un doublon (RPC `merge_ideas` —
// transfère les votes du perdant vers la cible, marque l'idée `merged`),
// suppression, et balayage IA des doublons (`IdeaDuplicateScanner`).
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { formatDate } from '@/lib/format';
import { IDEA_STATUSES, type IdeaStatus } from '@/lib/ideas';
import type { AdminIdeaRow } from '@/lib/admin';
import { IdeaDuplicateScanner } from '@/components/admin/IdeaDuplicateScanner';

const FIELD = 'border border-outline-variant rounded bg-surface-container-lowest px-3 py-2 text-sm focus:outline-none focus:border-primary';

function IdeaRow({
  idea,
  candidates,
  onRemove,
  onMerged,
}: {
  idea: AdminIdeaRow;
  // Cibles de fusion possibles : toutes les autres idées encore ouvertes.
  candidates: AdminIdeaRow[];
  onRemove: (id: string) => void;
  onMerged: (id: string, targetTitle: string) => void;
}) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
  const [status, setStatus] = useState(idea.status);
  const [note, setNote] = useState(idea.admin_note || '');
  const [mergeTarget, setMergeTarget] = useState('');

  async function saveStatus(next: string) {
    setStatus(next);
    await mutate(() => createClient().from('ideas').update({ status: next }).eq('id', idea.id));
  }

  async function saveNote() {
    if (note === (idea.admin_note || '')) return;
    await mutate(() => createClient().from('ideas').update({ admin_note: note || null }).eq('id', idea.id), {
      errorLabel: 'Note non enregistrée',
    });
  }

  async function doMerge() {
    if (!mergeTarget) return;
    const target = candidates.find((c) => c.id === mergeTarget);
    const ok = await mutate(
      () => createClient().rpc('merge_ideas' as never, { source_id: idea.id, target_id: mergeTarget } as never),
      {
        confirm: `Fusionner « ${idea.title} » dans « ${target?.title ?? ''} » ? Ses votes rejoindront la cible, l'idée passera en statut « Fusionnée ». Irréversible.`,
        errorLabel: 'Fusion impossible',
        refresh: false,
      },
    );
    if (ok) onMerged(idea.id, target?.title ?? '');
  }

  async function doDelete() {
    const ok = await mutate(() => createClient().from('ideas').delete().eq('id', idea.id), {
      confirm: `Supprimer définitivement « ${idea.title} » ? Ses votes seront perdus.`,
      errorLabel: 'Suppression impossible',
      refresh: false,
    });
    if (ok) onRemove(idea.id);
  }

  if (idea.status === 'merged') {
    return (
      <div className="border border-outline-variant rounded-xl p-4 bg-surface-container-low opacity-70">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-on-surface-variant truncate">
            <span className="line-through">{idea.title}</span> — fusionnée dans «{' '}
            <span className="font-medium">{idea.merged_into?.title ?? '—'}</span> »
          </p>
          <button
            onClick={doDelete}
            disabled={busy}
            title="Supprimer"
            className="material-symbols-outlined text-[18px] text-error hover:opacity-70 shrink-0"
          >
            delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-outline-variant rounded-xl p-5 bg-surface-container-lowest">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <h3 className="font-headline-md text-base text-on-surface truncate">{idea.title}</h3>
          <p className="text-[12px] text-on-surface-variant mt-0.5">
            {idea.profiles?.full_name || 'Auteur inconnu'} · {formatDate(idea.created_at)} · {idea.votes_count} vote
            {idea.votes_count > 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={doDelete}
          disabled={busy}
          title="Supprimer"
          className="material-symbols-outlined text-[18px] text-error hover:opacity-70 shrink-0"
        >
          delete
        </button>
      </div>

      {idea.description && <p className="text-sm text-on-surface-variant mb-4">{idea.description}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold block mb-1">
            Statut
          </label>
          <select value={status} onChange={(e) => saveStatus(e.target.value)} disabled={busy} className={`${FIELD} w-full`}>
            {(Object.keys(IDEA_STATUSES) as IdeaStatus[])
              .filter((s) => s !== 'merged')
              .map((s) => (
                <option key={s} value={s}>
                  {IDEA_STATUSES[s].label}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold block mb-1">
            Fusionner dans
          </label>
          <div className="flex gap-2">
            <select value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} disabled={busy} className={`${FIELD} flex-1`}>
              <option value="">— choisir une idée —</option>
              {candidates
                .filter((c) => c.id !== idea.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </select>
            <button
              onClick={doMerge}
              disabled={busy || !mergeTarget}
              className="px-3 py-2 rounded border border-outline-variant text-xs font-label-md hover:border-primary hover:text-primary transition-colors disabled:opacity-50 shrink-0"
            >
              Fusionner
            </button>
          </div>
        </div>
      </div>

      <div>
        <label className="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold block mb-1">
          Note admin <span className="normal-case font-normal">(publique — motif d&apos;un refus, par exemple)</span>
        </label>
        <div className="flex gap-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            rows={2}
            disabled={busy}
            className={`${FIELD} flex-1 resize-none`}
          />
        </div>
      </div>
    </div>
  );
}

export function IdeasManager({ ideas }: { ideas: AdminIdeaRow[] }) {
  const [rows, setRows] = useState(ideas);
  useEffect(() => setRows(ideas), [ideas]);

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }
  function markMerged(id: string, targetTitle: string) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'merged', merged_into: { title: targetTitle } } : r)),
    );
  }

  const openCandidates = rows.filter((r) => r.status !== 'merged');

  return (
    <main className="flex-1 p-margin-mobile md:p-margin-desktop space-y-8 max-w-[1000px] w-full">
      <IdeaDuplicateScanner onMerged={markMerged} />

      <section>
        <div className="flex items-baseline gap-3 mb-6">
          <h2 className="font-headline-md text-primary">Idées</h2>
          <span className="font-label-md text-label-md text-on-surface-variant">({rows.length})</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-on-surface-variant italic">Aucune idée pour le moment.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {rows.map((idea) => (
              <IdeaRow key={idea.id} idea={idea} candidates={openCandidates} onRemove={removeRow} onMerged={markMerged} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
