'use client';

// État d'aide partagé par plusieurs emplacements d'une page SERVEUR (JEP-373).
// La page englobe ce qui doit contenir des emplacements et y glisse des
// `<HelpPageSlot>`.
import { createContext, useContext, type ReactNode } from 'react';
import { HelpBlockSlot } from './HelpBlockSlot';
import { useHelpBlocks, type HelpBlocksState } from './useHelpBlocks';
import type { VisibleHelpBlock } from '@/lib/help';

const HelpCtx = createContext<HelpBlocksState | null>(null);

export function HelpPageProvider({
  blocks,
  children,
}: {
  blocks: VisibleHelpBlock[];
  children: ReactNode;
}) {
  const help = useHelpBlocks(blocks);
  return <HelpCtx.Provider value={help}>{children}</HelpCtx.Provider>;
}

export function HelpPageSlot({ blockKey, className }: { blockKey: string; className?: string }) {
  const help = useContext(HelpCtx);
  if (!help || !help.get(blockKey)) return null;
  return (
    <HelpBlockSlot blockKey={blockKey} help={help} className={className} />
  );
}
