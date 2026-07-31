'use client';

// Variante client-safe de RecipeCard : les allergènes sont déjà résolus
// (allergenItems, calculés côté serveur par withAllergenPictos) au lieu
// d'être chargés via le Server Component AllergenPictos. Utilisée par
// HomeRecipeGrid pour les cartes ajoutées après la pagination côté client.
import { AllergenPictosView } from '@/components/recipe/AllergenPictosView';
import { RecipeCardLayout } from '@/components/RecipeCardLayout';
import type { RecipeCardWithAllergens } from '@/lib/recipes';

export function RecipeCardClient({
  recipe,
  isFav,
  isOwner,
}: {
  recipe: RecipeCardWithAllergens;
  isFav: boolean;
  isOwner?: boolean;
}) {
  return (
    <RecipeCardLayout
      recipe={recipe}
      isFav={isFav}
      isOwner={isOwner}
      allergens={<AllergenPictosView items={recipe.allergenItems} className="mb-4" iconClassName="w-6 h-6" />}
    />
  );
}
