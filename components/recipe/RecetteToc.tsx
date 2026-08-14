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
import { RecipeToc, stepAnchorId, type TocSections, type TocStep } from '@/components/recipe/RecipeToc';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { PlanningIcon, DISC } from '@/components/PlanningIcon';

// Même seuil que `SPY_THRESHOLD` dans lib/use-toc.ts : on veut retrouver la
// même étape que celle mise en surbrillance dans le sommaire au moment du
// clic sur « Éditer ».
const SPY_THRESHOLD = 160;

// Étape actuellement franchie (dernière ancre `sec-etape-N` passée sous le
// seuil de lecture), pour rouvrir l'éditeur au même endroit de la recette
// plutôt que toujours en haut du formulaire.
function currentStepIndex(stepCount: number): number | null {
  const limit = window.scrollY + SPY_THRESHOLD;
  let current: number | null = null;
  for (let i = 0; i < stepCount; i++) {
    const el = document.getElementById(stepAnchorId(i));
    if (!el) continue;
    if (el.getBoundingClientRect().top + window.scrollY <= limit) current = i;
  }
  return current;
}

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
    // Repositionne l'éditeur sur l'étape que l'on était en train de consulter,
    // au lieu de toujours le rouvrir en haut du formulaire.
    const stepIndex = currentStepIndex(steps.length);
    const suffix = stepIndex !== null ? `&step=${stepIndex + 1}` : '';
    router.push(`/creer?id=${recipeId}${suffix}`);
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
      // Même picto que la planification ailleurs sur le site (cartes recette,
      // carnet) — pas l'icône Material générique `calendar_today` que
      // portaient les autres entrées de ce rail, pour que ce déclencheur se
      // reconnaisse au premier coup d'œil comme le même geste.
      icon: <PlanningIcon size={20} discFill={DISC.surface} />,
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
      {/* `mobile="drawer"` : sous 700 px le rail disparaît, et avec lui la
          seule voie d'accès à Planifier / Éditer / Dupliquer — `PlanWidget`
          n'a pas de déclencheur propre. Le tiroir reprend les sections *et*
          ces actions. `mobileInset="nav"` pour la barre de navigation basse,
          que la fiche recette monte. */}
      <RecipeToc sections={sections} steps={steps} actions={actions} mobile="drawer" mobileInset="nav" />
      <LoadingOverlay visible={pending !== null} label={pending === 'duplicate' ? 'Duplication de la recette…' : 'Ouverture de l’éditeur…'} />
    </>
  );
}
