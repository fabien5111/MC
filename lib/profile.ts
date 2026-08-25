// Chargeurs de données du profil, typés — portés de db.js
// (getFavorites, getBatches, getShoppingLists, getUnits). Server-side, RLS via session.
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { CARD_SELECT, withAllergenNames, type RecipeCard, type RecipeCardWithAllergenNames } from '@/lib/recipes';
import { BATCH_FULL_SELECT, TERMINEES_PAGE_SIZE, type BatchFull } from '@/lib/recipe-plan';

export type Unit = Database['public']['Tables']['units']['Row'];

// La recette embarquée reprend exactement les champs de la carte recette
// (RecipeCard, cf. lib/recipes.ts) : la page profil affiche les favoris avec
// le composant RecipeCardClient, identique à celui de l'accueil.
export type FavoriteRow = {
  recipe_id: string;
  created_at: string | null;
  recipes: RecipeCardWithAllergenNames | null;
};

export type BatchListRow = {
  id: number;
  recipe_id: string | null;
  recipe_title: string | null;
  planned_date: string | null;
  degustation_at: string | null;
  factor: number | null;
  adjust_label: string | null;
  notes: string | null;
  status: string;
  // Cuisson en cours : posé au moment où l'utilisateur passe en mode
  // Cuisiner (date_debut renseignée), effacé quand la fournée est marquée
  // terminée ou abandonnée (date_fin renseignée). Plus de table `executions`
  // séparée à joindre — l'état vit directement sur la fournée.
  date_debut: string | null;
  date_fin: string | null;
  // Jours nécessaires : calculé depuis la fournée matérialisée (batch_steps),
  // pas depuis la recette de base qui a pu évoluer depuis. Le reste des
  // colonnes (titre, ordre, durées) sert à la vue par jour transverse à
  // plusieurs fournées (PlanningDayView) — day_order_index n'est renseignée
  // qu'après un premier glisser-déposer dans cette vue, cf. CLAUDE.md.
  batch_steps: {
    id: number;
    title: string | null;
    day_offset: number;
    day_order_index: number | null;
    order_index: number;
    done: boolean;
    prep_time: number | null;
    wait_time: number | null;
    cook_time: number | null;
    cook_temp: number | null;
  }[];
  // `hero_thumb_url`, jamais `hero_image_url` : ces listes n'affichent qu'une
  // vignette (56-64 px), or `hero_image_url` est une data-URL pleine
  // définition (jusqu'à 1400 px) — la sélectionner pour chaque fournée
  // listée gonflait le payload RSC de plusieurs centaines de Ko sans
  // bénéfice visuel. `hero_thumb_url` (~96 px, générée à l'enregistrement de
  // la recette — CreerForm, lib/images.ts) pèse quelques Ko ; `null` pour une
  // recette pas encore rétro-remplie retombe sur l'icône par défaut (cf.
  // CuisineContent). L'image pleine définition reste chargée normalement sur
  // la fiche d'une fournée (BATCH_FULL_SELECT).
  recipes: {
    id: string;
    title: string | null;
    hero_thumb_url: string | null;
    prep_time: number | null;
    total_time: number | null;
  } | null;
};

export type ShoppingListSummary = Database['public']['Tables']['shopping_lists']['Row'] & {
  shopping_list_items: { id: number; checked: boolean }[];
};

export async function getFavorites(userId: string): Promise<FavoriteRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('favorites')
    .select(`recipe_id, created_at, recipes(${CARD_SELECT})`)
    .eq('user_id', userId);
  if (error) console.error('getFavorites:', error.message);
  const rows = (data as unknown as { recipe_id: string; created_at: string | null; recipes: RecipeCard | null }[]) ?? [];
  const cards = rows.map((r) => r.recipes).filter((r): r is RecipeCard => !!r);
  const withNames = withAllergenNames(cards);
  const byId = new Map(withNames.map((c) => [c.id, c]));
  return rows.map((r) => ({ ...r, recipes: r.recipes ? (byId.get(r.recipes.id) ?? null) : null }));
}

