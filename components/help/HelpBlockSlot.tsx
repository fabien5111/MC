'use client';

// Emplacement d'un bloc d'aide précis dans une page (motif : plusieurs blocs
// dispersés dans le formulaire /creer, partageant un même useHelpBlocks).
// Ne rend rien si le bloc n'a pas de contenu ou a été masqué.
import { HelpBlock } from './HelpBlock';
import type { HelpBlocksState } from './useHelpBlocks';

export function HelpBlockSlot({ blockKey, help }: { blockKey: string; help: HelpBlocksState }) {
  const block = help.get(blockKey);
  if (!block) return null;
  return (
    <div className="mb-8">
      <HelpBlock block={block} onDismiss={() => help.dismiss(blockKey)} defaultExpanded={help.defaultExpanded} />
    </div>
  );
}
