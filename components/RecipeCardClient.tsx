'use client';

// Variante client-safe de RecipeCard : les allergènes sont déjà résolus par
// noms (allergenNames, calculés côté serveur par withAllergenNames) au lieu
// d'être chargés via le Server Component AllergenPictos — un Client Component
// ne peut pas rendre un composant serveur asynchrone. Le picto lui-même est
// résolu ici, à partir de la table de référence (allergenRefs) chargée une
// seule fois par la page et passée en prop : jamais dupliqué par recette
// (même motif que BatchView). Utilisée par l'accueil pour toutes les cartes
// des rails (abonnements, dernières créations).
import { AllergenPictosView } from '@/components/recipe/AllergenPictosView';
import { RecipeCardLayout } from '@/components/RecipeCardLayout';
import { matchAllergenPictos } from '@/lib/recipe-view';
import type { AllergenRef, RecipeCardWithAllergenNames } from '@/lib/recipes';

export function RecipeCardClient({
  recipe,
  isFav,
  isOwner,
  showPlan,
  defaultPhoto,
  allergenRefs,
}: {
  recipe: RecipeCardWithAllergenNames;
  isFav: boolean;
  isOwner?: boolean;
  showPlan?: boolean;
  defaultPhoto?: string | null;
  allergenRefs: AllergenRef[];
}) {
  return (
    <RecipeCardLayout
      recipe={recipe}
      isFav={isFav}
      isOwner={isOwner}
      showPlan={showPlan}
      defaultPhoto={defaultPhoto}
      allergens={
        <AllergenPictosView
          items={matchAllergenPictos(recipe.allergenNames, allergenRefs)}
          className="mb-4"
          iconClassName="w-6 h-6"
        />
      }
    />
  );
}
