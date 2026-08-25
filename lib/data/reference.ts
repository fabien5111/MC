// Accès unique aux **données de référence** (référentiels), mis en cache.
//
// Raison d'être : ces tables étaient rapatriées à chaque navigation alors que
// leur contenu ne bouge pas d'une semaine à l'autre. Relevé `pg_stat_statements`
// du 25/08/2026 (cf. docs/audit-egress-supabase.md) : **22 920 appels**, soit
// 51 % du trafic REST — plus que le profil, l'impersonation et les payloads
// réunis. Le multiplicateur est `app/recette/[id]/page.tsx`, qui charge cinq
// référentiels par consultation de fiche, plus `tags` via le `Header`.
//
// Trois mécanismes se superposent, dans cet ordre :
//
// 1. **`unstable_cache`** (Next 15.1 — pas la directive `use cache`, réservée
//    à 15.3+) : cache serveur partagé entre requêtes ET entre visiteurs, avec
//    étiquettes pour l'invalidation. Motif déjà éprouvé dans `lib/blog.ts`.
// 2. **`cache()` React** par-dessus : déduplique les appels multiples d'un
//    même rendu (plusieurs composants demandant `units` ne produisent qu'une
//    lecture), y compris quand on retombe sur le repli ci-dessous.
// 3. **Un repli sur le client à cookies** si la lecture publique échoue —
//    voir « Le référentiel vide » plus bas.
//
// **Client sans session obligatoire.** `unstable_cache` interdit toute API de
// requête dans son callback : `lib/supabase/server.ts` lit les cookies, il est
// donc inutilisable ici. On passe par `createPublicClient()`, ce qui a une
// conséquence à connaître : la lecture se fait au rôle `anon` et ne voit que
// ce que la RLS ouvre à tout le monde. C'est acceptable pour ces tables-ci —
// et vérifiable : `/`, `/recherche` et `/recette/[id]` sont des pages
// publiques (absentes de `PROTECTED_PREFIXES`, aucun `requireUser`) qui lisent
// déjà `tags`, `site_settings`, `units`, `mold_types`, `allergens` et
// `ingredient_conversions` pour un visiteur déconnecté. Si ces tables
// n'étaient pas lisibles au rôle `anon`, l'accueil serait déjà cassé.
//
// **Le référentiel vide est un symptôme, jamais un résultat.** `ingredient_refs`
// et `utensils` ne sont, eux, lus que depuis des écrans authentifiés : leur
// lisibilité au rôle `anon` n'est pas démontrable depuis le dépôt. Or une RLS
// qui refuse ne renvoie pas une erreur mais **zéro ligne** — un cache posé
// dessus figerait une liste vide pendant 24 h, silencieusement. D'où la règle :
// un référentiel qui revient vide n'est pas mis en cache, et la lecture est
// refaite avec le client à cookies (le comportement d'avant ce module). Le
// gain est perdu pour cette table-là, jamais l'affichage. `site_settings` est
// la seule exception (`allowEmpty`) : n'avoir aucune bannière est un état
// normal du site, et sa lisibilité publique est démontrée par l'accueil.
//
// **Une seule lecture par table, plusieurs formes en sortie.** Le relevé
// montrait trois requêtes distinctes sur `tags`, deux sur `allergens`, trois
// sur `ingredient_refs`, deux sur `site_settings` — la même table, découpée
// différemment selon l'appelant. Ces tables sont petites : on en lit les
// colonnes utiles **une fois**, et les formes attendues par chaque appelant
// (`getTags`, `getHomeCategories`, `getTagBySlug`…) sont dérivées en mémoire.
// Ne pas rajouter d'accesseur qui interroge la base directement : c'est ce qui
// avait produit les doublons.
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPublicClient } from '@/lib/supabase/public';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import type { ConversionRef, IngredientRefOption } from '@/lib/ingredient-conversions';

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Étiquettes et durées de validité
// ---------------------------------------------------------------------------

// Étiquette générale : invalide TOUS les référentiels d'un coup. C'est ce
// qu'appelle `/api/admin/reference/revalidate` sans nom de table.
export const REFERENCE_TAG = 'reference';

// Étiquette par table (`reference:tags`) — invalidation ciblée.
export const referenceTag = (table: string) => `reference:${table}`;

// Durées calées sur la volatilité réelle (cf. spec § 5). Elles ne sont qu'un
// filet : une modification depuis le back-office invalide l'étiquette
// immédiatement, la durée ne joue que si l'invalidation n'a pas eu lieu.
const JOUR = 86_400; // volatilité faible : units, difficulties, allergens…
const HEURE = 3_600; // volatilité moyenne : tags, ingredient_refs
const COURT = 300; // site_settings (bannières d'accueil)

// ---------------------------------------------------------------------------
// Fabrique d'accesseurs
// ---------------------------------------------------------------------------

class ReferentielVide extends Error {}

