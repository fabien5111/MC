import { describe, expect, it } from 'vitest';

import { dureeIso, recipeJsonLd } from '@/lib/recipe-jsonld';
import type { RecipeFull } from '@/lib/recipes';
import type { MergedIngredient } from '@/lib/recipe-view';
import type { RecipeComment } from '@/lib/reviews-data';

// Recette minimale valide (publiée, publique) — chaque test ne modifie que
// ce qui l'intéresse, motif déjà en place dans lib/contact.test.ts.
function recette(overrides: Partial<RecipeFull> = {}): RecipeFull {
  return {
    id: 'r1',
    title: 'Tarte au citron',
    description: 'Une tarte bien acidulée.',
    author_id: 'u1',
    is_public: true,
    status: 'published',
    kind: 'simple',
    project_stage: null,
    moderation_note: null,
    moderation_note_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    rating_avg: null,
    rating_count: null,
    measure_type: null,
    yield_qty: null,
    yield_unit: null,
    yield_desc: null,
    yield_notes: null,
    mold_type_id: null,
    mold_dims: null,
    prep_time: null,
    cook_time: null,
    wait_time: null,
    total_time: null,
    tips: null,
    source: null,
    source_url: null,
    video_url: null,
    serving_advice: null,
    hero_image_url: null,
    hero_image_original_url: null,
    hero_image_ai_retouched: false,
    profiles: { full_name: 'Fabien Chenu', avatar_url: null, username: 'fabien-chenu' },
    recipe_types: null,
    difficulties: null,
    mold_types: null,
    recipe_tags: [],
    recipe_utensils: [],
    ingredient_groups: [],
    recipe_steps: [],
    ...overrides,
  };
}

describe('dureeIso', () => {
  it('formate des minutes pures', () => {
    expect(dureeIso(45)).toBe('PT45M');
  });
  it('formate des heures pures', () => {
    expect(dureeIso(120)).toBe('PT2H');
  });
  it('formate heures + minutes', () => {
    expect(dureeIso(90)).toBe('PT1H30M');
  });
  it('renvoie null sous 1 minute ou valeur absente', () => {
    expect(dureeIso(0)).toBeNull();
    expect(dureeIso(null)).toBeNull();
    expect(dureeIso(undefined)).toBeNull();
  });
});

