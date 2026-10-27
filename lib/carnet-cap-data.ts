// Carnet CAP (JEP-6) — lectures serveur. La logique (ce qui a le droit de
// sortir sur la feuille) est dans `lib/carnet-cap.ts`, pure.
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { CARD_SELECT, getRecipeFull, getRecipesFull, withAllergenNames, type RecipeFull, type UserRecipeCard } from '@/lib/recipes';
import { getIdsListeCap } from '@/lib/recipe-lists-data';
import { nombreIndisponibles } from '@/lib/recipe-lists';
import type { CarnetItem } from '@/lib/carnet';
import { isProjectRecipe } from '@/lib/projects';
import { ficheCapRecette, itemsCap, type CapFiche } from '@/lib/carnet-cap';

// Au-delà, la page d'impression deviendrait lourde à rendre et à imprimer ;
// un carnet d'examen tient largement dans cette limite.
export const CAP_MAX_RECETTES = 80;

// Noms des préparations des recettes de projet (id du composant → nom). Lu
// sous la session : la RLS de `recipe_project_components` (propriétaire ou
// recette publiée) s'applique. Échec : on retombe sur le nom des étapes.
async function nomsComposants(recipes: RecipeFull[]): Promise<Map<string, Map<number, string>>> {
  const ids = recipes.filter(isProjectRecipe).map((r) => r.id);
  const out = new Map<string, Map<number, string>>();
  if (!ids.length) return out;
  const supabase = await createClient();
  const { data, error } = await supabase.from('recipe_project_components').select('id, name, recipe_id').in('recipe_id', ids);
  if (error) console.error('carnet CAP (composants):', error.message);
  for (const c of data ?? []) {
    if (!out.has(c.recipe_id)) out.set(c.recipe_id, new Map());
    out.get(c.recipe_id)!.set(c.id, c.name);
  }
  return out;
}

// Portée `texte` : aucune image n'est transportée, la feuille n'en affiche pas.
export async function getFicheCapRecette(id: string): Promise<CapFiche | null> {
  const recipe = await getRecipeFull(id, 'texte');
  if (!recipe) return null;
  const noms = await nomsComposants([recipe]);
  return ficheCapRecette(recipe, noms.get(recipe.id));
}

// Fiches dans l'ordre alphabétique des titres (un carnet se consulte comme
// un répertoire). Une recette illisible est ignorée sans erreur.
export async function getFichesCapRecettes(ids: string[]): Promise<CapFiche[]> {
  const recipes = await getRecipesFull([...new Set(ids)].slice(0, CAP_MAX_RECETTES), 'texte');
  const noms = await nomsComposants(recipes);
  return recipes
    .map((r) => ficheCapRecette(r, noms.get(r.id)))
    .sort((a, b) => a.titre.localeCompare(b.titre, 'fr'));
}

/**
 * Éléments de carnet d'une liste de recettes (JEP-376), dans l'ordre de la
 * liste (dernier ajout d'abord). Lecture sous la session : une recette devenue
 * illisible (dépubliée, privée, auteur désactivé) est masquée par la RLS et
 * comptée dans `indisponibles`, sa ligne de liste restant en base.
 */
export async function getItemsDeListe(
  ids: string[],
  carnet: CarnetItem[],
  userId: string,
): Promise<{ items: CarnetItem[]; indisponibles: number }> {
  if (!ids.length) return { items: [], indisponibles: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select(`${CARD_SELECT}, status, is_public, kind, project_stage`)
    .in('id', ids);
  if (error) console.error('getItemsDeListe:', error.message);
  // Recette d'un autre auteur devenue privée (`is_public = false`) : la RLS de
  // `recipes` l'écarte depuis le 26/10/2026 (sauf partage) ; ce filtre reste
  // en seconde protection, en gardant ce qui est partagé ou déjà au carnet.
  const duCarnet = new Set(carnet.map((i) => i.recipe.id));
  const lisibles = ((data as unknown as UserRecipeCard[] | null) ?? []).filter(
    (r) => r.author_id === userId || r.is_public !== false || duCarnet.has(r.id),
  );
  const rows = withAllergenNames(lisibles);
  const rang = new Map(ids.map((id, i) => [id, i]));
  rows.sort((a, b) => (rang.get(a.id) ?? 0) - (rang.get(b.id) ?? 0));
  return { items: itemsCap(rows, carnet, userId), indisponibles: error ? 0 : nombreIndisponibles(ids, rows.map((r) => r.id)) };
}

/** Rubrique « Carnet CAP » : la liste CAP du membre, remplie à la main. */
export async function getItemsCap(userId: string, carnet: CarnetItem[]): Promise<{ items: CarnetItem[]; indisponibles: number }> {
  return getItemsDeListe(await getIdsListeCap(userId), carnet, userId);
}
