// Données du carnet — un seul plan de travail filtré, pas six onglets.
//
// Le jeu de données complet est chargé une fois (le carnet d'un membre est
// une poignée de dizaines de recettes, pas un catalogue à paginer) : les cinq
// pastilles de provenance affichent toutes leur compteur en même temps, ce
// qui suppose de connaître le contenu de chaque scope même quand un seul est
// affiché. Le filtrage et le tri, eux, se font sur ce jeu déjà chargé, au
// même endroit que la page qui les applique (app/carnet/page.tsx) — pas ici,
// pour que ce module reste un simple chargeur.
import { getUserRecipes, type UserRecipeCard } from '@/lib/recipes';
import { getFavorites } from '@/lib/profile';
import { getFollowedRecipes } from '@/lib/follows';
import { createClient } from '@/lib/supabase/server';
import type { RecipeCardWithAllergens } from '@/lib/recipes';
import type { CarnetParams } from '@/lib/carnet-params';

export type CarnetItem =
  | { kind: 'mine'; recipe: UserRecipeCard; imported: boolean }
  | {
      kind: 'other';
      recipe: RecipeCardWithAllergens;
      favorite: boolean;
      subscription: boolean;
      // Date de parution : affichée seulement pour les abonnements (README —
      // ne concerne pas les favoris).
      publishedAt: string | null;
    };

export type CarnetData = {
  items: CarnetItem[];
  counts: Record<'all' | 'mine' | 'import' | 'fav' | 'sub', number>;
  // Comptes de la barre de statut, calculés sur l'ensemble de mes recettes
  // (créations et importées confondues) — la barre elle-même s'applique
  // quel que soit le sous-scope choisi parmi les deux.
  statusCounts: Record<'all' | 'published' | 'draft' | 'pending' | 'rejected', number>;
};

export async function getCarnetData(userId: string): Promise<CarnetData> {
  const [recipes, favorites, followed, importedIds] = await Promise.all([
    getUserRecipes(userId),
    getFavorites(userId),
    getFollowedRecipes(userId, 60),
    getImportedRecipeIds(userId),
  ]);

  const mineItems: CarnetItem[] = recipes.map((r) => ({
    kind: 'mine',
    recipe: r,
    imported: importedIds.has(r.id),
  }));

  // Favoris et abonnements se recoupent parfois (un pâtissier suivi dont une
  // recette est aussi mise en favori) : une seule carte, avec les deux
  // marques, plutôt qu'un doublon dans la grille.
  const othersById = new Map<string, { recipe: RecipeCardWithAllergens; favorite: boolean; subscription: boolean; publishedAt: string | null }>();
  for (const f of favorites) {
    if (!f.recipes) continue;
    othersById.set(f.recipes.id, { recipe: f.recipes, favorite: true, subscription: false, publishedAt: null });
  }
  for (const r of followed) {
    const existing = othersById.get(r.id);
    if (existing) existing.subscription = true;
    else othersById.set(r.id, { recipe: r, favorite: false, subscription: true, publishedAt: r.created_at });
  }
  const otherItems: CarnetItem[] = [...othersById.values()].map((o) => ({ kind: 'other', ...o }));

  const items = [...mineItems, ...otherItems];
  const counts = {
    all: items.length,
    mine: mineItems.filter((i) => i.kind === 'mine' && !i.imported).length,
    import: mineItems.filter((i) => i.kind === 'mine' && i.imported).length,
    fav: otherItems.filter((i) => i.kind === 'other' && i.favorite).length,
    sub: otherItems.filter((i) => i.kind === 'other' && i.subscription).length,
  };
  const byStatus = (s: string) => mineItems.filter((i) => i.kind === 'mine' && (i.recipe.status || 'draft') === s).length;
  const statusCounts = {
    all: mineItems.length,
    published: byStatus('published'),
    draft: byStatus('draft'),
    pending: byStatus('pending'),
    rejected: byStatus('rejected'),
  };

  return { items, counts, statusCounts };
}

// Filtrage + tri appliqués au jeu déjà chargé (cf. en-tête de fichier) —
// fonction pure, séparée de `getCarnetData` pour rester testable sans Supabase
// et pour que `app/carnet/page.tsx` l'applique après avoir choisi les compteurs
// à afficher (qui, eux, portent toujours sur le jeu complet, non filtré).
export function applyCarnetFilters(items: CarnetItem[], params: CarnetParams): CarnetItem[] {
  const q = params.q.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (params.scope === 'mine' && !(item.kind === 'mine' && !item.imported)) return false;
    if (params.scope === 'import' && !(item.kind === 'mine' && item.imported)) return false;
    if (params.scope === 'fav' && !(item.kind === 'other' && item.favorite)) return false;
    if (params.scope === 'sub' && !(item.kind === 'other' && item.subscription)) return false;
    if (params.statut !== 'all' && item.kind === 'mine' && (item.recipe.status || 'draft') !== params.statut) return false;
    if (q && !item.recipe.title.toLowerCase().includes(q)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (params.tri === 'alpha') return a.recipe.title.localeCompare(b.recipe.title, 'fr');
    if (params.tri === 'rating') return (b.recipe.rating_avg ?? 0) - (a.recipe.rating_avg ?? 0);
    return +new Date(b.recipe.created_at ?? 0) - +new Date(a.recipe.created_at ?? 0);
  });
  return sorted;
}

// Identifiants des recettes créées via un import (relu et validé) de
// l'utilisateur — c'est ce qui distingue « Importées » de « Mes créations » :
// `recipes` ne porte aucune marque en propre, seule la ligne `imports` dont
// `recipe_id` pointe vers elle en témoigne (cf. CLAUDE.md « Créer / Importer »).
async function getImportedRecipeIds(userId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('imports')
    .select('recipe_id')
    .eq('user_id', userId)
    .not('recipe_id', 'is', null);
  if (error) {
    console.error('getImportedRecipeIds:', error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => r.recipe_id as string));
}
