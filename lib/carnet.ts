// Données du carnet — un seul plan de travail filtré, pas six onglets.
//
// Le jeu de données complet est chargé une fois (le carnet d'un membre est
// une poignée de dizaines de recettes, pas un catalogue à paginer) : les
// quatre pastilles de provenance affichent toutes leur compteur en même
// temps, ce qui suppose de connaître le contenu de chaque scope même quand un
// seul est affiché. Le filtrage et le tri, eux, se font sur ce jeu déjà
// chargé, au même endroit que la page qui les applique
// (app/carnet/page.tsx) — pas ici, pour que ce module reste un simple
// chargeur.
import { getUserRecipes, type UserRecipeCard } from '@/lib/recipes';
import { getFavorites } from '@/lib/profile';
import { getFollowedRecipes } from '@/lib/follows';
import { getSharedWithMeRecipes } from '@/lib/shares-data';
import type { RecipeCardWithAllergens } from '@/lib/recipes';
import type { CarnetParams } from '@/lib/carnet-params';

// Provenance d'un partage reçu — direct (cette recette précisément) ou via le
// partage du carnet de son auteur. Distingue quelle ligne révoquer depuis la
// carte (cf. CarnetContent) : révoquer un partage direct laisse intact un
// éventuel partage de carnet qui couvrirait la même recette, et inversement.
export type SharedVia = { kind: 'direct' } | { kind: 'book'; ownerId: string };

export type CarnetItem =
  | { kind: 'mine'; recipe: UserRecipeCard }
  | {
      kind: 'other';
      recipe: RecipeCardWithAllergens;
      favorite: boolean;
      subscription: boolean;
      shared: SharedVia | null;
      // Date de parution : affichée seulement pour les abonnements (README —
      // ne concerne pas les favoris).
      publishedAt: string | null;
    };

export type CarnetData = {
  items: CarnetItem[];
  counts: Record<'all' | 'mine' | 'fav' | 'sub' | 'shared', number>;
  // Comptes de la barre de statut, calculés sur l'ensemble de mes recettes.
  statusCounts: Record<'all' | 'published' | 'draft' | 'pending' | 'rejected', number>;
};

export async function getCarnetData(userId: string): Promise<CarnetData> {
  const [recipes, favorites, followed, shared] = await Promise.all([
    getUserRecipes(userId),
    getFavorites(userId),
    getFollowedRecipes(userId, 60),
    getSharedWithMeRecipes(userId),
  ]);

  const mineItems: CarnetItem[] = recipes.map((r) => ({ kind: 'mine', recipe: r }));

  // Favoris, abonnements et partages se recoupent parfois (un pâtissier
  // suivi dont une recette est aussi mise en favori, ou dont le carnet est en
  // plus partagé) : une seule carte, avec toutes les marques applicables,
  // plutôt qu'un doublon dans la grille.
  //
  // Une recette dont je suis l'auteur est exclue de ce bucket même si je l'ai
  // mise en favori ou si elle apparaît dans le fil des abonnements (jamais le
  // cas normalement, mais pas garanti côté données) : elle est déjà présente
  // comme carte « mienne », avec ses vraies actions (modifier/supprimer) — la
  // montrer aussi comme carte « d'un autre » la comptait deux fois dans
  // « Tout » et pouvait faire gonfler « Favoris »/« Abonnements »/« Partagées »
  // sans raison.
  const mineIds = new Set(recipes.map((r) => r.id));
  const othersById = new Map<
    string,
    { recipe: RecipeCardWithAllergens; favorite: boolean; subscription: boolean; shared: SharedVia | null; publishedAt: string | null }
  >();
  for (const f of favorites) {
    if (!f.recipes || mineIds.has(f.recipes.id)) continue;
    othersById.set(f.recipes.id, { recipe: f.recipes, favorite: true, subscription: false, shared: null, publishedAt: null });
  }
  for (const r of followed) {
    if (mineIds.has(r.id)) continue;
    const existing = othersById.get(r.id);
    if (existing) existing.subscription = true;
    else othersById.set(r.id, { recipe: r, favorite: false, subscription: true, shared: null, publishedAt: r.created_at });
  }
  for (const s of shared) {
    if (mineIds.has(s.recipe.id)) continue;
    const via: SharedVia = s.via === 'direct' ? { kind: 'direct' } : { kind: 'book', ownerId: s.ownerId };
    const existing = othersById.get(s.recipe.id);
    if (existing) existing.shared = via;
    else othersById.set(s.recipe.id, { recipe: s.recipe, favorite: false, subscription: false, shared: via, publishedAt: null });
  }
  const otherItems: CarnetItem[] = [...othersById.values()].map((o) => ({ kind: 'other', ...o }));

  const items = [...mineItems, ...otherItems];
  const counts = {
    all: items.length,
    mine: mineItems.length,
    fav: otherItems.filter((i) => i.kind === 'other' && i.favorite).length,
    sub: otherItems.filter((i) => i.kind === 'other' && i.subscription).length,
    shared: otherItems.filter((i) => i.kind === 'other' && i.shared).length,
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
    if (params.scope === 'mine' && item.kind !== 'mine') return false;
    if (params.scope === 'fav' && !(item.kind === 'other' && item.favorite)) return false;
    if (params.scope === 'sub' && !(item.kind === 'other' && item.subscription)) return false;
    if (params.scope === 'shared' && !(item.kind === 'other' && item.shared)) return false;
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
