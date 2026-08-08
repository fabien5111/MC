// Accès aux recettes, typé — porté depuis db.js (getRecipes / getRecipe /
// getUserRecipes / createRecipe). À utiliser dans les Server Components.
//
// NOTE : les requêtes à jointures profondes (getRecipe) touchent des tables
// absentes de schema.sql (utensils, ingredient_refs, executions…) : la base
// live a divergé. On régénérera les types avec `npm run gen:types` au moment
// de porter recette.html ; d'ici là ces retours restent volontairement souples.
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { cardAllergenNames, matchAllergenPictos, type AllergenPictoItem } from '@/lib/recipe-view';
import type { ConversionRef, IngredientRefOption } from '@/lib/ingredient-conversions';

type Recipe = Database['public']['Tables']['recipes']['Row'];

export const CARD_SELECT =
  'id, title, description, hero_image_url, author_id, prep_time, cook_time, wait_time, total_time, rating_avg, rating_count, created_at, ' +
  'profiles!recipes_author_id_fkey(full_name, avatar_url), recipe_types(name), difficulties(name, level), ' +
  'ingredient_groups(ingredients(allergen)), recipe_steps(prep_time, cook_time, wait_time)';

export type RecipeCard = Pick<
  Recipe,
  | 'id'
  | 'title'
  | 'description'
  | 'hero_image_url'
  | 'author_id'
  | 'prep_time'
  | 'cook_time'
  | 'wait_time'
  | 'total_time'
  | 'rating_avg'
  | 'rating_count'
  | 'created_at'
> & {
  profiles: { full_name: string | null; avatar_url: string | null } | null;
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
  let q = supabase
    .from('recipes')
    .select(CARD_SELECT)
    .eq('status', status)
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

export type UserRecipeCard = RecipeCardWithAllergens & { status: string; is_public: boolean };

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
  return withAllergenPictos(rows);
}

export async function getRecipe(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from('recipes').select('*').eq('id', id).maybeSingle();
  if (error) console.error('getRecipe:', error.message);
  return data;
}

// Photo d'étape en consultation : de quoi construire son URL
// (`/api/image/step-photo/[id]`), l'ordonner et signaler la retouche IA —
// jamais la data-URL, qui n'a pas à traverser le HTML.
export type StepPhotoMeta = { id: number; order_index: number | null; ai_retouched: boolean };
// Photo d'étape complète : réservée aux éditeurs.
export type StepPhotoRow = StepPhotoMeta & { url: string; original_url: string | null };

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
  // Photos avec leurs data-URL : c'est la forme lue par les éditeurs
  // (`/creer`, `/relecture`), qui ont besoin des octets pour recadrer et
  // réenregistrer. La consultation, elle, n'a besoin que des métadonnées
  // (cf. `StepPhotoMeta` / `RecipeStepViewLight`).
  step_photos: StepPhotoRow[];
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

// Étape en consultation : mêmes champs, photos réduites à leurs métadonnées.
// `step_photos` y est optionnel car deux producteurs n'en fournissent aucune —
// `PLAN_SOURCE_SELECT` (sous-recette éclatée) ne les lit pas du tout, et une
// projection allégée les écarte volontairement (cf. `PlanWidgetRecipe`).
export type RecipeStepViewLight = Omit<RecipeStepView, 'step_photos'> & { step_photos?: StepPhotoMeta[] };
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
  created_at: string | null;
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

// Recette telle que la lit la fiche de consultation : aucune data-URL
// d'image. Les visuels sont servis par `/api/image/…`, l'`<img>` ne portant
// plus qu'une URL courte — ni le HTML ni le flux RSC ne transportent donc les
// octets des photos, qui deviennent cachables par le navigateur et
// téléchargeables en parallèle du document.
//
// Les deux colonnes d'image sont marquées `never` plutôt que retirées : toute
// tentative de les relire sur la fiche devient une erreur de typage, avec la
// raison sous les yeux, au lieu d'un `undefined` silencieux qui ferait
// disparaître l'image.
export type RecipeView = Omit<RecipeFull, 'recipe_steps' | 'hero_image_url' | 'hero_image_original_url'> & {
  recipe_steps: RecipeStepViewLight[];
  hero_image_url?: never;
  hero_image_original_url?: never;
  // Version de l'URL du visuel d'en-tête (`?v=`) : l'`id` de la recette ne
  // change pas quand son image change, contrairement aux photos d'étape qui
  // sont réinsérées à chaque enregistrement. `CreerForm` écrit `updated_at`
  // à chaque sauvegarde pour que cette version bouge.
  updated_at: string | null;
};

