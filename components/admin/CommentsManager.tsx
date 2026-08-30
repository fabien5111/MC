'use client';

// Modération des avis (Admin → Commentaires) — cf. CLAUDE.md « Avis sur une
// recette ». Écran dédié, comme `RecipesManager` pour les recettes : trois
// files (à valider / refusés / publiés) plutôt qu'une seule liste, parce
// qu'un refus doit rester consultable après coup — c'est lui qui a été
// renvoyé à l'auteur sur sa fournée, et l'admin doit pouvoir le rattraper.
//
// Les écritures partent du navigateur (RLS : `is_admin_user()`), contrairement
// au dépôt de l'avis lui-même, qui passe par une route serveur — un membre
// ordinaire n'a aucune policy d'écriture sur `comments`.
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { StepPhotoGallery } from '@/components/recipe/StepPhotoGallery';
import { formatDate } from '@/lib/format';
import type { AdminComment } from '@/lib/admin';

type File = 'pending' | 'rejected' | 'approved';

const FILE_LBL: Record<File, string> = {
  pending: 'À valider',
  rejected: 'Refusés',
  approved: 'Publiés',
};

// Score IA (0-100) : probabilité que le texte soit injurieux ou inapproprié.
// Indicatif — il ne fait que trier la file, la décision reste humaine.
function ScoreIA({ score, reason }: { score?: number | null; reason?: string | null }) {
  if (score == null) return <span className="text-on-surface-variant">—</span>;
  const cls =
    score >= 85
      ? 'bg-error-container text-on-error-container'
      : score >= 51
        ? 'bg-tertiary-container text-on-tertiary-container'
        : 'bg-surface-container-highest text-on-surface-variant';
  return (
    <span title={reason || undefined} className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${cls}`}>
      {score}%
    </span>
  );
}

function Stars({ value }: { value?: number | null }) {
  if (!value) return <span className="text-on-surface-variant">—</span>;
  return (
    <span className="whitespace-nowrap font-label-md text-label-md text-primary">
      {value}/5
      <span className="material-symbols-outlined text-[14px] align-text-bottom ml-0.5 text-tertiary" style={{ fontVariationSettings: "'FILL' 1" }}>
        star
      </span>
    </span>
  );
}

export function CommentsManager({ comments }: { comments: AdminComment[] }) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
  const [file, setFile] = useState<File>('pending');
  const sb = () => createClient();

  const files: Record<File, AdminComment[]> = {
    pending: comments.filter((c) => (c.status ?? 'pending') === 'pending'),
    // `spam` rejoint les refusés : même issue côté membre (avis non publié),
    // seul le geste de l'admin diffère (avec ou sans motif à saisir).
    rejected: comments.filter((c) => c.status === 'rejected' || c.status === 'spam'),
    approved: comments.filter((c) => c.status === 'approved'),
  };

  function setStatus(id: number, status: string, rejectionReason?: string | null) {
    // `rejection_reason` absente de lib/database.types.ts tant que la
    // migration n'a pas été régénérée (npm run gen:types) — même situation
    // que `moderation_note` sur les recettes (cf. RecipesManager).
    const payload: Record<string, unknown> = { status };
    if (rejectionReason !== undefined) payload.rejection_reason = rejectionReason;
    mutate(() => sb().from('comments').update(payload as never).eq('id', id));
  }

  async function refuser(id: number) {
    // Le motif n'est pas décoratif : le trigger SQL `comments_sync_batch_review`
    // le renvoie sur la fournée d'origine, où l'auteur le lit et peut
    // corriger son avis. Même geste que « Rejeter avec motif » des recettes.
    const motif = await dialog.prompt('Motif du refus (transmis à l’auteur sur sa fournée) :', {
      required: true,
      placeholder: 'Ex. : commentaire hors sujet, ton agressif envers l’auteur…',
    });
    if (motif !== null) setStatus(id, 'rejected', motif.trim());
  }

  const rows = files[file];

  return (
    <main className="flex-1 overflow-y-auto p-gutter lg:px-margin-desktop lg:py-12 bg-surface">
      <LoadingOverlay visible={busy} label="Enregistrement…" />

      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {(Object.keys(FILE_LBL) as File[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFile(f)}
            className={`rounded-full border px-4 py-2 font-label-md text-label-md transition-colors ${
              file === f
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline-variant text-on-surface-variant hover:text-primary'
            }`}
          >
            {FILE_LBL[f]} ({files[f].length})
          </button>
        ))}
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[860px]">
          <thead className="bg-surface-container font-label-md text-on-surface-variant border-b border-outline-variant">
            <tr>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Recette</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Membre</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Note</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Commentaire</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Score IA</th>
              <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant font-body-md text-on-surface">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-on-surface-variant">
                  Aucun avis dans cette file.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="hover:bg-surface-container-low transition-colors align-top">
                  <td className="px-6 py-5 font-medium text-primary">
                    {c.recipe_id ? (
                      <Link href={`/recette/${c.recipe_id}#sec-commentaires`} className="hover:underline">
                        {c.recipes?.title || '—'}
                      </Link>
                    ) : (
                      c.recipes?.title || '—'
                    )}
                    {c.created_at && (
                      <span className="block text-[11px] text-on-surface-variant font-normal mt-0.5">
                        {formatDate(c.created_at)}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-secondary-container text-[10px] flex items-center justify-center font-bold shrink-0">
                        {(c.profiles?.full_name || 'U').charAt(0)}
                      </span>
                      <span className="text-sm">{c.profiles?.full_name || '—'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <Stars value={c.rating} />
                  </td>
                  <td className="px-6 py-5 max-w-md">
                    {c.content ? (
                      <p className="text-sm text-on-surface whitespace-pre-line">{c.content}</p>
                    ) : (
                      <span className="text-on-surface-variant italic text-sm">Note seule, sans commentaire.</span>
                    )}
                    {c.status === 'rejected' && c.rejection_reason && (
                      <p className="mt-2 text-[12px] text-error">
                        <span className="font-semibold">Motif du refus :</span> {c.rejection_reason}
                      </p>
                    )}
                    {c.status === 'spam' && <p className="mt-2 text-[12px] text-error font-semibold">Marqué comme spam.</p>}
                    {c.photo_urls && c.photo_urls.length > 0 && (
                      <div className="w-24 mt-2">
                        <StepPhotoGallery photos={c.photo_urls} compact />
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-5">
                    <ScoreIA score={c.ai_score} reason={c.ai_reason} />
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex justify-end gap-2 flex-wrap">
                      {c.status !== 'approved' && (
                        <button
                          onClick={() => setStatus(c.id, 'approved', null)}
                          className="px-3 py-1.5 rounded bg-primary text-on-primary text-xs font-label-md hover:opacity-90 transition-opacity"
                        >
                          {file === 'pending' ? 'Approuver' : 'Publier'}
                        </button>
                      )}
                      {c.status !== 'rejected' && c.status !== 'spam' && (
                        <button
                          onClick={() => refuser(c.id)}
                          className="px-3 py-1.5 rounded border border-error text-error text-xs font-label-md hover:bg-error-container transition-colors"
                        >
                          {file === 'approved' ? 'Retirer' : 'Refuser'}
                        </button>
                      )}
                      {file === 'pending' && (
                        <button
                          onClick={() => setStatus(c.id, 'spam')}
                          className="px-3 py-1.5 rounded border border-outline text-xs font-label-md hover:bg-surface-container transition-colors"
                        >
                          Spam
                        </button>
                      )}
                      <button
                        onClick={() =>
                          mutate(() => sb().from('comments').delete().eq('id', c.id), {
                            confirm: 'Supprimer définitivement cet avis ?',
                          })
                        }
                        className="px-3 py-1.5 rounded border border-outline-variant text-on-surface-variant text-xs font-label-md hover:text-error hover:border-error transition-colors"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
