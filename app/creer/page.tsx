import type { Metadata } from 'next';
import { requireUser, isAdmin } from '@/lib/auth';
import { requireWritableSession, getImpersonationContext } from '@/lib/impersonation';
import { getRecipeFull, getIngredientConversions, getIngredientRefsList } from '@/lib/recipes';
import { getIngredientRefNames, getIngredientRefAllergens, getAllergenRefs, getUtensilRefNames } from '@/lib/imports';
import { getUnits } from '@/lib/profile';
import { getMoldTypes } from '@/lib/admin';
import { getTags, getDifficulties } from '@/lib/taxonomy';
import { getVisibleHelpBlocks } from '@/lib/help';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/MobileNav';
import { CreerForm } from '@/components/CreerForm';

export const metadata: Metadata = { title: 'Créer une recette | Je pâtisse !' };

type SearchParams = { searchParams: Promise<{ id?: string; step?: string }> };

export default async function CreerPage({ searchParams }: SearchParams) {
  const user = await requireUser('/creer');
  // Impersonation en lecture seule : l'éditeur n'est pas accessible.
  await requireWritableSession();
  const { id, step } = await searchParams;
  // Étape (1-indexée) sur laquelle se repositionner, transmise par le bouton
  // « Éditer » de la fiche recette (cf. components/recipe/RecetteToc.tsx).
  const initialStep = step ? parseInt(step, 10) || null : null;

  const [
    tags,
    units,
    moldTypes,
    difficulties,
    ingredientRefs,
    refAllergens,
    allergens,
    utensilRefs,
    admin,
    editRecipe,
    conversions,
    ingredientRefIds,
    helpBlocks,
  ] = await Promise.all([
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
    getIngredientConversions(),
    getIngredientRefsList(),
    getVisibleHelpBlocks('creer', user.id),
  ]);

  // Édition réservée à l'auteur, ou à un admin complet (bouton « Modifier »
  // depuis /admin/recettes — cf. components/admin/RecipesManager.tsx) ;
  // sinon on repart d'un formulaire vierge.
  const owned = editRecipe && (editRecipe.author_id === user.id || admin) ? editRecipe : null;
  const editingOtherAuthor = owned !== null && owned.author_id !== user.id;

  // Cadre rouge sur un ingrédient/ustensile hors référentiel : à afficher
  // aussi quand l'admin édite la recette d'un membre en mode « connecté en
  // tant que » — la session est alors celle du membre (`isAdmin(user.id)`
  // vaut donc false), mais seul un admin complet peut ouvrir une session
  // d'impersonation (cf. POST /api/admin/impersonate), donc sa seule présence
  // suffit à identifier l'admin sans requête supplémentaire.
  // Volontairement isolé d'`isAdmin` (bouton « Ajouter au référentiel »,
  // publication directe, création de tag) : ces écritures restent réservées
  // à l'admin complet dans SA PROPRE session, conformément à CLAUDE.md.
  const highlightUnknownRefs = admin || (await getImpersonationContext()) !== null;

  return (
    <>
      <Header />
      <div className="creer-page">
      {/* `pb-24` : réserve du bouton flottant du sommaire (52 px + marges) —
          la barre d'actions fixe qui imposait `pb-40` a disparu. */}
      <main className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-12 pb-24 md:pb-32">
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
          highlightUnknownRefs={highlightUnknownRefs}
          editRecipe={owned}
          editingOtherAuthor={editingOtherAuthor}
          conversions={conversions}
          ingredientRefIds={ingredientRefIds}
          initialStep={owned ? initialStep : null}
          helpBlocks={helpBlocks}
        />
      </main>
      </div>
      <MobileNav />
    </>
  );
}