// `scope` remplace l'ancien couple de statuts 'planifie'/'archive' :
// - 'actives'   → fournées en cours de vie (status = 'planifiee'), pour
//   l'onglet « Mes fournées » actif.
// - 'terminees' → fournées closes (status = 'terminee' ou 'abandonnee'),
//   pour l'écran « Fournées terminées » (décision produit : une fournée
//   terminée ne reste plus dans le planning actif, elle rejoint un écran
//   dédié plutôt qu'un simple repli « Archivées »).
// Fournées terminées/abandonnées : chargées par pages de `TERMINEES_PAGE_SIZE`
// (lib/recipe-plan.ts), la plus récente d'abord. Sans borne, cette requête
// (et le payload de la page « En cuisine ») grossit avec l'ancienneté du
// compte, pour toujours — un utilisateur de longue date finirait par
// attendre le chargement de fournées vieilles de plusieurs années à chaque
// visite. Au-delà, le bouton « Voir plus » de CuisineContent appelle
// `GET /api/fournee/terminees` avec cette même taille de page en décalage
// (`offset`).
export async function getBatches(
  userId: string,
  scope: 'actives' | 'terminees' = 'actives',
  offset = 0,
): Promise<BatchListRow[]> {
  const supabase = await createClient();
  // Colonnes explicites (pas `select('*')`) : `batches` porte sa propre copie
  // du contenu de la recette (description, conseils, moule, tags… — cf.
  // CLAUDE.md « Fournées »), aucune de ces colonnes n'est utilisée par les
  // listes de l'écran « En cuisine ». Les sélectionner quand même alourdissait
  // le payload RSC de la page pour rien.
  let query = supabase
    .from('batches')
    .select(
      'id, recipe_id, recipe_title, planned_date, degustation_at, factor, adjust_label, notes, status, date_debut, date_fin, recipes(id, title, hero_thumb_url, prep_time, total_time), batch_steps(id, title, day_offset, day_order_index, order_index, done, prep_time, wait_time, cook_time, cook_temp)',
    )
    .eq('user_id', userId);
  query = scope === 'actives' ? query.eq('status', 'planifiee') : query.in('status', ['terminee', 'abandonnee']);
  query = query.order('planned_date', { ascending: scope === 'actives' });
  if (scope === 'terminees') query = query.range(offset, offset + TERMINEES_PAGE_SIZE - 1);
  const { data, error } = await query;
  if (error) console.error('getBatches:', error.message);
  return (data as unknown as BatchListRow[]) ?? [];
}

// Fournées dont la cuisson est en cours (mode Cuisiner ouvert, pas encore
// terminée) — pour le badge « en cours » de l'accueil (Header, MobileNav,
// SessionsCarousel) et la section « En cours » d'« En cuisine ». Remplace
// l'ancien `getActiveExecutions` : plus de table `executions` séparée à
// joindre, l'état vit directement sur `batches` (`date_debut` renseignée,
// `date_fin` encore nulle).
export type ActiveBatchRow = Pick<BatchListRow, 'id' | 'recipe_title' | 'date_debut' | 'degustation_at'> & {
  recipes: { hero_thumb_url: string | null } | null;
  // Avancement constaté, calculé depuis `batch_steps` : nombre d'étapes
  // cochées, total, et titre de la première étape restante.
  //
  // C'est ce qui remplace le décompte « dans 12 min » des maquettes. Le
  // modèle ne porte aucun ancrage horaire par étape (`planned_date` est une
  // date, `day_offset` un nombre de jours, les temps sont des durées sans
  // heure de départ) : un décompte serait une estimation déguisée en
  // horloge, et on cuisine avec. « Étape 2 sur 5 · Crème Chiboust » dit ce
  // que l'on sait, et rien de plus. Le décompte viendra avec l'ancrage
  // horaire.
  progress: { done: number; total: number; currentTitle: string | null };
};

export async function getActiveBatches(userId: string): Promise<ActiveBatchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('batches')
    .select('id, recipe_title, date_debut, degustation_at, recipes(hero_thumb_url), batch_steps(title, order_index, done)')
    .eq('user_id', userId)
    .eq('status', 'planifiee')
    .not('date_debut', 'is', null)
    .order('date_debut', { ascending: false });
  if (error) console.error('getActiveBatches:', error.message);
  const rows = (data as unknown as (Pick<BatchListRow, 'id' | 'recipe_title' | 'date_debut' | 'degustation_at'> & {
    recipes: { hero_thumb_url: string | null } | null;
    batch_steps: { title: string | null; order_index: number; done: boolean }[];
  })[]) ?? [];
  return rows.map((r) => {
    const steps = [...r.batch_steps].sort((a, b) => a.order_index - b.order_index);
    const done = steps.filter((s) => s.done).length;
    const first = steps.find((s) => !s.done);
    return { ...r, progress: { done, total: steps.length, currentTitle: first?.title ?? null } };
  });
}

