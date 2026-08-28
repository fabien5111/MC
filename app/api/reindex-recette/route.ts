// Route Handler — maintenance de l'index de similarité interne persisté
// (§6.3 : « à chaque publication ou dépublication d'une recette, mettre à
// jour shingles [...]. Prévoir une commande de réindexation complète. »).
//
// Deux modes :
// - `{ recipeId }` : met à jour (ou retire) l'entrée d'index d'une seule
//   recette, appelée en tâche de fond à chaque transition de statut
//   (CreerForm, RecipesManager).
// - `{ full: true }` : réindexation complète du corpus publié, réservée à
//   l'admin/gestionnaire (commande manuelle depuis l'admin).
import { NextResponse } from 'next/server';
import { getCurrentUser, isManager } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRecipeFull, getPublishedRecipeIds } from '@/lib/recipes';
import type { RecipeFull } from '@/lib/recipes';
import { buildEditorialText, buildStructuralSignature } from '@/lib/recipe-analysis';
import { buildShingles } from '@/lib/ai/similarity';

export const maxDuration = 60;

// `recipe_shingle_index` est absente de lib/database.types.ts tant que
// cette migration n'a pas été appliquée puis régénérée (`npm run
// gen:types`) — jamais éditée à la main (CLAUDE.md). Accès non typé en
// attendant, comme les autres tables du contrôle IA (lots 1-3).
function indexTable(client: any) {
  return client.from('recipe_shingle_index');
}

// Met à jour ou retire l'entrée d'index d'une recette selon son statut
// courant. `recipe` est `null` quand la recette n'existe plus (ou n'est pas
// visible sous RLS) : traité comme une dépublication, pour ne jamais laisser
// une entrée orpheline dans l'index.
async function indexOne(admin: ReturnType<typeof createAdminClient>, recipeId: string, recipe: RecipeFull | null) {
  if (!recipe || recipe.status !== 'published') {
    await indexTable(admin).delete().eq('recipe_id', recipeId);
    return recipe ? 'removed' : 'not_found';
  }
  const editorialText = buildEditorialText(recipe);
  const shingles = Array.from(buildShingles(editorialText));
  const structuralKeys = buildStructuralSignature(recipe).ingredients.map((i) => i.canonicalKey);
  await indexTable(admin).upsert({
    recipe_id: recipeId,
    editorial_text: editorialText,
    shingles,
    structural_keys: structuralKeys,
    updated_at: new Date().toISOString(),
  });
  return 'indexed';
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  if (body?.full === true) {
    if (!(await isManager(user.id))) return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 403 });

    const ids = await getPublishedRecipeIds();
    let indexed = 0;
    for (const id of ids) {
      try {
        const recipe = await getRecipeFull(id);
        const result = await indexOne(admin, id, recipe);
        if (result === 'indexed') indexed++;
      } catch (e) {
        console.error('reindex-recette (full):', id, (e as Error).message);
      }
    }

    // Remet l'index en cohérence avec l'état réel : retire toute entrée dont
    // la recette n'est plus publiée mais qui serait restée (recette
    // supprimée sans passer par ce endpoint, dérive manuelle en base…).
    const { data: existingRows } = await indexTable(admin).select('recipe_id');
    const stale = ((existingRows ?? []) as { recipe_id: string }[]).map((r) => r.recipe_id).filter((id) => !ids.includes(id));
    if (stale.length) await indexTable(admin).delete().in('recipe_id', stale);

    return NextResponse.json({ indexed, total: ids.length, retires: stale.length });
  }

  const recipeId = typeof body?.recipeId === 'string' ? body.recipeId : null;
  if (!recipeId) return NextResponse.json({ erreur: 'recipeId requis.' }, { status: 400 });

  const recipe = await getRecipeFull(recipeId);
  const autorise = recipe ? recipe.author_id === user.id || (await isManager(user.id)) : await isManager(user.id);
  if (!autorise) return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 403 });

  try {
    const result = await indexOne(admin, recipeId, recipe);
    return NextResponse.json({ result });
  } catch (e) {
    console.error('reindex-recette:', (e as Error).message);
    return NextResponse.json({ erreur: 'Réindexation impossible.' }, { status: 500 });
  }
}
