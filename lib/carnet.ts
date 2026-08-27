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
import { isProjectDraft } from '@/lib/projects';
import type { RecipeCardWithAllergenNames } from '@/lib/recipes';
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
      recipe: RecipeCardWithAllergenNames;
      favorite: boolean;
      subscription: boolean;
      shared: SharedVia | null;
      // Statut de modération de la recette — seulement connu pour ce qui est
      // partagé (favoris/abonnements ne portent que du déjà-publié, cf.
      // lib/shares-data.ts). Sert la barre de statut du scope « Partagées
      // avec moi » et le badge de la carte, à la manière de `MineCard`.
      status: string | null;
      // Date de parution : affichée seulement pour les abonnements (README —
      // ne concerne pas les favoris).
      publishedAt: string | null;
    };

export type CarnetData = {
  items: CarnetItem[];
  counts: Record<'all' | 'mine' | 'fav' | 'sub' | 'shared' | 'proj', number>;
  // Comptes de la barre de statut, calculés sur l'ensemble de mes recettes.
  statusCounts: Record<'all' | 'published' | 'draft' | 'pending' | 'rejected', number>;
  // Idem, mais sur ce qui m'est partagé — la barre de statut du scope
  // « Partagées avec moi » ne doit pas montrer les compteurs de mes propres
  // recettes.
  sharedStatusCounts: Record<'all' | 'published' | 'draft' | 'pending' | 'rejected', number>;
};

export async function getCarnetData(userId: string): Promise<CarnetData> {
  const [recipes, favorites, followed, shared] = await Promise.all([
    getUserRecipes(userId),
    getFavorites(userId),
    getFollowedRecipes(userId, 60),
    getSharedWithMeRecipes(userId),
  ]);

  // Les projets en cours d'élaboration sont mis de côté dès le chargement :
  // ils n'entrent dans aucun compteur ni aucune portée en dehors de la leur
  // (spec §10). Un projet validé (`ready`) ou dissous, lui, reste une recette
  // ordinaire et suit exactement le chemin des autres.
  const mineAll: Extract<CarnetItem, { kind: 'mine' }>[] = recipes.map((r) => ({ kind: 'mine', recipe: r }));
  const projectItems: CarnetItem[] = mineAll.filter((i) => isProjectDraft(i.recipe));
  const mineItems: CarnetItem[] = mineAll.filter((i) => !isProjectDraft(i.recipe));

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
  // « Tout » et pouvait faire gonfler « Favoris »/« Abonnements »/« Partagées avec moi »
  // sans raison.
  const mineIds = new Set(recipes.map((r) => r.id));
  const othersById = new Map<
    string,
    {
      recipe: RecipeCardWithAllergenNames;
      favorite: boolean;
      subscription: boolean;
      shared: SharedVia | null;
      status: string | null;
      publishedAt: string | null;
    }
  >();
  for (const f of favorites) {
    if (!f.recipes || mineIds.has(f.recipes.id)) continue;
    othersById.set(f.recipes.id, { recipe: f.recipes, favorite: true, subscription: false, shared: null, status: null, publishedAt: null });
  }
  for (const r of followed) {
    if (mineIds.has(r.id)) continue;
    const existing = othersById.get(r.id);
    if (existing) existing.subscription = true;
    else othersById.set(r.id, { recipe: r, favorite: false, subscription: true, shared: null, status: null, publishedAt: r.created_at });
  }
  for (const s of shared) {
    if (mineIds.has(s.recipe.id)) continue;
    const via: SharedVia = s.via === 'direct' ? { kind: 'direct' } : { kind: 'book', ownerId: s.ownerId };
    const existing = othersById.get(s.recipe.id);
    if (existing) {
      existing.shared = via;
      existing.status = s.status;
    } else {
      othersById.set(s.recipe.id, { recipe: s.recipe, favorite: false, subscription: false, shared: via, status: s.status, publishedAt: null });
    }
  }
  const otherItems: CarnetItem[] = [...othersById.values()].map((o) => ({ kind: 'other', ...o }));

  // Les projets voyagent dans `items` (la portée « Projets » doit pouvoir les
  // afficher) mais jamais dans `counts.all` : la pastille « Tout » annonce ce
  // qu'elle montre, et elle ne les montre pas.
  const items = [...mineItems, ...otherItems, ...projectItems];
  const counts = {
    all: mineItems.length + otherItems.length,
    mine: mineItems.length,
    fav: otherItems.filter((i) => i.kind === 'other' && i.favorite).length,
    sub: otherItems.filter((i) => i.kind === 'other' && i.subscription).length,
    shared: otherItems.filter((i) => i.kind === 'other' && i.shared).length,
    proj: projectItems.length,
  };
  const byStatus = (s: string) => mineItems.filter((i) => i.kind === 'mine' && (i.recipe.status || 'draft') === s).length;
  const statusCounts = {
    all: mineItems.length,
    published: byStatus('published'),
    draft: byStatus('draft'),
    pending: byStatus('pending'),
    rejected: byStatus('rejected'),
  };

  const sharedItems = otherItems.filter((i) => i.kind === 'other' && i.shared);
  const sharedByStatus = (s: string) => sharedItems.filter((i) => i.kind === 'other' && (i.status || 'draft') === s).length;
  const sharedStatusCounts = {
    all: sharedItems.length,
    published: sharedByStatus('published'),
    draft: sharedByStatus('draft'),
    pending: sharedByStatus('pending'),
    rejected: sharedByStatus('rejected'),
  };

  return { items, counts, statusCounts, sharedStatusCounts };
}

// Filtrage + tri appliqués au jeu déjà chargé (cf. en-tête de fichier) —
// fonction pure, séparée de `getCarnetData` pour rester testable sans Supabase
// et pour que `app/carnet/page.tsx` l'applique après avoir choisi les compteurs
// à afficher (qui, eux, portent toujours sur le jeu complet, non filtré).
export function applyCarnetFilters(items: CarnetItem[], params: CarnetParams): CarnetItem[] {
  const q = params.q.trim().toLowerCase();
  const filtered = items.filter((item) => {
    // Étanchéité des projets en cours (spec §10) : seule leur portée les
    // affiche, et elle n'affiche qu'eux. Testé avant tout le reste — un
    // projet ne doit pouvoir ressortir ni par un statut, ni par une
    // recherche par titre.
    const projet = item.kind === 'mine' && isProjectDraft(item.recipe);
    if (params.scope === 'proj') {
      if (!projet) return false;
    } else if (projet) {
      return false;
    }
    if (params.scope === 'mine' && item.kind !== 'mine') return false;
    if (params.scope === 'fav' && !(item.kind === 'other' && item.favorite)) return false;
    if (params.scope === 'sub' && !(item.kind === 'other' && item.subscription)) return false;
    if (params.scope === 'shared' && !(item.kind === 'other' && item.shared)) return false;
    if (params.statut !== 'all') {
      if (item.kind === 'mine' && (item.recipe.status || 'draft') !== params.statut) return false;
      if (item.kind === 'other' && item.shared && (item.status || 'draft') !== params.statut) return false;
    }
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
