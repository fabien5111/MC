// Accès aux recettes, typé — porté depuis db.js (getRecipes / getRecipe /
// getUserRecipes / createRecipe). À utiliser dans les Server Components.
//
// NOTE : les requêtes à jointures profondes (getRecipe) touchent des tables
// absentes de schema.sql (utensils, ingredient_refs, executions…) : la base
// live a divergé. On régénérera les types avec `npm run gen:types` au moment
// de porter recette.html ; d'ici là ces retours restent volontairement souples.
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { cardAllergenNames } from '@/lib/recipe-view';

type Recipe = Database['public']['Tables']['recipes']['Row'];

// `hero_card_url` (~480 px, générée à l'enregistrement de la recette —
// CreerForm, lib/images.ts) est la seule image que cette sélection transporte.
//
// `hero_image_url`, en pleine définition (jusqu'à 1400 px, data-URL), y a été
// conservée un temps en repli pour les recettes pas encore rétro-remplies.
// Mesurée sur la base, elle pesait 4804 kB contre 848 kB pour les vignettes —
// 5,7 fois le poids utile, sérialisé dans le payload RSC de tout écran à
// cartes sans jamais être affiché dès lors que la vignette existe (le carnet
// atteignait 6,57 Mo). Le rétro-remplissage (Admin → Photos) étant passé,
// aucune recette n'en dépendait plus : le repli est retiré.
//
// Conséquence à connaître : une recette qui aurait une photo sans vignette
// affiche désormais la photo par défaut du site, pas sa photo. C'est le
// rétro-remplissage qui la rattrape, plus un repli dans cette requête — le
// prix à payer pour ne pas transporter la pleine définition des 46 autres.
//
// `avatar_url` part pour la même raison : aucun gabarit de carte ne l'affiche
// (seul RecipeComments montre un avatar, avec sa propre requête).
//
// `hero_card_url` est absente de `lib/database.types.ts` (colonne ajoutée par
// migration, types non encore régénérés) : même contournement que
// `hero_thumb_url` (lib/profile.ts).
// `author_ratings(rating_avg, rated_recipes)` embarquée sous `profiles` : la
// vue expose une FK synthétique vers `profiles` (même contrainte que
// `recipes.author_id`, cf. lib/database.types.ts), ce qui suffit à PostgREST
// pour l'embarquer sans requête séparée — la note de l'auteur voyage avec la
// carte au lieu d'un aller-retour par recette affichée.
export const CARD_SELECT =
  'id, title, description, hero_card_url, author_id, prep_time, cook_time, wait_time, total_time, rating_avg, rating_count, created_at, ' +
  'profiles!recipes_author_id_fkey(full_name, username, author_ratings(rating_avg, rated_recipes)), recipe_types(name), difficulties(name, level), ' +
  'ingredient_groups(ingredients(allergen)), recipe_steps(prep_time, cook_time, wait_time)';

export type RecipeCard = Pick<
  Recipe,
  | 'id'
  | 'title'
  | 'description'
  | 'author_id'
  | 'prep_time'
  | 'cook_time'
  | 'wait_time'
  | 'total_time'
  | 'rating_avg'
  | 'rating_count'
  | 'created_at'
> & {
  hero_card_url: string | null;
  profiles: {
    full_name: string | null;
    username: string | null;
    author_ratings: { rating_avg: number | null; rated_recipes: number | null }[];
  } | null;
  recipe_types: { name: string } | null;
  difficulties: { name: string; level: number } | null;
  ingredient_groups: { ingredients: { allergen: string | null }[] }[];
  recipe_steps: { prep_time: number | null; cook_time: number | null; wait_time: number | null }[];
};


export async function getRecipes(opts: {
  limit?: number;
  offset?: number;
  status?: string;
  authorId?: string | null;
  typeId?: number | null;
} = {}): Promise<RecipeCard[]> {
  const { limit = 12, offset = 0, status = 'published', authorId = null, typeId = null } = opts;
  const supabase = await createClient();
  // `is_public` explicite : sans ce filtre, la RLS laisse passer les propres
  // recettes privées de l'utilisateur connecté (elle n'écarte que celles
  // d'autrui) — un auteur voyait ainsi ses recettes privées remonter dans son
  // propre accueil ou parmi les « autres recettes » d'une fiche.
  let q = supabase
    .from('recipes')
    .select(CARD_SELECT)
    .eq('status', status)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (authorId) q = q.eq('author_id', authorId);
  if (typeId) q = q.eq('type_id', typeId);
  const { data, error } = await q;
  if (error) console.error('getRecipes:', error.message);
  return (data as unknown as RecipeCard[]) ?? [];
}

