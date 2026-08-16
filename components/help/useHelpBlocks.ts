'use client';

// État partagé des blocs d'aide d'une page, quand ils sont dispersés à
// plusieurs endroits du formulaire (motif /creer : un bloc avant le titre,
// un avant la taille, deux dans la première étape…). Un seul état, une seule
// mutation de masquage — sinon « masquer toute l'aide de cette page » ne
// pourrait faire disparaître que le bloc sur lequel on a cliqué.
//
// Le clic sur la croix d'un bloc propose trois portées (motif `Dialog.choice`) :
// ce bloc seul, sa vidéo seule (si présente), ou toute l'aide de la page —
// chacune écrite dans `help_dismissals` (kind = 'block' | 'video' | 'page').
// Retrait optimiste immédiat, sans spinner plein écran : action rare mais pas
// assez lourde pour ça (motif `VoteButton` / `FavoriteHeart`).
import { useCallback, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import type { HelpPageSlug } from '@/lib/help-blocks';
import type { VisibleHelpBlock } from '@/lib/help';

export type HelpBlocksState = {
  get: (key: string) => VisibleHelpBlock | undefined;
  dismiss: (key: string) => void;
  // État initial (déplié/replié) des blocs à l'affichage — pas de sens à le
  // faire varier bloc par bloc, un seul réglage pour toute la page.
  defaultExpanded: boolean;
};

export function useHelpBlocks(
  page: HelpPageSlug,
  initial: VisibleHelpBlock[],
  defaultExpanded: boolean,
): HelpBlocksState {
  const dialog = useDialog();
  const { mutate } = useMutation();
  const [visible, setVisible] = useState(initial);

  const dismiss = useCallback(
    async (key: string) => {
      const block = visible.find((b) => b.key === key);
      if (!block) return;

      const options = [
        { label: 'Masquer ce bloc', value: 'block' },
        ...(block.showVideo ? [{ label: 'Masquer seulement la vidéo', value: 'video' }] : []),
        { label: "Masquer toute l'aide de cette page", value: 'page' },
      ];
      const choice = await dialog.choice('Que souhaitez-vous ne plus afficher ?', options);
      if (!choice) return;

      const ok = await mutate(
        async () => {
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) return null;
          return supabase
            .from('help_dismissals')
            .insert({ user_id: user.id, kind: choice, target: choice === 'page' ? page : key });
        },
        { refresh: false, errorLabel: 'Masquage impossible' },
      );
      if (!ok) return;

      if (choice === 'page') setVisible([]);
      else if (choice === 'block') setVisible((v) => v.filter((b) => b.key !== key));
      else setVisible((v) => v.map((b) => (b.key === key ? { ...b, showVideo: false } : b)));

      await dialog.alert("Vous pourrez le retrouver dans la section d'aide du site.");
    },
    [visible, dialog, mutate, page],
  );

  const get = useCallback((key: string) => visible.find((b) => b.key === key), [visible]);

  return { get, dismiss, defaultExpanded };
}
