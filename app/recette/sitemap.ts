// Plan du site des recettes (JEP-246), servi en `/recette/sitemap.xml` et cité
// par `app/robots.ts`. Seules les recettes publiées et publiques y figurent
// (`recetteIndexable`, la même règle que le `noindex` de la fiche).
//
// Décidé sur `Host`, comme `robots.ts` : vide sur `www` tant que la page
// d'attente y est posée, complet ailleurs (dev, aperçu), pour vérification.
import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';
import { ORIGINE_CANONIQUE } from '@/lib/indexation.mjs';
import { entreesSitemapRecettes, sitemapEnAttente } from '@/lib/indexation-recettes';
import { getSitemapRecettes } from '@/lib/indexation-recettes-data';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = (await headers()).get('host');
  if (sitemapEnAttente(host, process.env.COMING_SOON)) return [];
  return entreesSitemapRecettes(await getSitemapRecettes(), ORIGINE_CANONIQUE);
}
