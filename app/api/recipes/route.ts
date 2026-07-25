// Route Handler — pagination des recettes de la page d'accueil (bouton
// « Charger plus de délices »). Lecture seule, RLS appliquée via la session.
import { NextResponse } from 'next/server';
import { getRecipes, withAllergenPictos } from '@/lib/recipes';
import { getFavoriteIds } from '@/lib/favorites';

const MAX_LIMIT = 24;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get('limit')) || 6));

  const [recipesRaw, favIds] = await Promise.all([getRecipes({ offset, limit }), getFavoriteIds()]);
  const recipes = await withAllergenPictos(recipesRaw);

  return NextResponse.json({ recipes, favIds: [...favIds] });
}
