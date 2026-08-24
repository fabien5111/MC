'use client';

// Marquage d'une recette issue du mode projet, sur sa propre fiche (spec
// §8.4) : discret, sans hiérarchiser les recettes entre elles — un badge et
// une liste de crédits, pas un habillage différent du reste de la fiche.
//
// Affiché pour TOUTE recette `kind = 'project'`, quel que soit son
// `project_stage` (`ready` ou `dissolved`) : le marquage et les crédits
// survivent à la dissolution (spec §9, CLAUDE.md « Dissolution assumée dans
// /creer »). Seule la réversibilité (repasser en brouillon) est réservée à
// `ready` — un projet dissous n'a plus de dialogue où retourner.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import type { ProjectCredit } from '@/lib/projects-data';

export function ProjectMarking({
  recipeId,
  stage,
  isOwner,
  isPublished,
  credits,
}: {
  recipeId: string;
  stage: string | null;
  isOwner: boolean;
  isPublished: boolean;
  credits: ProjectCredit[];
}) {
  const router = useRouter();
  const { mutate, busy } = useMutation();
  const [ouvert, setOuvert] = useState(false);

  // Réversibilité (spec §8.5) : possible tant que la recette n'a pas été
  // publiée publiquement, et seulement depuis l'état `ready` — un projet déjà
  // dissous par l'éditeur classique n'a plus de composants à retrouver dans
  // le dialogue.
  async function revenirAuBrouillon() {
    const ok = await mutate(
      () => createClient().from('recipes').update({ project_stage: 'wizard' } as never).eq('id', recipeId),
      {
        confirm: 'Repasser ce projet en brouillon ? Vous reviendrez au parcours guidé.',
        errorLabel: 'Passage en brouillon',
        refresh: false,
      },
    );
    if (ok) router.push(`/projets/${recipeId}`);
  }

  return (
    <div className="no-print mb-8 rounded-xl border border-outline-variant bg-surface-container-low px-5 py-3">
      <LoadingOverlay visible={busy} />
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="material-symbols-outlined text-[18px] text-on-surface-variant">account_tree</span>
        <span className="font-body-md text-[13px] text-on-surface-variant">
          Recette composée à partir de plusieurs recettes de base
          {stage === 'dissolved' ? ' (composants dissous depuis)' : ''}
        </span>
        <span className="material-symbols-outlined ml-auto text-[18px] text-on-surface-variant">
          {ouvert ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {ouvert && (
        <div className="mt-3 border-t border-outline-variant pt-3">
          {credits.length > 0 && (
            <ul className="mb-3 space-y-1">
              {credits.map((c, i) => (
                <li key={i} className="text-[13px] text-on-surface">
                  <span className="font-semibold">{c.name}</span>
                  {c.role ? ` (${c.role})` : ''}
                  {c.sourceTitle && (
                    <>
                      {' — '}
                      {/* Lien inactif (recette source supprimée ou
                          dépubliée) : le nom de l'auteur reste affiché quand
                          même (§9). `sourceRecipeId` non nul suffit pour
                          tenter le lien — la RLS décide s'il mène quelque
                          part. */}
                      {c.sourceRecipeId ? (
                        <a href={`/recette/${c.sourceRecipeId}`} className="text-primary hover:underline">
                          {c.sourceTitle}
                        </a>
                      ) : (
                        c.sourceTitle
                      )}
                      {c.sourceAuthorName ? ` (${c.sourceAuthorName})` : ''}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isOwner && stage === 'ready' && !isPublished && (
            <button
              type="button"
              onClick={() => void revenirAuBrouillon()}
              className="font-label-md text-[12px] font-semibold text-primary hover:underline"
            >
              Repasser en brouillon
            </button>
          )}
          {isOwner && stage === 'ready' && isPublished && (
            <p className="text-[11.5px] text-outline">
              Publiée : ce projet ne peut plus être repassé en brouillon.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
