'use client';

// Blocs d'aide d'une page, partagés par ses emplacements (motif /creer : un
// picto avant le titre, un avant la taille, deux dans la première étape…).
// Depuis JEP-391, plus de masquage : simple index des blocs par clé.
import { useCallback } from 'react';
import type { VisibleHelpBlock } from '@/lib/help';

export type HelpBlocksState = {
  get: (key: string) => VisibleHelpBlock | undefined;
};

export function useHelpBlocks(blocks: VisibleHelpBlock[]): HelpBlocksState {
  const get = useCallback((key: string) => blocks.find((b) => b.key === key), [blocks]);
  return { get };
}
