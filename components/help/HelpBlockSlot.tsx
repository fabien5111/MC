'use client';

// Emplacement d'un bloc d'aide précis dans une page (motif : plusieurs pictos
// dispersés dans le formulaire /creer, partageant un même useHelpBlocks).
// Ne rend rien si le bloc n'a pas de contenu.
import { HelpBlock } from './HelpBlock';
import type { HelpBlocksState } from './useHelpBlocks';

export function HelpBlockSlot({ blockKey, help, className = 'mb-4' }: { blockKey: string; help: HelpBlocksState; className?: string }) {
  const block = help.get(blockKey);
  if (!block) return null;
  return (
    <div className={className}>
      <HelpBlock block={block} />
    </div>
  );
}
