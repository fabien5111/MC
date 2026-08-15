// Vocabulaire de tri d'une grille de recettes — pur, partagé par le carnet
// (`lib/carnet-params.ts`) et la vitrine publique d'un pâtissier
// (`lib/public-profile-params.ts`). Les deux écrans proposent exactement les
// mêmes trois tris : les définir une seule fois évite qu'un même tri finisse
// libellé différemment d'un écran à l'autre.
export const SORT_KEYS = ['recent', 'alpha', 'rating'] as const;
export type RecipeSortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<RecipeSortKey, string> = {
  recent: 'Plus récentes',
  alpha: 'Alphabétique',
  rating: 'Mieux notées',
};