// Sélection de **consultation** (fiche recette) : les mêmes champs que
// `FULL_SELECT` moins ce que la fiche n'affiche jamais et ce qui pèse le plus
// lourd. Même motif que `PLAN_SOURCE_SELECT` (lib/recipe-plan.ts), pour les
// mêmes raisons :
//  - aucune data-URL d'image : ni `hero_image_url` ni `step_photos.url` (les
//    routes `/api/image/…` les lisent, une par requête HTTP cachable), ni les
//    originaux non recadrés `hero_image_original_url` /
//    `step_photos.original_url`, produits au même `maxWidth` que la version
//    affichée (`ImageSlot`) et lus par les seuls éditeurs ;
//  - `*` ramenait aussi la colonne générée `fts` (vecteur de recherche :
//    lexèmes et positions de toute la recette), que rien ne lit ici.
// Le prix de l'abandon de `*` : une colonne ajoutée plus tard à `recipes` et
// utilisée sur la fiche doit être ajoutée ici en même temps que dans
// `RecipeFull` — elle ne remontera plus toute seule.
const VIEW_SELECT = `
  id, title, description, author_id, is_public, status, created_at, updated_at,
  rating_avg, rating_count, measure_type, yield_qty, yield_unit, yield_desc,
  yield_notes, mold_type_id, mold_dims, prep_time, cook_time, wait_time,
  total_time, tips, source, source_url, video_url, serving_advice,
  hero_image_ai_retouched,
  profiles!recipes_author_id_fkey(full_name, avatar_url, username),
  recipe_types(name),
  difficulties(name, level),
  mold_types(name, forme),
  recipe_tags(tags(id, name, slug)),
  recipe_utensils(*, utensils(url)),
  ingredient_groups(*, ingredients(*, ingredient_refs(url, allergens(id, name, picto, tooltip)))),
  recipe_steps(*, step_photos(id, order_index, ai_retouched))
`;

// Recette pour la fiche de consultation. Mémoïsée par requête (React cache) :
// `generateMetadata` n'a besoin que du titre mais lit la recette entière, et
// il s'exécute en parallèle du rendu de la page — sans mémoïsation, la
// jointure la plus lourde du site partait **deux fois** par ouverture (une
// requête Supabase authentifiée n'est pas dédoublonnée par Next).
export const getRecipeView = cache(async (id: string): Promise<RecipeView | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('recipes').select(VIEW_SELECT).eq('id', id).maybeSingle();
  if (error) console.error('getRecipeView:', error.message);
  return (data as unknown as RecipeView | null) ?? null;
});

// Présence d'un visuel d'en-tête, sans transporter sa data-URL : un **filtre**
// (`hero_image_url is not null`) au lieu d'une projection — PostgREST ne sait
// pas renvoyer d'expression calculée, et lire la colonne pour la jeter
// annulerait tout le bénéfice. Une recherche par clé primaire, donc.
// Mémoïsée par requête, comme `getRecipeView`.
export const recipeHasHeroImage = cache(async (id: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select('id')
    .eq('id', id)
    .not('hero_image_url', 'is', null)
    .maybeSingle();
  if (error) console.error('recipeHasHeroImage:', error.message);
  return !!data;
});

// URL du visuel d'en-tête servi par la route image, versionnée pour pouvoir
// être mise en cache indéfiniment (cf. `imageResponse`).
export function heroImageSrc(recipe: Pick<RecipeView, 'id' | 'updated_at' | 'created_at'>): string {
  const version = recipe.updated_at || recipe.created_at || '';
  return `/api/image/recipe/${recipe.id}/hero?v=${encodeURIComponent(version)}`;
}

// URL d'une photo d'étape. Pas de version : la photo change d'`id` à chaque
// enregistrement de la recette (delete + insert des étapes).
export function stepPhotoSrc(photo: Pick<StepPhotoMeta, 'id'>): string {
  return `/api/image/step-photo/${photo.id}`;
}

// Table de référence des allergènes avec picto + infobulle. Sert à retrouver le
// visuel d'un allergène saisi en texte libre dans une recette (rapprochement
// par nom). Mémoïsé par requête (React cache) : plusieurs cartes sur une même
// page ne déclenchent qu'une seule lecture.
export const getAllergensWithPicto = cache(async (): Promise<AllergenRef[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('allergens').select('id, name, picto, tooltip').order('name');
  if (error) {
    console.error('getAllergensWithPicto:', error.message);
    return [];
  }
  return (data ?? []).filter((a) => a.name);
});

// Table de référence des conversions d'ingrédients (ex. 1 œuf = 50 g), gérée
// dans Admin → Listes. Mémoïsée par requête (React cache), au même titre que
// getAllergensWithPicto : une seule lecture pour toutes les lignes
// d'ingrédients affichées sur une page.
export const getIngredientConversions = cache(async (): Promise<ConversionRef[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ingredient_conversions')
    .select('ingredient_ref_id, from_quantity, from_unit_id, to_quantity, to_unit_id');
  if (error) {
    console.error('getIngredientConversions:', error.message);
    return [];
  }
  return data ?? [];
});

// Ingrédients de référence (id + libellé) : sert à rapprocher un article
// saisi à la main (sans `ref_id` propre) de la table de référence, pour
// bénéficier des conversions d'ingrédients — cf. ShoppingItems.tsx,
// CreerForm.tsx.
export const getIngredientRefsList = cache(async (): Promise<IngredientRefOption[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('ingredient_refs').select('id, name').order('name');
  if (error) {
    console.error('getIngredientRefsList:', error.message);
    return [];
  }
  return (data ?? []).filter((r) => r.name);
});

// Résout les pictos d'allergènes pour un lot de cartes (une seule lecture de
// la table de référence). Utile pour les rendus faits hors d'un Server
// Component (ex. route API de pagination), où l'on ne peut pas s'appuyer sur
// le composant asynchrone AllergenPictos.
export type RecipeCardWithAllergens = RecipeCard & { allergenItems: AllergenPictoItem[] };
export async function withAllergenPictos<T extends Pick<RecipeCard, 'ingredient_groups'>>(
  recipes: T[],
): Promise<(T & { allergenItems: AllergenPictoItem[] })[]> {
  if (!recipes.length) return [];
  const refs = await getAllergensWithPicto();
  return recipes.map((r) => ({ ...r, allergenItems: matchAllergenPictos(cardAllergenNames(r), refs) }));
}
