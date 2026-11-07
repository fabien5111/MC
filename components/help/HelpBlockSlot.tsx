'use client';

// Emplacement d'un bloc d'aide précis dans une page (motif : plusieurs pictos
// dispersés dans le formulaire /creer, partageant un même useHelpBlocks).
// Ne rend rien si le bloc n'a pas de contenu. À poser DANS la ligne du titre ou
// du libellé qu'il explique (JEP-391) : sans marge propre, jamais entre deux
// blocs.
import { HelpBlock } from './HelpBlock';
import type { HelpBlocksState } from './useHelpBlocks';

export function HelpBlockSlot({ blockKey, help, className }: { blockKey: string; help: HelpBlocksState; className?: string }) {
  const block = help.get(blockKey);
  if (!block) return null;
  return (
    <span className={`inline-flex shrink-0 ${className ?? ''}`}>
      <HelpBlock block={block} />
    </span>
  );
}
