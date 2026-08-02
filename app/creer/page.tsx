import type { Metadata } from 'next';
import { requireUser, isAdmin } from '@/lib/auth';
import { requireWritableSession } from '@/lib/impersonation';
import { getRecipeFull, getRecipes } from '@/lib/recipes';
import { getFavoriteIds } from '@/lib/favorites';
import { getIngredientRefNames, getIngredientRefAllergens, getAllergenRefs, getUtensilRefNames } from '@/lib/imports';
import { getUnits } from '@/lib/profile';
import { getMoldTypes } from '@/lib/admin';
import { getTags, getDifficulties } from '@/lib/taxonomy';
import { Header } from '@/components/Header';
import { CreerForm } from '@/components/CreerForm';
import { SuggestionsSidebar } from '@/components/recipe/SuggestionsSidebar';

export const metadata: Metadata = { title: 'Créer une recette | Maryse Club' };

type SearchParams = { searchParams: Promise<{ id?: string }> };

export default async function CreerPage({ searchParams }: SearchParams) {
  const user = await requireUser('/creer');
  // Impersonation en lecture seule : l'éditeur n'est pas accessible.
  await requireWritableSession();
  const { id } = await searchParams;

  const [tags, units, moldTypes, difficulties, ingredientRefs, refAllergens, allergens, utensilRefs, admin, editRecipe, suggestionsRaw, favIds] =
    await Promise.all([
      getTags(),
      getUnits(),
      getMoldTypes(),
      getDifficulties(),
      getIngredientRefNames(),
      getIngredientRefAllergens(),
      getAllergenRefs(),
      getUtensilRefNames(),
      isAdmin(user.id),
      id ? getRecipeFull(id) : Promise.resolve(null),
      getRecipes({ limit: 4 }),
      getFavoriteIds(),
    ]);

  // Édition réservée à l'auteur ; sinon on repart d'un formulaire vierge.
  const owned = editRecipe && editRecipe.author_id === user.id ? editRecipe : null;
  // Exclut la recette en cours d'édition de ses propres suggestions.
  const suggestions = suggestionsRaw.filter((r) => r.id !== owned?.id).slice(0, 2);

  return (
    <>
      <Header current="/creer" />
      <div className="creer-page">
      <main className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-12 pb-40 md:pb-32">
        <CreerForm
          tags={tags}
          units={units}
          moldTypes={moldTypes}
          difficulties={difficulties}
          ingredientRefs={ingredientRefs}
          refAllergens={refAllergens}
          allergens={allergens}
          utensilRefs={utensilRefs}
          isAdmin={admin}
          editRecipe={owned}
          sidebar={<SuggestionsSidebar suggestions={suggestions} favIds={favIds} />}
        />
      </main>
      </div>
    </>
  );
}
