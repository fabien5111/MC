'use client';

// Emplacement d'aide isolé, pour une page serveur dont l'endroit voulu n'est
// pas dans un composant client déjà équipé de `useHelpBlocks` (JEP-373).
// À utiliser quand la page n'a qu'un seul emplacement à cet endroit ; plusieurs
// emplacements d'une même page partagent un seul `useHelpBlocks`.
import { HelpBlockSlot } from './HelpBlockSlot';
import { useHelpBlocks } from './useHelpBlocks';
import type { VisibleHelpBlock } from '@/lib/help';

export function HelpSlotClient({
  blockKey,
  blocks,
  className,
}: {
  blockKey: string;
  blocks: VisibleHelpBlock[];
  className?: string;
}) {
  const help = useHelpBlocks(blocks);
  if (!help.get(blockKey)) return null;
  return (
    <HelpBlockSlot blockKey={blockKey} help={help} className={className} />
  );
}
