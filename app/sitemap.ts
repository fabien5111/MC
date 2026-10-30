// Plan du site : l'accueil, la liste du blog, chaque article publié et les
// pages légales.
//
// Les recettes ont leur propre plan (`app/recette/sitemap.ts`, JEP-246), cité
// à côté de celui-ci par `app/robots.ts`.
import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';
import { getSitemapArticles } from '@/lib/blog';
import { ORIGINE_CANONIQUE } from '@/lib/indexation.mjs';
import { sitemapEnAttente } from '@/lib/indexation-recettes';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Toujours l'origine canonique, quel que soit le domaine qui sert le plan
  // (JEP-274) : `siteUrl()` suit l'environnement et donnerait des URL `dev`.
  const base = ORIGINE_CANONIQUE;
  // `sitemap.ts` s'exécute au build (comme `generateStaticParams`) : sans
  // variables Supabase posées à ce moment, on dégrade vers un plan de site
  // réduit à l'accueil et à la liste plutôt que de faire échouer le build.
  // Page d'attente sur `www` (JEP-246) : les articles y seraient servis en
  // `noindex`, on ne les annonce donc pas encore.
  const enAttente = sitemapEnAttente((await headers()).get('host'), process.env.COMING_SOON);
  const articles = enAttente ? [] : await getSitemapArticles().catch(() => []);

  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    ...(enAttente ? [] : [{ url: `${base}/blog`, changeFrequency: 'daily' as const, priority: 0.8 }]),
    { url: `${base}/mentions-legales`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${base}/confidentialite`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${base}/cgu`, changeFrequency: 'yearly', priority: 0.1 },
    { url: `${base}/cgv`, changeFrequency: 'yearly', priority: 0.1 },
    ...articles.map((a) => ({
      url: `${base}/blog/${a.slug}`,
      lastModified: a.updated_at,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
