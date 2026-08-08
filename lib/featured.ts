// Recette mise en avant sur l'accueil (« Recette de la Semaine ») — table
// `featured_recipes` (plages de dates programmées par l'admin, sans
// chevauchement possible — cf. contrainte d'exclusion en base).
//
// `featured_recipes` n'existe pas encore dans lib/database.types.ts tant que
// la migration SQL n'a pas été appliquée et les types régénérés (cf.
// CLAUDE.md, `npm run gen:types`) : accès non typé (cast local), comme les
// tables dynamiques de ListsManager.
import { createClient } from '@/lib/supabase/server';
import { CARD_SELECT, type RecipeCard } from '@/lib/recipes';

type FeaturedTable = {
  select: (cols: string) => {
    lte: (c: string, v: string) => {
      gte: (c: string, v: string) => {
        order: (c: string, o: { ascending: boolean }) => {
          limit: (n: number) => { maybeSingle: () => Promise<{ data: { recipe_id: string } | null }> };
        };
      };
    };
    order: (c: string, o: { ascending: boolean }) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
  };
};

// Recette active à la date du jour (lecture publique, accueil). `null` si
// aucune plage ne couvre aujourd'hui, ou si la recette programmée n'est plus
// publique/publiée entre-temps — l'appelant se replie alors sur son propre
// défaut (ex. recette la plus récente).
export async function getActiveFeaturedRecipe(): Promise<RecipeCard | null> {
  const supabase = await createClient();
  const table = supabase.from('featured_recipes' as never) as unknown as FeaturedTable;
  const today = new Date().toISOString().slice(0, 10);

  const { data: featured } = await table
    .select('recipe_id')
    .lte('start_date', today)
    .gte('end_date', today)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!featured) return null;

  const { data: recipe } = await supabase
    .from('recipes')
    .select(CARD_SELECT)
    .eq('id', featured.recipe_id)
    .eq('status', 'published')
    .eq('is_public', true)
    .maybeSingle();
  return (recipe as unknown as RecipeCard) ?? null;
}

export type FeaturedRecipeRow = {
  id: number;
  recipe_id: string;
  start_date: string;
  end_date: string;
  recipes: {
    id: string;
    title: string;
    // Vignette servie par la route image (cf. `cardHeroSrc`), plus de data-URL.
    has_hero_image: boolean;
    updated_at: string | null;
    created_at: string | null;
    status: string;
    is_public: boolean | null;
  } | null;
};

// Toutes les plages programmées (admin), passées, en cours et à venir.
export async function getFeaturedRecipesAdmin(): Promise<FeaturedRecipeRow[]> {
  const supabase = await createClient();
  const table = supabase.from('featured_recipes' as never) as unknown as FeaturedTable;
  const { data, error } = await table
    .select('id, recipe_id, start_date, end_date, recipes(id, title, has_hero_image, updated_at, created_at, status, is_public)')
    .order('start_date', { ascending: true });
  if (error) console.error('getFeaturedRecipesAdmin:', error.message);
  return (data as unknown as FeaturedRecipeRow[]) ?? [];
}
