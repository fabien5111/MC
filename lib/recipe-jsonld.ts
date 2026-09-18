// Données structurées Schema.org (JSON-LD) de type `Recipe`, pour les moteurs
// de recherche (rich snippets) — JEP-90. Fonction pure, sans effet de bord :
// prend en entrée ce que la fiche recette (`app/recette/[id]/page.tsx`) a
// déjà chargé, ne fait aucune requête, testable sans base ni serveur. Même
// séparation que `lib/recipe-view.ts`.
//
// Motif repris de `app/blog/[slug]/page.tsx` (seul autre JSON-LD du site) :
// un objet simple, sérialisé par l'appelant avec `JSON.stringify(...).replace(/</g, '\\u003c')`.
//
// N'émet que ce qui est déjà visible à l'écran (exigence Google) et vérifiable
// sans base de données. Volontairement absents : `datePublished` (aucune
// colonne dédiée — cf. CLAUDE.md, arbitrage JEP-90 §3), `nutrition` (aucune
// donnée en base), `video` (un `VideoObject` sans miniature ni date
// d'upload produirait une erreur de validation, cf. arbitrage §7).
import type { RecipeFull } from '@/lib/recipes';
import type { MergedIngredient } from '@/lib/recipe-view';
import type { RecipeComment } from '@/lib/reviews-data';
import { effectiveTimes, yieldInfo } from '@/lib/recipe-view';
import { estUrlStockage } from '@/lib/storage';

/**
 * Minutes → durée ISO 8601 (`PT1H30M`), format attendu par Schema.org pour
 * `prepTime` / `cookTime` / `totalTime`. `null` sous 1 minute ou valeur
 * absente — une durée à `PT0M` n'aide aucun moteur de recherche.
 */
export function dureeIso(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `PT${m}M`;
  if (m === 0) return `PT${h}H`;
  return `PT${h}H${m}M`;
}

// Une recette copiée d'ailleurs (§ « Import IA », `source` / `source_url`)
// n'a pas le membre pour auteur au sens Schema.org — arbitrage §1(b) : le
// membre reste `author` (c'est lui qui a saisi/importé la fiche sur le
// site), la provenance est ajoutée via `isBasedOn` quand `source_url` est
// renseignée.
type JsonLdValue = string | number | boolean | JsonLdObject | JsonLdValue[];
type JsonLdObject = { [key: string]: JsonLdValue | undefined };

export function recipeJsonLd(
  recipe: RecipeFull,
  ingredients: MergedIngredient[],
  comments: RecipeComment[],
  baseUrl: string,
): JsonLdObject | null {
  // N'émettre que pour une recette réellement publique — un brouillon, une
  // recette en modération ou un partage privé n'a rien à déclarer aux
  // moteurs de recherche (arbitrage §8 ; la page pose `robots: noindex` dans
  // ces mêmes cas, cf. `generateMetadata`).
  if (recipe.status !== 'published' || recipe.is_public === false) return null;

  const times = effectiveTimes(recipe);
  const prepTime = dureeIso(times.prep);
  const cookTime = dureeIso(times.cook);
  const totalTime = dureeIso(times.total);
  const yInfo = yieldInfo(recipe);
  const steps = [...(recipe.recipe_steps || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  const image =
    recipe.hero_image_url && estUrlStockage(recipe.hero_image_url) ? recipe.hero_image_url : undefined;

  const authorName = recipe.profiles?.full_name || recipe.profiles?.username || undefined;

  const recipeIngredient = ingredients
    .map((it) => [it.qty, it.unit, it.name].filter(Boolean).join(' ').trim())
    .filter(Boolean);

  // Un `HowToStep` par étape (arbitrage §6a) : sous-étapes concaténées dans
  // `text`, lecture linéaire — pas de `HowToSection` par jour, que les
  // moteurs de recherche exploitent mal. `text` est requis par Schema.org :
  // une étape sans description (seulement un titre) replie dessus.
  const recipeInstructions = steps
    .map((s) => {
      const texte = [s.description, ...(s.sous_etapes || [])].filter(Boolean).join(' ');
      const text = texte || s.title;
      if (!text) return null;
      return { '@type': 'HowToStep', ...(s.title ? { name: s.title } : {}), text } as JsonLdObject;
    })
    .filter((s): s is JsonLdObject => s !== null);

  const keywords = (recipe.recipe_tags || [])
    .map((t) => t.tags?.name)
    .filter((n): n is string => Boolean(n));

  const ratingCount = recipe.rating_count || 0;
  const commentsWithRating = comments.filter(
    (c): c is RecipeComment & { rating: number } => c.rating != null,
  );

  return {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    ...(recipe.description ? { description: recipe.description } : {}),
    ...(image ? { image: [image] } : {}),
    url: `${baseUrl}/recette/${recipe.id}`,
    ...(recipe.updated_at ? { dateModified: recipe.updated_at } : {}),
    ...(authorName ? { author: { '@type': 'Person', name: authorName } } : {}),
    ...(recipe.source_url ? { isBasedOn: recipe.source_url } : {}),
    ...(prepTime ? { prepTime } : {}),
    ...(cookTime ? { cookTime } : {}),
    ...(totalTime ? { totalTime } : {}),
    ...(yInfo ? { recipeYield: yInfo.value } : {}),
    ...(recipe.recipe_types?.name ? { recipeCategory: recipe.recipe_types.name } : {}),
    ...(keywords.length ? { keywords: keywords.join(', ') } : {}),
    ...(recipeIngredient.length ? { recipeIngredient } : {}),
    ...(recipeInstructions.length ? { recipeInstructions } : {}),
    ...(ratingCount > 0 && recipe.rating_avg
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: recipe.rating_avg,
            reviewCount: ratingCount,
          },
        }
      : {}),
    ...(commentsWithRating.length
      ? {
          review: commentsWithRating.map((c) => ({
            '@type': 'Review',
            ...(c.profiles?.full_name ? { author: { '@type': 'Person', name: c.profiles.full_name } } : {}),
            reviewBody: c.content,
            reviewRating: { '@type': 'Rating', ratingValue: c.rating },
          })),
        }
      : {}),
  };
}