export async function getShoppingLists(userId: string): Promise<ShoppingListSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('*, shopping_list_items(id, checked)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) console.error('getShoppingLists:', error.message);
  return (data as unknown as ShoppingListSummary[]) ?? [];
}

// L'en-tête d'une fournée (ligne `batches` seule, sans son contenu) — utilisé
// partout où seuls facteur/libellé/date sont nécessaires (bandeau, formulaire
// d'édition). `lib/recipe-plan.ts` s'appuie dessus pour `batchFactor()`.
export type BatchEntry = Database['public']['Tables']['batches']['Row'];

// Une fournée complète (en-tête + étapes/sous-étapes/ingrédients/ustensiles
// matérialisés). null si absente/RLS. C'est la copie indépendante de la
// recette au moment de la création de la fournée — voir CLAUDE.md.
export async function getBatch(id: number): Promise<BatchFull | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('batches').select(BATCH_FULL_SELECT).eq('id', id).maybeSingle();
  if (error) console.error('getBatch:', error.message);
  const batch = (data as unknown as BatchFull | null) ?? null;
  if (!batch) return null;

  // Titres des sous-recettes qui remplacent un ingrédient (cf. CLAUDE.md
  // « Fournées »). Requête séparée plutôt que jointure imbriquée : elle n'a
  // lieu que si la fournée comporte au moins un remplacement, et son échec ne
  // coûte que le libellé du lien — la fournée reste affichable, elle est
  // autonome. Une recette devenue illisible (dépubliée, supprimée) laisse
  // simplement `expanded_recipe` à null.
  const ids = [...new Set(batch.batch_ingredients.map((it) => it.expanded_into_recipe_id).filter((v): v is string => !!v))];
  if (!ids.length) return batch;
  const { data: recipes, error: recipesError } = await supabase.from('recipes').select('id, title').in('id', ids);
  if (recipesError) console.error('getBatch (sous-recettes):', recipesError.message);
  const byId = new Map((recipes ?? []).map((r) => [r.id, { id: r.id, title: r.title }]));
  batch.batch_ingredients.forEach((it) => {
    it.expanded_recipe = it.expanded_into_recipe_id ? (byId.get(it.expanded_into_recipe_id) ?? null) : null;
  });
  return batch;
}

// Fournées terminées d'un utilisateur pour une recette donnée — affichées
// dans un bloc repliable sur la fiche recette. RLS (`owns_plan()`) limite
// déjà la lecture aux fournées du visiteur connecté : aucune fournée d'un
// autre utilisateur ne peut remonter ici, même sur une recette publique.
// Tri décroissant sur la date de clôture réelle (`date_fin`), avec repli sur
// la date prévue (`planned_date`) pour les fournées sans `date_fin` — d'où le
// tri en JS plutôt qu'un simple `.order()` PostgREST (pas de COALESCE côté
// requêteur).
export type CompletedBatchRow = {
  id: number;
  planned_date: string | null;
  date_fin: string | null;
  factor: number;
  user_note: string | null;
};

export async function getRecipeCompletedBatches(userId: string, recipeId: string): Promise<CompletedBatchRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('batches')
    .select('id, planned_date, date_fin, factor, user_note')
    .eq('user_id', userId)
    .eq('recipe_id', recipeId)
    .eq('status', 'terminee');
  if (error) console.error('getRecipeCompletedBatches:', error.message);
  const rows = (data as unknown as CompletedBatchRow[]) ?? [];
  return rows.sort((a, b) => (b.date_fin ?? b.planned_date ?? '').localeCompare(a.date_fin ?? a.planned_date ?? ''));
}

// Unités : servies par le cache de `lib/data/reference.ts`.
export { getUnits } from '@/lib/data/reference';

// Pastille « En cuisine » (Header, MobileNav) : présence d'une fournée en
// cours de cuisson, sans chiffre — le compte se lit dans l'écran. `head`
// évite de charger la moindre ligne, un simple `count` suffit.
export async function hasActiveBatches(userId: string): Promise<boolean> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('batches')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'planifiee')
    .not('date_debut', 'is', null);
  return !!count && count > 0;
}
