'use client';

// Glisser-déposer de réordonnancement pour une grille de photos (étapes de
// recette, avis, banque de l'import) — cf. `photo-reorder.ts`. Les clés
// identifiant chaque emplacement sont des chaînes libres (ex. `${étape}:${
// index}`) plutôt que de simples index : une grille de `CreerForm` imbrique
// plusieurs étapes, chacune avec ses propres emplacements, dans un seul appel
// du hook au niveau du formulaire (les règles des hooks interdisent d'en
// instancier un par étape dans une boucle de rendu).
//
// JEP-434 : deux gestes selon l'endroit du relâchement. Au centre d'une photo,
// les deux photos s'échangent (`onReorder`) ; dans la gouttière (le quart de
// chaque bord, qui recouvre l'espace entre deux photos), la photo glissée
// s'insère à cet endroit (`onInsert`). Sans `onInsert`, seul l'échange existe.
import { useCallback, useState } from 'react';
import { PHOTO_REORDER_DND_TYPE, zoneDepot, type ZoneDepot } from '@/lib/photo-reorder';

export function usePhotoDragReorder(
  onReorder: (from: string, to: string) => void,
  onInsert?: (from: string, to: string, zone: 'avant' | 'apres') => void,
) {
  const [depot, setDepot] = useState<{ key: string; zone: ZoneDepot } | null>(null);

  const zoneDe = (e: React.DragEvent): ZoneDepot => {
    if (!onInsert) return 'centre';
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return zoneDepot(e.clientX - r.left, r.width);
  };

  const dragProps = useCallback(
    (key: string) => ({
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData(PHOTO_REORDER_DND_TYPE, key);
        e.dataTransfer.effectAllowed = 'move';
      },
      onDragEnd: () => setDepot(null),
    }),
    [],
  );

  const dropProps = useCallback(
    (key: string) => ({
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(PHOTO_REORDER_DND_TYPE)) return;
        e.preventDefault();
        const zone = zoneDe(e);
        if (depot?.key !== key || depot.zone !== zone) setDepot({ key, zone });
      },
      onDragLeave: () => setDepot((d) => (d?.key === key ? null : d)),
      onDrop: (e: React.DragEvent) => {
        const from = e.dataTransfer.getData(PHOTO_REORDER_DND_TYPE);
        const zone = zoneDe(e);
        setDepot(null);
        if (!from || from === key) return;
        e.preventDefault();
        if (zone === 'centre' || !onInsert) onReorder(from, key);
        else onInsert(from, key, zone);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onReorder, onInsert, depot],
  );

  /** Clé visée par un ÉCHANGE (centre d'une photo) : sert au cadre « ring ». */
  const overKey = depot && depot.zone === 'centre' ? depot.key : null;

  /** Classe du repère d'insertion (trait au bord de la photo), vide hors gouttière. */
  const classeDepot = useCallback(
    (key: string) => (depot && depot.key === key && depot.zone !== 'centre' ? `depot-${depot.zone}` : ''),
    [depot],
  );

  return { overKey, classeDepot, dragProps, dropProps };
}
