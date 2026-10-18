// Carnet CAP (JEP-6) — lectures serveur. La logique (ce qui a le droit de
// sortir sur la feuille) est dans `lib/carnet-cap.ts`, pure.
import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { CARD_SELECT, getRecipeFull, getRecipesFull, withAllergenNames, type RecipeFull, type UserRecipeCard } from '@/lib/recipes';
import { getTags } from '@/lib/data/reference';
import type { CarnetItem } from '@/lib/carnet';
import { isProjectRecipe } from '@/lib/projects';
import { ficheCapRecette, itemsCap, tagCapId, type CapFiche } from '@/lib/carnet-cap';

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

// Plafond de la rubrique : une grille déjà entièrement chargée côté serveur
// (cf. `CarnetContent`), comme le reste du carnet.
const CAP_MAX_RUBRIQUE = 300;

/**
 * Rubrique « Carnet CAP » : toutes les recettes étiquetées « Recette CAP »
 * auxquelles le membre a accès. La lecture passe par sa session — la RLS décide
 * (les siennes, les partagées, les publiées et publiques des autres), jamais le
 * code. `tagTrouve` faux = le tag n'existe pas encore au back-office : l'écran
 * le dit plutôt que d'annoncer une rubrique vide.
 */
export async function getItemsCap(
  userId: string,
  carnet: CarnetItem[],
): Promise<{ items: CarnetItem[]; tagTrouve: boolean }> {
  const tagId = tagCapId(await getTags());
  if (tagId == null) return { items: [], tagTrouve: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select(`${CARD_SELECT}, status, is_public, kind, project_stage, recipe_tags!inner(tag_id)`)
    .eq('recipe_tags.tag_id', tagId)
    .order('created_at', { ascending: false })
    .limit(CAP_MAX_RUBRIQUE);
  if (error) console.error('getItemsCap:', error.message);
  const rows = withAllergenNames((data as unknown as UserRecipeCard[] | null) ?? []);
  return { items: itemsCap(rows, carnet, userId), tagTrouve: true };
}
