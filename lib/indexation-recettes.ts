// Référencement des recettes (JEP-246) — logique pure, utilisable par le
// sitemap (`app/recette/sitemap.ts`) comme par la fiche (`/recette/[id]`).
//
// **Une seule règle d'indexabilité** : le plan du site et la balise `noindex`
// de la fiche la lisent tous deux, sans quoi l'un pourrait annoncer à Google
// une page que l'autre lui demande d'oublier.
import type { MetadataRoute } from 'next';
import { estHoteIndexable } from '@/lib/indexation.mjs';
import { isProjectDraft, type ProjectMarks } from '@/lib/projects';

export type RecetteIndexation = ProjectMarks & {
  status: string | null;
  is_public: boolean | null;
};

// Ligne lue pour le plan du site : le strict nécessaire, jamais `select('*')`.
export type LigneSitemapRecette = RecetteIndexation & {
  id: string;
  updated_at: string | null;
  hero_image_url: string | null;
};

// Sous la limite de 50 000 adresses par fichier du protocole sitemap. Atteint,
// le découpage (`generateSitemaps`) devient un ticket à part.
export const SITEMAP_RECETTES_MAX = 45_000;

/**
 * Vrai si la recette peut être indexée : publiée, publique, et pas un projet
 * en cours. Le masquage d'un auteur désactivé est porté par la RLS (une telle
 * recette n'est jamais lue au rôle `anon`).
 */
export function recetteIndexable(r: RecetteIndexation | null | undefined): boolean {
  if (!r) return false;
  return r.status === 'published' && r.is_public !== false && !isProjectDraft(r);
}

/**
 * Vrai si le plan du site doit taire ses adresses de contenu : le domaine
 * canonique sert la page d'attente (`COMING_SOON`), qui porte `noindex` sur
 * toute adresse. Sur dev ou un aperçu, le plan reste complet — ces domaines
 * sont fermés aux moteurs par ailleurs (robots.txt + `X-Robots-Tag`), et c'est
 * là qu'on vérifie son contenu avant l'ouverture.
 */
export function sitemapEnAttente(host: string | null | undefined, comingSoon: string | undefined): boolean {
  return comingSoon === 'true' && estHoteIndexable(host);
}

/** Image retenue pour le plan du site : une URL https, jamais une data-URL. */
export function imageSitemap(url: string | null | undefined): string | null {
  return url && url.startsWith('https://') ? url : null;
}

/** Entrées du plan du site, adresses toujours sur l'origine `base`. */
export function entreesSitemapRecettes(rows: LigneSitemapRecette[], base: string): MetadataRoute.Sitemap {
  return rows.filter(recetteIndexable).map((r) => {
    const image = imageSitemap(r.hero_image_url);
    return {
      url: `${base}/recette/${r.id}`,
      ...(r.updated_at ? { lastModified: r.updated_at } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      ...(image ? { images: [image] } : {}),
    };
  });
}
