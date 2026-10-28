'use client';

// Emplacement d'aide isolé, pour une page serveur dont l'endroit voulu n'est
// pas dans un composant client déjà équipé de `useHelpBlocks` (JEP-373).
// Chaque instance porte son propre état : à utiliser quand la page n'a qu'un
// seul emplacement à cet endroit. Plusieurs emplacements d'une même page
// partagent un seul `useHelpBlocks`, dans le composant qui les héberge.
import { HelpBlockSlot } from './HelpBlockSlot';
import { useHelpBlocks } from './useHelpBlocks';
import type { HelpPageSlug } from '@/lib/help-blocks';
import type { VisibleHelpBlock } from '@/lib/help';

export function HelpSlotClient({
  page,
  blockKey,
  blocks,
  className,
}: {
  page: HelpPageSlug;
  blockKey: string;
  blocks: VisibleHelpBlock[];
  className?: string;
}) {
  const help = useHelpBlocks(page, blocks, true);
  if (!help.get(blockKey)) return null;
  return (
    <div className={className}>
      <HelpBlockSlot blockKey={blockKey} help={help} />
    </div>
  );
}
