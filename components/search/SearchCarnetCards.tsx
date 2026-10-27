'use client';

// Cartes « carnet » dans les résultats de recherche : les mêmes que le carnet
// (`MineCard` / `OtherCard`), avec leurs étiquettes et leurs gestes. Chaque
// carte porte sa propre mutation et se masque d'elle-même une fois supprimée
// ou son partage retiré — la grille de résultats reste rendue par le serveur
// (`RecipeCard` pour le reste), il n'y a donc pas de liste commune à tenir à
// jour côté client.
import { useState } from 'react';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { MineCard, OtherCard, arreterSuivi, retirerPartage, supprimerRecette } from '@/components/carnet/CarnetCards';
import type { CarnetItem } from '@/lib/carnet';
import type { AllergenRef } from '@/lib/recipes';

type Mine = Extract<CarnetItem, { kind: 'mine' }>;
type Other = Extract<CarnetItem, { kind: 'other' }>;

export function SearchMineCard({
  item,
  isFav,
  defaultPhoto = null,
  allergenRefs,
}: {
  item: Mine;
  isFav: boolean;
  defaultPhoto?: string | null;
  allergenRefs: AllergenRef[];
}) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
  const [removed, setRemoved] = useState(false);
  if (removed) return null;
  return (
    <>
      <LoadingOverlay visible={busy} label="Traitement en cours…" />
      <MineCard
        item={item}
        favIds={isFav ? [item.recipe.id] : []}
        onDelete={async (id, title) => {
          if (await supprimerRecette(mutate, id, title)) setRemoved(true);
        }}
        defaultPhoto={defaultPhoto}
        allergenRefs={allergenRefs}
      />
    </>
  );
}

export function SearchOtherCard({
  item,
  isFav,
  defaultPhoto = null,
  allergenRefs,
}: {
  item: Other;
  isFav: boolean;
  defaultPhoto?: string | null;
  allergenRefs: AllergenRef[];
}) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
  const [removed, setRemoved] = useState(false);
  if (removed) return null;
  return (
    <>
      <LoadingOverlay visible={busy} label="Traitement en cours…" />
      <OtherCard
        item={item}
        favIds={isFav ? [item.recipe.id] : []}
        onRevokeShare={async (it) => {
          if (await retirerPartage(mutate, dialog.confirm, it)) setRemoved(true);
        }}
        onUnfollow={async (it) => {
          if (await arreterSuivi(mutate, it)) setRemoved(true);
        }}
        defaultPhoto={defaultPhoto}
        allergenRefs={allergenRefs}
      />
    </>
  );
}
