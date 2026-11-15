'use client';

// Clôture d'une fournée d'ESSAI d'un projet en cours (JEP-403), partagée par
// le mode Pâtisser (`BatchView.finishBatch`) et la vue « Par jour »
// (`PlanningDayView.proposeFinish`). Ni « Fournée validée » ni avis (la
// recette n'existe pas encore) : le verdict de l'essai, celui du bloc
// « Essais » du projet (`batches.trial_verdict`), puis la proposition de
// retourner au projet pour ajuster la recette d'après l'essai.
//
// Rend `true` si le membre a choisi de retourner au projet (l'appelant
// navigue), `false` sinon.
import { useCallback } from 'react';
import { useDialog } from '@/components/Dialog';
import { createClient } from '@/lib/supabase/client';

export function useClotureEssai() {
  const dialog = useDialog();
  return useCallback(
    async (batchId: number): Promise<boolean> => {
      const verdict = await dialog.choice(
        'Comment s’est passé cet essai ? Votre appréciation s’affiche dans le bloc « Essais » du projet.',
        [
          { label: 'À revoir', value: 'to_review' },
          { label: 'Correct', value: 'ok' },
          { label: 'Validé', value: 'validated', variant: 'primary' },
        ],
      );
      if (verdict) {
        const { error } = await createClient()
          .from('batches')
          .update({ trial_verdict: verdict } as never)
          .eq('id', batchId);
        if (error) await dialog.alert('L’appréciation n’a pas pu être enregistrée : ' + error.message);
      }
      const suite = await dialog.choice('Fournée d’essai terminée. Retourner au projet pour ajuster la recette ?', [
        { label: 'Rester ici', value: 'rester' },
        { label: 'Retourner au projet', value: 'projet', variant: 'primary' },
      ]);
      return suite === 'projet';
    },
    [dialog],
  );
}
