// Réordonnancement des grilles de photos (étapes de recette, avis, banque de
// l'import) par glisser-déposer — fonctions pures, partagées par
// `use-photo-drag-reorder.ts`.

/**
 * Type MIME interne au glissement de réordonnancement, distinct de
 * `PHOTO_DND_TYPE` (dépôt d'une photo de la banque de l'import vers un
 * emplacement d'étape) : les deux glissements ne doivent jamais se confondre
 * dans un même `onDrop`. Un glissement depuis la banque porte les deux types
 * à la fois, pour rester utilisable aussi bien comme dépôt que comme
 * réordonnancement interne à la banque.
 */
export const PHOTO_REORDER_DND_TYPE = 'application/x-mc-photo-reorder';

/** Échange deux éléments d'un tableau à emplacements fixes (une position vide reste une position vide). */
export function swapAt<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Déplace un élément d'un tableau dense (sans trou) vers une autre position, en décalant les autres. */
export function moveAt<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
