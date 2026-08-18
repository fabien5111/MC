import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { getBatch, getUnits, getShoppingLists } from '@/lib/profile';
import { getIngredientConversions } from '@/lib/recipes';
import { createClient } from '@/lib/supabase/server';
import { BatchView } from '@/components/batch/BatchView';

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lecture?: string }>;
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
};

async function getBaseRecipeInfo(recipeId: string | null): Promise<BaseRecipeInfo | null> {
  if (!recipeId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('recipes')
    .select('id, updated_at, hero_image_url, hero_image_ai_retouched, recipe_steps(id, step_photos(url, ai_retouched, order_index))')
    .eq('id', recipeId)
    .maybeSingle();
  if (!data) return null;
  const stepPhotosBySourceStepId: Record<number, { url: string; ai_retouched: boolean }[]> = {};
  (data.recipe_steps || []).forEach((s: { id: number; step_photos: { url: string; ai_retouched: boolean; order_index: number | null }[] }) => {
    stepPhotosBySourceStepId[s.id] = [...(s.step_photos || [])]
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map((p) => ({ url: p.url, ai_retouched: p.ai_retouched }));
  });
  return {
    id: data.id,
    updatedAt: data.updated_at,
    heroImageUrl: data.hero_image_url,
    heroImageAiRetouched: data.hero_image_ai_retouched,
    stepPhotosBySourceStepId,
  };
}

export default async function FourneePage({ params, searchParams }: Params) {
  const { id } = await params;
  const { lecture } = await searchParams;
  await requireUser(`/fournee/${id}`);

  const batchId = Number(id);
  const batch = Number.isFinite(batchId) ? await getBatch(batchId) : null;
  if (!batch) notFound();

  const [units, conversions, shoppingListsRaw, baseRecipe] = await Promise.all([
    getUnits(),
    getIngredientConversions(),
    getShoppingLists(batch.user_id!),
    getBaseRecipeInfo(batch.recipe_id),
  ]);
  const unitTips: Record<string, string> = {};
  units.forEach((u) => {
    if (u.tooltip) unitTips[String(u.name).toLowerCase().trim()] = u.tooltip;
  });
  const shoppingLists = shoppingListsRaw.map((l) => ({ id: l.id, name: l.name }));

  return (
    <BatchView
      batch={batch}
      baseRecipe={baseRecipe}
      units={units}
      unitTips={unitTips}
      conversions={conversions}
      shoppingLists={shoppingLists}
      lecture={lecture === '1'}
    />
  );
}
