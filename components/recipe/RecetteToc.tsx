'use client';

// Boutons d'action du rail sur la fiche recette : Éditer / Planifier /
// Dupliquer — remontés depuis l'ancienne rangée d'actions sous le titre.
// Doit être monté sous <PlanProvider> (cf. app/recette/[id]/page.tsx) : le
// bouton Planifier partage l'état du panneau via usePlanCtx(), comme
// l'ancien PlanToggleButton qu'il remplace.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { usePlanCtx } from '@/components/recipe/PlanContext';
import { RecipeToc, type TocSections, type TocStep } from '@/components/recipe/RecipeToc';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';

export function RecetteToc({
  recipeId,
  isOwner,
  sections,
  steps,
}: {
  recipeId: string;
  isOwner: boolean;
  sections: TocSections;
  steps: TocStep[];
}) {
  const router = useRouter();
  const dialog = useDialog();
  const { open, editMode, openCreate, close } = usePlanCtx();
  // Distingue Éditer (navigation) de Dupliquer (écriture puis navigation) :
  // chacun a son propre libellé de spinner.
  const [pending, setPending] = useState<'edit' | 'duplicate' | null>(null);

  function edit() {
    if (pending) return;
    setPending('edit');
    router.push(`/creer?id=${recipeId}`);
  }

  async function duplicate() {
    if (pending) return;
    if (!(await dialog.confirm('Dupliquer cette recette ? Une copie en brouillon sera créée.'))) return;
    setPending('duplicate');
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('duplicate_recipe' as never, { p_recipe_id: recipeId } as never);
      if (error) {
        dialog.alert(`Duplication impossible : ${error.message}`);
        setPending(null);
        return;
      }
      // Pas de reset ensuite : on quitte la page, autant garder le spinner
      // affiché jusqu'à la navigation (cf. l'ancien DuplicateButton).
      router.push(`/creer?id=${data as unknown as string}`);
    } catch (e) {
      dialog.alert(`Duplication impossible : ${(e as Error).message || 'erreur inattendue'}`);
      setPending(null);
    }
  }

  const actions = [
    ...(isOwner
      ? [{ id: 'edit', icon: 'edit_note', label: 'Éditer la recette', variant: 'outline' as const, onClick: edit, disabled: pending !== null }]
      : []),
    {
      id: 'plan',
      icon: 'calendar_today',
      label: 'Planifier',
      variant: 'outline' as const,
      onClick: () => (open && !editMode ? close() : openCreate()),
      disabled: pending !== null,
    },
    ...(isOwner
      ? [{ id: 'duplicate', icon: 'content_copy', label: 'Dupliquer la recette', variant: 'outline' as const, onClick: duplicate, disabled: pending !== null }]
      : []),
  ];

  return (
    <>
      <RecipeToc sections={sections} steps={steps} actions={actions} />
      <LoadingOverlay visible={pending !== null} label={pending === 'duplicate' ? 'Duplication de la recette…' : 'Ouverture de l’éditeur…'} />
    </>
  );
}
