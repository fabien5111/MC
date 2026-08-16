'use client';

// Liste des blocs d'aide visibles d'une page, avec masquage par membre.
//
// Le clic sur la croix d'un bloc propose trois portées (motif `Dialog.choice`) :
// ce bloc seul, sa vidéo seule (si présente), ou toute l'aide de la page —
// chacune écrite dans `help_dismissals` (kind = 'block' | 'video' | 'page').
// Retrait optimiste immédiat, sans spinner plein écran : action rare mais pas
// assez lourde pour ça (motif `VoteButton` / `FavoriteHeart`).
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import type { HelpPageSlug } from '@/lib/help-blocks';
import type { VisibleHelpBlock } from '@/lib/help';
import { HelpBlock } from './HelpBlock';

export function HelpBlockList({ page, blocks }: { page: HelpPageSlug; blocks: VisibleHelpBlock[] }) {
  const dialog = useDialog();
  const { mutate } = useMutation();
  const [visible, setVisible] = useState(blocks);

  if (visible.length === 0) return null;

  async function dismiss(block: VisibleHelpBlock) {
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
          .insert({ user_id: user.id, kind: choice, target: choice === 'page' ? page : block.key });
      },
      { refresh: false, errorLabel: 'Masquage impossible' },
    );
    if (!ok) return;

    if (choice === 'page') setVisible([]);
    else if (choice === 'block') setVisible((v) => v.filter((b) => b.key !== block.key));
    else setVisible((v) => v.map((b) => (b.key === block.key ? { ...b, showVideo: false } : b)));

    await dialog.alert("Vous pourrez le retrouver dans la section d'aide du site.");
  }

  return (
    <div className="space-y-4 mb-8">
      {visible.map((block) => (
        <HelpBlock key={block.key} block={block} onDismiss={() => dismiss(block)} />
      ))}
    </div>
  );
}