// La recherche (page /recherche) passe désormais par la RPC
// `search_advanced_recipes` — voir lib/search.ts. Les anciennes fonctions
// `searchRecipes` et `getRecipesByTag` faisaient jusqu'à quatre requêtes pour
// reconstituer une union d'identifiants, sans total ni pagination réelle :
// elles sont retirées plutôt que laissées en doublon d'un chemin plus complet.

export type UserRecipeCard = RecipeCardWithAllergenNames & { status: string; is_public: boolean };

export async function getUserRecipes(userId: string): Promise<UserRecipeCard[]> {
  const supabase = await createClient();
  const query = () =>
    supabase
      .from('recipes')
      .select(`${CARD_SELECT}, status, is_public`)
      .eq('author_id', userId)
      .order('created_at', { ascending: false });

  let { data, error } = await query();
  if (error) {
    console.error('getUserRecipes:', error.message);
    ({ data, error } = await query());
    if (error) console.error('getUserRecipes (retry):', error.message);
  }
  const rows = (data as unknown as (RecipeCard & { status: string; is_public: boolean })[]) ?? [];
  return withAllergenNames(rows);
}

// Recette complète avec toutes ses jointures (porté de getRecipe du db.js).
// Typée souplement : les jointures profondes ne s'infèrent pas proprement.
export type RecipeStepView = {
  id: number;
  title: string | null;
  description: string | null;
  day_offset: number | null;
  prep_time: number | null;
  cook_time: number | null;
  wait_time: number | null;
  cook_temp: number | null;
  tips: string | null;
  video_url: string | null;
  sous_etapes: string[] | null;
  order_index: number | null;
  step_photos: { url: string; original_url: string | null; order_index: number | null; ai_retouched: boolean }[];
  // Mode planifié seulement : étape signalée « déjà faite » et conservée pour
  // sa seule cuisson (cf. lib/recipe-plan.ts). Absente sur une recette.
  already_done?: boolean;
  // Mode planifié seulement : déjà faite, sans cuisson à conserver et sans
  // aucun ingrédient/sous-étape gardé — l'étape reste affichée, mais barrée
  // (cf. stepFullyDone). Absente sur une recette.
  fully_done?: boolean;
  // Mode planifié seulement : étape insérée par le remplacement d'un
  // ingrédient par une sous-recette (« je fais moi-même mon praliné »), avec
  // la recette dont elle provient quand celle-ci est encore lisible — cf.
  // lib/recipe-plan.ts. Absentes sur une recette.
  added?: boolean;
  from_recipe?: { id: string; title: string } | null;
};
export type IngredientView = {
  id: number;
  name: string;
  quantity: string | null;
  unit: string | null;
  comment: string | null;
  url: string | null;
  allergen: string | null;
  order_index: number | null;
  // Sélectionné via `ingredients(*, ...)` mais absent de ce type jusqu'ici :
  // nécessaire pour reporter le lien vers le référentiel lors de la
  // matérialisation d'un plan (lib/recipe-plan.ts).
  ref_id: number | null;
  ingredient_refs: { url: string | null; allergens: AllergenRef | null } | null;
};
// Allergène de référence rattaché à un ingrédient (picto + infobulle).
export type AllergenRef = { id: number; name: string; picto: string | null; tooltip: string | null };
export type RecipeFull = {
  id: string;
  title: string;
  description: string | null;
  author_id: string;
  is_public: boolean | null;
  status: string | null;
  // Motif du refus (§9, saisi depuis Admin → Recettes → Refuser), affiché à
  // l'auteur sur sa propre fiche recette. `null` hors statut `rejected`.
  moderation_note: string | null;
  // Date de ce motif (horodatée par le trigger SQL `recipes_track_rejection_note`
  // dès que `moderation_note` change). `null` en même temps que `moderation_note`.
  moderation_note_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  measure_type: string | null;
  yield_qty: string | null;
  yield_unit: string | null;
  yield_desc: string | null;
  yield_notes: string | null;
  mold_type_id: number | null;
  mold_dims: import('@/lib/database.types').Json | null;
  prep_time: number | null;
  cook_time: number | null;
  wait_time: number | null;
  total_time: number | null;
  tips: string | null;
  source: string | null;
  source_url: string | null;
  video_url: string | null;
  serving_advice: string | null;
  hero_image_url: string | null;
  hero_image_original_url: string | null;
  hero_image_ai_retouched: boolean;
  profiles: { full_name: string | null; avatar_url: string | null; username: string | null } | null;
  recipe_types: { name: string } | null;
  difficulties: { name: string; level: number } | null;
  mold_types: { name: string; forme: string | null } | null;
  recipe_tags: { tags: { id: number; name: string; slug: string } | null }[];
  recipe_utensils: { id: number; name: string; comment: string | null; url: string | null; order_index: number | null; utensils: { url: string | null } | null }[];
  ingredient_groups: { id: number; name: string | null; order_index: number | null; scaling_mode: string | null; ingredients: IngredientView[] }[];
  recipe_steps: RecipeStepView[];
};

