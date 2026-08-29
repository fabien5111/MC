import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { canAccess } from '@/lib/entitlements';
import { getEntitlements } from '@/lib/entitlements-data';
import { getBatch, getUnits, getShoppingLists } from '@/lib/profile';
import { getIngredientConversions, getIngredientDensities, getAllergensWithPicto } from '@/lib/recipes';
import { getMyRecipeReview } from '@/lib/reviews-data';
import { createClient } from '@/lib/supabase/server';
import { Header } from '@/components/Header';
import { MobileNav } from '@/components/MobileNav';
import { BatchView } from '@/components/batch/BatchView';

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lecture?: string; mode?: string }>;
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const batch = Number.isFinite(Number(id)) ? await getBatch(Number(id)) : null;
  return { title: batch ? `${batch.recipe_title || 'Fournée'} | Je pâtisse !` : 'Fournée | Je pâtisse !' };
}

// Recette de base : accessibilité + photos, lues en direct (jamais copiées,
// cf. CLAUDE.md « Fournées »). Sélection étroite, dédiée à cette page —
// distincte de `getRecipeFull` (pas de jointures inutiles ici : ingrédients,
// tags... déjà copiés sur la fournée).
type BaseRecipeInfo = {
  id: string;
  updatedAt: string | null;
  heroImageUrl: string | null;
  heroImageAiRetouched: boolean;
  stepPhotosBySourceStepId: Record<number, { url: string; ai_retouched: boolean }[]>;
  // Auteur de la recette de base — pour le lien « Voir la recette d'origine »
  // + signature affichés sur la fournée (même pattern que la fiche recette :
  // repli sur `author_id` si l'auteur n'a pas encore choisi de pseudo).
  authorId: string | null;
  author: { username: string | null; fullName: string | null; avatarUrl: string | null } | null;
};

async function getBaseRecipeInfo(recipeId: string | null): Promise<BaseRecipeInfo | null> {
  if (!recipeId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select(
      'id, updated_at, hero_image_url, hero_image_ai_retouched, author_id, profiles!recipes_author_id_fkey(username, full_name, avatar_url), recipe_steps(id, step_photos(url, ai_retouched, order_index))',
    )
    .eq('id', recipeId)
    .maybeSingle();
  if (error) console.error('getBaseRecipeInfo:', error.message);
  if (!data) return null;
  const stepPhotosBySourceStepId: Record<number, { url: string; ai_retouched: boolean }[]> = {};
  (data.recipe_steps || []).forEach((s: { id: number; step_photos: { url: string; ai_retouched: boolean; order_index: number | null }[] }) => {
    stepPhotosBySourceStepId[s.id] = [...(s.step_photos || [])]
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map((p) => ({ url: p.url, ai_retouched: p.ai_retouched }));
  });
  const profile = data.profiles as unknown as { username: string | null; full_name: string | null; avatar_url: string | null } | null;
  return {
    id: data.id,
    updatedAt: data.updated_at,
    heroImageUrl: data.hero_image_url,
    heroImageAiRetouched: data.hero_image_ai_retouched,
    stepPhotosBySourceStepId,
    authorId: data.author_id,
    author: profile ? { username: profile.username, fullName: profile.full_name, avatarUrl: profile.avatar_url } : null,
  };
}

export default async function FourneePage({ params, searchParams }: Params) {
  const { id } = await params;
  const { lecture, mode } = await searchParams;
  const user = await requireUser(`/fournee/${id}`);

  const batchId = Number(id);
  const batch = Number.isFinite(batchId) ? await getBatch(batchId) : null;
  if (!batch) notFound();

  const [units, conversions, ingredientDensities, shoppingListsRaw, baseRecipe, allergenRefs, myReview, entitlements] =
    await Promise.all([
      getUnits(),
      getIngredientConversions(),
      getIngredientDensities(),
      getShoppingLists(batch.user_id!),
      getBaseRecipeInfo(batch.recipe_id),
      getAllergensWithPicto(),
      batch.recipe_id ? getMyRecipeReview(batch.recipe_id, batch.user_id!) : Promise.resolve(null),
      getEntitlements(user.id),
    ]);
  // Droits d'abonnement (§4 « Lancer une fournée ») : calculés une fois ici,
  // jamais recalculés plus bas dans l'arbre de composants.
  const droits = {
    remplacementIngredient: canAccess(entitlements, 'remplacement_ingredient_par_recette'),
    notesPersonnelles: canAccess(entitlements, 'notes_personnelles'),
    sousEtapes: canAccess(entitlements, 'sous_etapes_sequencement'),
  };
  const unitTips: Record<string, string> = {};
  units.forEach((u) => {
    if (u.tooltip) unitTips[String(u.name).toLowerCase().trim()] = u.tooltip;
  });
  const shoppingLists = shoppingListsRaw.map((l) => ({ id: l.id, name: l.name }));

  return (
    <>
      {/* Même bandeau que le reste du site (auparavant un en-tête maison,
          propre à BatchView) — rattachée à « En cuisine » (lib/nav.ts).
          `no-print` : même traitement que la fiche recette. */}
      <Header current="cuisine" className="no-print" />
      {/* `<main>` : sans lui, le bouton Imprimer n'expand aucun `<details>`
          replié (`usePrintDetailsExpansion` cible `main details`) et les
          règles CSS d'impression scopées à `main` (pleine largeur, une seule
          colonne) restent sans effet — même structure que /recette/[id].
          `batch-page` : réserve la largeur du rail replié (`.recipe-toc`,
          58px), posée ici plutôt que sur le conteneur `mx-auto` de
          `BatchView` (cf. commentaire de la règle dans globals.css). Sans
          elle, le rail — en `position: fixed` — se superpose au texte et aux
          cases à cocher entre 701px et 1024px, où rien d'autre ne dégage la
          place qu'il occupe. */}
      <main className="batch-page">
        <BatchView
          batch={batch}
          baseRecipe={baseRecipe}
          units={units}
          unitTips={unitTips}
          conversions={conversions}
          ingredientDensities={ingredientDensities}
          shoppingLists={shoppingLists}
          allergenRefs={allergenRefs}
          lecture={lecture === '1'}
          initialMode={mode === 'preparer' || mode === 'cuisiner' ? mode : undefined}
          myReview={myReview}
          droits={droits}
        />
      </main>
      <MobileNav current="cuisine" />
    </>
  );
}
