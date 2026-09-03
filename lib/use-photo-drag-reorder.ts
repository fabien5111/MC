'use client';

// Glisser-déposer de réordonnancement pour une grille de photos (étapes de
// recette, avis, banque de l'import) — cf. `photo-reorder.ts`. Les clés
// identifiant chaque emplacement sont des chaînes libres (ex. `${étape}:${
// index}`) plutôt que de simples index : une grille de `CreerForm` imbrique
// plusieurs étapes, chacune avec ses propres emplacements, dans un seul appel
// du hook au niveau du formulaire (les règles des hooks interdisent d'en
// instancier un par étape dans une boucle de rendu).
import { useCallback, useState } from 'react';
import { PHOTO_REORDER_DND_TYPE } from '@/lib/photo-reorder';

export function usePhotoDragReorder(onReorder: (from: string, to: string) => void) {
  const [overKey, setOverKey] = useState<string | null>(null);

  const dragProps = useCallback(
    (key: string) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData(PHOTO_REORDER_DND_TYPE, key);
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragEnd: () => setOverKey(null),
    }),
    [],
  );

  const dropProps = useCallback(
    (key: string) => ({
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(PHOTO_REORDER_DND_TYPE)) return;
        e.preventDefault();
        if (overKey !== key) setOverKey(key);
      },
      onDragLeave: () => setOverKey((k) => (k === key ? null : k)),
      onDrop: (e: React.DragEvent) => {
        const from = e.dataTransfer.getData(PHOTO_REORDER_DND_TYPE);
        setOverKey(null);
        if (!from || from === key) return;
        e.preventDefault();
        onReorder(from, key);
      },
    }),
    [onReorder, overKey],
  );

  return { overKey, dragProps, dropProps };
}
