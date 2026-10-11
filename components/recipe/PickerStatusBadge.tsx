// Pastille de statut et note d'une recette proposée par la recherche
// (`/api/recipes/picker`) — partagées par la recherche d'une recette de base
// du mode projet (`ComponentResolver`) et par le remplacement d'un ingrédient
// (`IngredientExpandDialog`), pour qu'une même recette s'y présente pareil.
export function PickerStatusBadge({ status, isPublic }: { status: string | null; isPublic?: boolean | null }) {
  const cls = 'px-2 py-0.5 font-label-md text-[10px] uppercase tracking-widest';
  if (status === 'draft') return <span className={`${cls} bg-secondary text-white`}>Brouillon</span>;
  if (status === 'pending') return <span className={`${cls} bg-secondary text-white`}>En attente</span>;
  if (status === 'rejected') return <span className={`${cls} bg-error text-white`}>Refusée</span>;
  if (isPublic === false) return <span className={`${cls} bg-surface-container-highest text-primary`}>Privée</span>;
  return <span className={`${cls} bg-green-700 text-white`}>Publiée</span>;
}

// « 4.5/5 (12) » — rien tant qu'aucun avis n'a été publié (une moyenne de
// 0/5 se lirait comme une vraie mauvaise note).
export function pickerRatingText(avg: number | null | undefined, count: number | null | undefined): string | null {
  if (!count || count <= 0) return null;
  return `${Number(avg || 0).toFixed(1)}/5 (${count})`;
}