/**
 * Construit un accesseur mis en cache pour une table de référence.
 *
 * `query` reçoit un client Supabase et doit **lever** en cas d'erreur : ce qui
 * lève n'est pas mis en cache par `unstable_cache`, et bascule sur le repli.
 */
function referenceAccessor<T>({
  table,
  revalidate,
  query,
  allowEmpty = false,
}: {
  table: string;
  revalidate: number;
  query: (sb: Client) => Promise<T[]>;
  allowEmpty?: boolean;
}): () => Promise<T[]> {
  const lireEnCache = unstable_cache(
    async () => {
      const rows = await query(createPublicClient());
      if (!allowEmpty && rows.length === 0) throw new ReferentielVide(table);
      return rows;
    },
    ['reference', table],
    { revalidate, tags: [REFERENCE_TAG, referenceTag(table)] },
  );

  return cache(async (): Promise<T[]> => {
    try {
      return await lireEnCache();
    } catch {
      // Repli : lecture non mise en cache, avec la session de l'appelant —
      // exactement ce que faisait le code avant ce module.
      try {
        return await query(await createClient());
      } catch (err) {
        console.error(`reference/${table}:`, err);
        return [];
      }
    }
  });
}

// Déballe une réponse PostgREST en levant sur erreur (cf. `query` ci-dessus).
function lignes<T>({ data, error }: { data: T[] | null; error: { message: string } | null }): T[] {
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// tags — une lecture, trois formes
// ---------------------------------------------------------------------------

export type Tag = Pick<Database['public']['Tables']['tags']['Row'], 'id' | 'name' | 'slug'>;
export type HomeCategory = Tag & { category_picto: string | null };
type TagRow = HomeCategory & { show_on_home: boolean | null };

const lireTags = referenceAccessor<TagRow>({
  table: 'tags',
  revalidate: HEURE,
  query: async (sb) =>
    lignes(
      await sb
        .from('tags')
        .select('id, name, slug, category_picto, show_on_home')
        .eq('status', 'published')
        .order('name'),
    ),
});

export const getTags = async (): Promise<Tag[]> =>
  (await lireTags()).map(({ id, name, slug }) => ({ id, name, slug }));

// Tags promus en catégories d'accueil : case « Afficher sur l'accueil » cochée
// ET picto renseigné — les deux conditions sont requises. Tri alphabétique
// français (accents inclus), fait ici et non en SQL : la lecture est partagée.
export const getHomeCategories = async (): Promise<HomeCategory[]> =>
  (await lireTags())
    .filter((t) => t.show_on_home && !!t.category_picto)
    .map(({ id, name, slug, category_picto }) => ({ id, name, slug, category_picto }))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

// Nom d'un tag à partir de son slug — /recherche affiche le libellé de la
// catégorie sélectionnée. Filtré en mémoire : la table entière est déjà là,
// une requête par slug n'apporterait rien.
export const getTagBySlug = async (slug: string): Promise<Tag | null> => {
  const t = (await lireTags()).find((r) => r.slug === slug);
  return t ? { id: t.id, name: t.name, slug: t.slug } : null;
};

// ---------------------------------------------------------------------------
// recipe_types
// ---------------------------------------------------------------------------

export type RecipeType = Pick<Database['public']['Tables']['recipe_types']['Row'], 'id' | 'name' | 'slug'>;

export const getRecipeTypes = referenceAccessor<RecipeType>({
  table: 'recipe_types',
  revalidate: HEURE,
  query: async (sb) =>
    lignes(await sb.from('recipe_types').select('id, name, slug').eq('status', 'published').order('name')),
});

// ---------------------------------------------------------------------------
// difficulties / units / mold_types
// ---------------------------------------------------------------------------

export type Difficulty = Database['public']['Tables']['difficulties']['Row'];
export type Unit = Database['public']['Tables']['units']['Row'];
export type MoldType = Database['public']['Tables']['mold_types']['Row'];

// Colonnes énumérées (jamais `select('*')`, cf. spec § 8) — la liste couvre
// exactement le type `Row` correspondant.
export const getDifficulties = referenceAccessor<Difficulty>({
  table: 'difficulties',
  revalidate: JOUR,
  query: async (sb) =>
    lignes(await sb.from('difficulties').select('id, level, name, status, tooltip').order('level')),
});

export const getUnits = referenceAccessor<Unit>({
  table: 'units',
  revalidate: JOUR,
  query: async (sb) =>
    lignes(await sb.from('units').select('id, name, abbreviation, status, tooltip').order('name')),
});

export const getMoldTypes = referenceAccessor<MoldType>({
  table: 'mold_types',
  revalidate: JOUR,
  query: async (sb) =>
    lignes(
      await sb
        .from('mold_types')
        .select('id, name, slug, forme, status, tooltip, created_at')
        .eq('status', 'published')
        .order('name'),
    ),
});

// ---------------------------------------------------------------------------
// allergens — une lecture, deux formes
// ---------------------------------------------------------------------------

export type AllergenRef = { id: number; name: string; picto: string | null; tooltip: string | null };

const lireAllergens = referenceAccessor<AllergenRef>({
  table: 'allergens',
  revalidate: JOUR,
  query: async (sb) =>
    lignes(await sb.from('allergens').select('id, name, picto, tooltip').order('name')),
});

// Allergènes avec picto + infobulle : retrouve le visuel d'un allergène saisi
// en texte libre dans une recette (rapprochement par nom).
export const getAllergensWithPicto = async (): Promise<AllergenRef[]> =>
  (await lireAllergens()).filter((a) => a.name);

// Même table, forme réduite : autocomplétion du champ « Allergène » de
// l'éditeur. Ne déclenche aucune seconde lecture.
export const getAllergenRefs = async (): Promise<{ id: number; name: string }[]> =>
  (await lireAllergens()).filter((a) => a.name).map(({ id, name }) => ({ id, name }));

// ---------------------------------------------------------------------------
// ingredient_refs — une lecture, trois formes
// ---------------------------------------------------------------------------

type IngredientRefRow = { id: number; name: string; allergen: string | null };

const lireIngredientRefs = referenceAccessor<IngredientRefRow>({
  table: 'ingredient_refs',
  revalidate: HEURE,
  query: async (sb) =>
    lignes(await sb.from('ingredient_refs').select('id, name, allergen').order('name')),
});

// Ingrédients de référence (id + libellé) : rapproche un article saisi à la
// main de la table de référence, pour bénéficier des conversions.
export const getIngredientRefsList = async (): Promise<IngredientRefOption[]> =>
  (await lireIngredientRefs()).filter((r) => r.name).map(({ id, name }) => ({ id, name }));

// Libellés seuls (autocomplétion de la relecture).
export const getIngredientRefNames = async (): Promise<string[]> =>
  (await lireIngredientRefs()).map((r) => r.name).filter(Boolean);

// Nom normalisé → libellé de son allergène. Toutes les entrées sont incluses
// (chaîne vide si pas d'allergène) pour que le choix d'un ingrédient
// synchronise toujours le champ.
export const getIngredientRefAllergens = async (): Promise<Record<string, string>> => {
  const map: Record<string, string> = {};
  for (const r of await lireIngredientRefs()) {
    if (r.name) map[r.name.trim().toLowerCase()] = r.allergen || '';
  }
  return map;
};

// ---------------------------------------------------------------------------
// utensils
// ---------------------------------------------------------------------------

const lireUtensils = referenceAccessor<{ name: string }>({
  table: 'utensils',
  revalidate: JOUR,
  query: async (sb) => lignes(await sb.from('utensils').select('name').order('name')),
});

export const getUtensilRefNames = async (): Promise<string[]> =>
  (await lireUtensils()).map((r) => r.name).filter(Boolean);

// ---------------------------------------------------------------------------
// ingredient_conversions
// ---------------------------------------------------------------------------

export const getIngredientConversions = referenceAccessor<ConversionRef>({
  table: 'ingredient_conversions',
  revalidate: JOUR,
  query: async (sb) =>
    lignes(
      await sb
        .from('ingredient_conversions')
        .select('ingredient_ref_id, from_quantity, from_unit_id, to_quantity, to_unit_id'),
    ),
});

// ---------------------------------------------------------------------------
// site_settings — lecture publique uniquement
// ---------------------------------------------------------------------------

// Clés lues par les pages publiques : bannières d'accueil et photo par défaut
// des cartes recette. Volontairement énumérées — le back-office lit ses
// propres clés par `getSiteSettings` (lib/site.ts), non mis en cache : un
// écran d'administration ne pèse rien et n'a pas à voir une valeur périmée.
const CLES_PUBLIQUES = [
  'banner_home_web',
  'banner_home_tablette',
  'banner_home_mobile',
  'recipe_default_photo',
] as const;

const lireSettings = referenceAccessor<{ key: string; value: string | null }>({
  table: 'site_settings',
  revalidate: COURT,
  // N'avoir aucune bannière est un état normal du site : une lecture vide est
  // ici un résultat, pas un symptôme (cf. en-tête de fichier).
  allowEmpty: true,
  query: async (sb) =>
    lignes(
      await sb
        .from('site_settings')
        .select('key, value')
        .in('key', CLES_PUBLIQUES as unknown as string[]),
    ),
});

export const getPublicSiteSettings = async (): Promise<Record<string, string>> =>
  Object.fromEntries(
    (await lireSettings()).map((s) => [s.key, typeof s.value === 'string' ? s.value : String(s.value ?? '')]),
  );

// Photo par défaut des cartes recette (accueil, recherche, carnet, profil,
// fiche recette) quand l'auteur n'a fourni aucune photo.
export const getRecipeDefaultPhoto = async (): Promise<string | null> =>
  (await getPublicSiteSettings()).recipe_default_photo || null;