describe('recipeJsonLd', () => {
  const baseUrl = 'https://dev.jepatisse.com';

  it("n'émet rien pour une recette non publiée", () => {
    expect(recipeJsonLd(recette({ status: 'draft' }), [], [], baseUrl)).toBeNull();
  });

  it("n'émet rien pour une recette privée", () => {
    expect(recipeJsonLd(recette({ is_public: false }), [], [], baseUrl)).toBeNull();
  });

  it('émet les champs de base pour une recette publiée sans photo ni temps', () => {
    const jsonLd = recipeJsonLd(recette(), [], [], baseUrl);
    expect(jsonLd).not.toBeNull();
    expect(jsonLd).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: 'Tarte au citron',
      description: 'Une tarte bien acidulée.',
      url: 'https://dev.jepatisse.com/recette/r1',
      dateModified: '2026-02-01T00:00:00Z',
      author: { '@type': 'Person', name: 'Fabien Chenu' },
    });
    expect(jsonLd).not.toHaveProperty('image');
    expect(jsonLd).not.toHaveProperty('prepTime');
    expect(jsonLd).not.toHaveProperty('aggregateRating');
  });

  it('exclut une photo encore en data-URL (bascule Swift non finie)', () => {
    const jsonLd = recipeJsonLd(
      recette({ hero_image_url: 'data:image/webp;base64,AAAA' }),
      [],
      [],
      baseUrl,
    );
    expect(jsonLd).not.toHaveProperty('image');
  });

  it('inclut une photo déjà sur le stockage objet Swift', () => {
    const jsonLd = recipeJsonLd(
      recette({ hero_image_url: 'https://swift.example.com/jp-photos/abc.webp' }),
      [],
      [],
      baseUrl,
    );
    expect(jsonLd).toMatchObject({ image: ['https://swift.example.com/jp-photos/abc.webp'] });
  });

  it('ajoute isBasedOn pour une recette importée, sans changer author', () => {
    const jsonLd = recipeJsonLd(
      recette({ source: 'Le Larousse des desserts', source_url: 'https://exemple.com/tarte-citron' }),
      [],
      [],
      baseUrl,
    );
    expect(jsonLd).toMatchObject({
      author: { '@type': 'Person', name: 'Fabien Chenu' },
      isBasedOn: 'https://exemple.com/tarte-citron',
    });
  });

  it('calcule prepTime/cookTime/totalTime depuis effectiveTimes (avec repos inclus dans le total)', () => {
    // `total_time` non renseigné au niveau recette : `effectiveTimes` retombe
    // sur la somme des temps d'étape (repos compris), jamais sur
    // `prep_time + cook_time + wait_time` de la recette elle-même.
    const jsonLd = recipeJsonLd(
      recette({
        prep_time: 30,
        cook_time: 45,
        total_time: null,
        recipe_steps: [
          {
            id: 1,
            title: 'Étape',
            description: 'Texte',
            day_offset: 0,
            prep_time: 30,
            cook_time: 45,
            wait_time: 60,
            cook_temp: null,
            tips: null,
            video_url: null,
            sous_etapes: null,
            order_index: 1,
          },
        ],
      }),
      [],
      [],
      baseUrl,
    );
    expect(jsonLd).toMatchObject({
      prepTime: 'PT30M',
      cookTime: 'PT45M',
      totalTime: 'PT2H15M',
    });
  });

  it('émet recipeYield à partir de yieldInfo, quel que soit le mode de mesure', () => {
    const jsonLd = recipeJsonLd(
      recette({ measure_type: 'mold', yield_desc: '8 parts', mold_types: { name: 'moule à manqué', forme: null } }),
      [],
      [],
      baseUrl,
    );
    expect(jsonLd).toMatchObject({ recipeYield: '8 parts — moule à manqué' });
  });

  it('émet recipeCategory et keywords', () => {
    const jsonLd = recipeJsonLd(
      recette({
        recipe_types: { name: 'Tarte' },
        recipe_tags: [{ tags: { id: 1, name: 'Citron', slug: 'citron' } }, { tags: { id: 2, name: 'Facile', slug: 'facile' } }],
      }),
      [],
      [],
      baseUrl,
    );
    expect(jsonLd).toMatchObject({ recipeCategory: 'Tarte', keywords: 'Citron, Facile' });
  });

  it('émet la liste consolidée des ingrédients', () => {
    const ingredients: MergedIngredient[] = [
      { name: 'Beurre', qty: '100', unit: 'g', comment: null, ref_id: null, url: null, allergen: null },
      { name: 'Citron', qty: '3', unit: 'unité(s)', comment: null, ref_id: null, url: null, allergen: null },
    ];
    const jsonLd = recipeJsonLd(recette(), ingredients, [], baseUrl);
    expect(jsonLd).toMatchObject({ recipeIngredient: ['100 g Beurre', '3 unité(s) Citron'] });
  });

  it('construit un HowToStep par étape, sous-étapes concaténées dans text', () => {
    const jsonLd = recipeJsonLd(
      recette({
        recipe_steps: [
          {
            id: 1,
            title: 'Pâte sucrée',
            description: 'Sabler le beurre et la farine.',
            day_offset: 0,
            prep_time: null,
            cook_time: null,
            wait_time: null,
            cook_temp: null,
            tips: null,
            video_url: null,
            sous_etapes: ['Ajouter le sucre.', 'Incorporer l’œuf.'],
            order_index: 1,
          },
        ],
      }),
      [],
      [],
      baseUrl,
    );
    expect(jsonLd?.recipeInstructions).toEqual([
      {
        '@type': 'HowToStep',
        name: 'Pâte sucrée',
        text: 'Sabler le beurre et la farine. Ajouter le sucre. Incorporer l’œuf.',
      },
    ]);
  });

  it('replie sur le titre quand une étape n’a pas de description ni de sous-étapes', () => {
    const jsonLd = recipeJsonLd(
      recette({
        recipe_steps: [
          {
            id: 1,
            title: 'Repos au frais',
            description: null,
            day_offset: 0,
            prep_time: null,
            cook_time: null,
            wait_time: null,
            cook_temp: null,
            tips: null,
            video_url: null,
            sous_etapes: null,
            order_index: 1,
          },
        ],
      }),
      [],
      [],
      baseUrl,
    );
    expect(jsonLd?.recipeInstructions).toEqual([{ '@type': 'HowToStep', name: 'Repos au frais', text: 'Repos au frais' }]);
  });

  it('omet une étape sans titre ni description', () => {
    const jsonLd = recipeJsonLd(
      recette({
        recipe_steps: [
          {
            id: 1,
            title: null,
            description: null,
            day_offset: 0,
            prep_time: null,
            cook_time: null,
            wait_time: null,
            cook_temp: null,
            tips: null,
            video_url: null,
            sous_etapes: null,
            order_index: 1,
          },
        ],
      }),
      [],
      [],
      baseUrl,
    );
    expect(jsonLd?.recipeInstructions).toBeUndefined();
  });

  it('émet aggregateRating uniquement si rating_count > 0', () => {
    expect(recipeJsonLd(recette({ rating_avg: 4.5, rating_count: 0 }), [], [], baseUrl)).not.toHaveProperty(
      'aggregateRating',
    );
    const jsonLd = recipeJsonLd(recette({ rating_avg: 4.5, rating_count: 12 }), [], [], baseUrl);
    expect(jsonLd).toMatchObject({
      aggregateRating: { '@type': 'AggregateRating', ratingValue: 4.5, reviewCount: 12 },
    });
  });

  it('émet un Review par avis commenté avec note, ignore les avis sans note', () => {
    const comments: RecipeComment[] = [
      {
        id: 1,
        content: 'Parfait, merci !',
        rating: 5,
        created_at: '2026-03-01T00:00:00Z',
        photo_urls: [],
        profiles: { full_name: 'Alice', avatar_url: null, username: 'alice' },
      },
      {
        id: 2,
        content: 'Sans note',
        rating: null,
        created_at: '2026-03-02T00:00:00Z',
        photo_urls: [],
        profiles: null,
      },
    ];
    const jsonLd = recipeJsonLd(recette(), [], comments, baseUrl);
    expect(jsonLd?.review).toEqual([
      {
        '@type': 'Review',
        author: { '@type': 'Person', name: 'Alice' },
        reviewBody: 'Parfait, merci !',
        reviewRating: { '@type': 'Rating', ratingValue: 5 },
      },
    ]);
  });
});
