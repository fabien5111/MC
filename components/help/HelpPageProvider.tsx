'use client';

// État d'aide partagé par plusieurs emplacements d'une page SERVEUR (JEP-373).
// Un seul `useHelpBlocks` pour toute la page : « masquer toute l'aide de cette
// page » fait disparaître tous ses emplacements d'un coup, ce que des
// `HelpSlotClient` indépendants ne sauraient pas faire. La page englobe ce qui
// doit contenir des emplacements et y glisse des `<HelpPageSlot>`.
import { createContext, useContext, type ReactNode } from 'react';
import { HelpBlockSlot } from './HelpBlockSlot';
import { useHelpBlocks, type HelpBlocksState } from './useHelpBlocks';
import type { HelpPageSlug } from '@/lib/help-blocks';
import type { VisibleHelpBlock } from '@/lib/help';

const HelpCtx = createContext<HelpBlocksState | null>(null);

export function HelpPageProvider({
  page,
  blocks,
  children,
}: {
  page: HelpPageSlug;
  blocks: VisibleHelpBlock[];
  children: ReactNode;
}) {
  const help = useHelpBlocks(page, blocks, true);
  return <HelpCtx.Provider value={help}>{children}</HelpCtx.Provider>;
}

export function HelpPageSlot({ blockKey, className }: { blockKey: string; className?: string }) {
  const help = useContext(HelpCtx);
  if (!help || !help.get(blockKey)) return null;
  return (
    <div className={className}>
      <HelpBlockSlot blockKey={blockKey} help={help} />
    </div>
  );
}
