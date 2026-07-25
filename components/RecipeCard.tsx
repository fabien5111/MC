// Carte recette (porté de recipeCardHTML du db.js). Server Component — les
// allergènes sont résolus via AllergenPictos (accès Supabase). Pour un rendu
// hors Server Component (grille paginée côté client), voir RecipeCardClient.
import { AllergenPictos } from '@/components/recipe/AllergenPictos';
import { RecipeCardLayout } from '@/components/RecipeCardLayout';
import type { RecipeCard as RecipeCardData } from '@/lib/recipes';
import { cardAllergenNames } from '@/lib/recipe-view';

export function RecipeCard({ recipe, isFav }: { recipe: RecipeCardData; isFav: boolean }) {
  return (
    <RecipeCardLayout
      recipe={recipe}
      isFav={isFav}
      allergens={<AllergenPictos names={cardAllergenNames(recipe)} className="mb-4" iconClassName="w-6 h-6" />}
    />
  );
}