const FULL_SELECT = `
  *,
  profiles!recipes_author_id_fkey(full_name, avatar_url, username),
  recipe_types(name),
  difficulties(name, level),
  mold_types(name, forme),
  recipe_tags(tags(id, name, slug)),
  recipe_utensils(*, utensils(url)),
  ingredient_groups(*, ingredients(*, ingredient_refs(url, allergens(id, name, picto, tooltip)))),
  recipe_steps(*, step_photos(*))
`;

export async function getRecipeFull(id: string): Promise<RecipeFull | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('recipes').select(FULL_SELECT).eq('id', id).maybeSingle();
  if (error) console.error('getRecipeFull:', error.message);
  return (data as unknown as RecipeFull | null) ?? null;
}

// Identifiants des recettes publiées — sert uniquement à la commande de
// réindexation complète (§6.3, /api/reindex-recette) : la similarité
// interne à la validation lit désormais l'index persisté
// (recipe_shingle_index), plus le corpus complet à chaque analyse.
export async function getPublishedRecipeIds(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('recipes').select('id').eq('status', 'published');
  if (error) {
    console.error('getPublishedRecipeIds:', error.message);
    return [];
  }
  return (data ?? []).map((r) => r.id);
}

// Référentiels (allergènes, conversions, ingrédients de référence) : servis
// par le cache de `lib/data/reference.ts`, ré-exportés ici pour ne pas toucher
// les sites d'appel. Ne pas y rajouter de lecture directe — c'est ce qui avait
// produit deux requêtes `allergens` et trois `ingredient_refs` distinctes.
export {
  getAllergensWithPicto,
  getIngredientConversions,
  getIngredientRefsList,
} from '@/lib/data/reference';

// Masse volumique (g/ml) des ingrédients référencés, par NOM — utilisée en
// repli par `estimateWeightGrams` (lib/ingredient-conversions.ts) quand la
// ligne d'ingrédient d'une fournée n'a pas de `ref_id` propre. `ref_id` n'est
// résolu qu'à l'enregistrement de la recette (`resolveIngredientRefId`,
// correspondance exacte de nom) : un ingrédient référencé APRÈS ce moment-là
// reste sans `ref_id` sur les lignes déjà saisies, alors même que son nom
// correspond désormais à une entrée du référentiel — même piège que celui
// déjà documenté pour « Ingrédients inconnus » (lib/admin.ts : « Ne pas se
// fier à ref_id IS NULL seul »). Ne renvoie que les entrées avec une densité
// renseignée : la table entière n'a pas d'intérêt ici.
export const getIngredientDensities = cache(async (): Promise<{ name: string; density_g_per_ml: number }[]> => {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('ingredient_refs')
    .select('name, density_g_per_ml')
    .not('density_g_per_ml', 'is', null);
  if (error) {
    console.error('getIngredientDensities:', error.message);
    return [];
  }
  return ((data ?? []) as { name: string | null; density_g_per_ml: number | null }[])
    .filter((r): r is { name: string; density_g_per_ml: number } => !!r.name && r.density_g_per_ml != null);
});

// Attache la liste des NOMS d'allergènes à un lot de cartes — jamais leurs
// pictos. Les pictos (data-URL, ~6 kB chacun en moyenne) sont résolus au
// rendu, à partir d'une table de référence (getAllergensWithPicto) chargée
// une seule fois par écran, jamais dupliquée par recette : la version
// précédente (`withAllergenPictos`) inlinait `allergenItems` — pictos inclus —
// dans chaque recette, et cette table franchissant la frontière Client
// Component (RecipeCardClient, CarnetContent) était sérialisée en entier dans
// le payload RSC à chaque occurrence. Motif déjà en place dans BatchView
// (`allergenRefs` en prop, résolu via `matchAllergenPictos` au rendu) —
// généralisé ici à toutes les grilles de cartes.
export type RecipeCardWithAllergenNames = RecipeCard & { allergenNames: string[] };
export function withAllergenNames<T extends Pick<RecipeCard, 'ingredient_groups'>>(
  recipes: T[],
): (T & { allergenNames: string[] })[] {
  return recipes.map((r) => ({ ...r, allergenNames: cardAllergenNames(r) }));
}
