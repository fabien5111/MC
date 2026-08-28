// Listes de référence pour l'éditeur de recette (tags, types, difficultés).
//
// Ce module n'interroge plus la base : tous ces référentiels sont servis par
// le cache de `lib/data/reference.ts` (une lecture partagée entre requêtes et
// entre visiteurs, invalidée par étiquette depuis le back-office). Il ne reste
// ici que les ré-exports, pour ne pas avoir à toucher les ~60 sites d'appel.
//
// Ne pas y rajouter de `supabase.from('tags')` : c'est exactement la
// dispersion qui avait produit trois requêtes distinctes sur la même table.
export type { Tag, HomeCategory, RecipeType, Difficulty } from '@/lib/data/reference';
export {
  getTags,
  getHomeCategories,
  getTagBySlug,
  getRecipeTypes,
  getDifficulties,
} from '@/lib/data/reference';
