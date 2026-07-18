import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getRecipeFull } from '@/lib/recipes';
import { getIngredientRefNames } from '@/lib/imports';
import { getUnits } from '@/lib/profile';
import { getMoldTypes } from '@/lib/admin';
import { getTags, getDifficulties } from '@/lib/taxonomy';
import { Header } from '@/components/Header';
import { CreerForm } from '@/components/CreerForm';

export const metadata: Metadata = { title: 'Créer une recette | Maryse Club' };

type SearchParams = { searchParams: Promise<{ id?: string }> };

export default async function CreerPage({ searchParams }: SearchParams) {
  const user = await requireUser('/creer');
  const { id } = await searchParams;

  const [tags, units, moldTypes, difficulties, ingredientRefs, editRecipe] = await Promise.all([
    getTags(),
    getUnits(),
    getMoldTypes(),
    getDifficulties(),
    getIngredientRefNames(),
    id ? getRecipeFull(id) : Promise.resolve(null),
  ]);

  // Édition réservée à l'auteur ; sinon on repart d'un formulaire vierge.
  const owned = editRecipe && editRecipe.author_id === user.id ? editRecipe : null;

  return (
    <>
      <Header current="/creer" />
      <main className="max-w-[900px] mx-auto px-margin-mobile md:px-margin-desktop py-12 pb-32">
        <CreerForm
          tags={tags}
          units={units}
          moldTypes={moldTypes}
          difficulties={difficulties}
          ingredientRefs={ingredientRefs}
          editRecipe={owned}
        />
      </main>
    </>
  );
}
