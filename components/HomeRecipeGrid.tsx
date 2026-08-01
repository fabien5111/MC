'use client';

// Grille « Dernières créations » de l'accueil, avec chargement incrémental
// (bouton « Charger plus de délices ») via /api/recipes.
import { useState } from 'react';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { RecipeCardClient } from '@/components/RecipeCardClient';
import type { RecipeCardWithAllergens } from '@/lib/recipes';

const PAGE_SIZE = 6;

export function HomeRecipeGrid({
  initialRecipes,
  initialFavIds,
  currentUserId,
}: {
  initialRecipes: RecipeCardWithAllergens[];
  initialFavIds: string[];
  // Absent si non connecté : aucune carte ne peut alors être la sienne.
  currentUserId?: string | null;
}) {
  const [recipes, setRecipes] = useState(initialRecipes);
  const [favIds, setFavIds] = useState(new Set(initialFavIds));
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialRecipes.length >= PAGE_SIZE);

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/recipes?offset=${recipes.length}&limit=${PAGE_SIZE}`);
      if (!res.ok) throw new Error('Échec du chargement');
      const { recipes: more, favIds: moreFavIds } = (await res.json()) as {
        recipes: RecipeCardWithAllergens[];
        favIds: string[];
      };
      setRecipes((prev) => [...prev, ...more]);
      setFavIds((prev) => new Set([...prev, ...moreFavIds]));
      setHasMore(more.length >= PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <LoadingOverlay visible={loading} label="Chargement des recettes" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {recipes.map((r) => (
          <RecipeCardClient key={r.id} recipe={r} isFav={favIds.has(r.id)} isOwner={!!currentUserId && r.author_id === currentUserId} />
        ))}
      </div>
      {hasMore && (
        <div className="mt-16 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="border-2 border-primary text-primary px-20 py-4 rounded-full font-label-md text-label-md uppercase tracking-[0.2em] hover:bg-primary hover:text-on-primary transition-all active:scale-95 shadow-md hover:shadow-xl disabled:opacity-60"
          >
            Charger plus de délices
          </button>
        </div>
      )}
    </>
  );
}
