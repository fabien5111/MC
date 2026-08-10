// Plan du site : l'accueil, la liste du blog, et chaque article publié.
//
// Volontairement borné au blog (et à l'accueil) : un plan de site couvrant
// aussi les recettes est un chantier à part (visibilité publique/privée,
// pagination sur des milliers d'entrées) que le handoff blog ne couvre pas.
import type { MetadataRoute } from 'next';
import { getSitemapArticles } from '@/lib/blog';
import { siteUrl } from '@/lib/site-url';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  // `sitemap.ts` s'exécute au build (comme `generateStaticParams`) : sans
  // variables Supabase posées à ce moment, on dégrade vers un plan de site
  // réduit à l'accueil et à la liste plutôt que de faire échouer le build.
  const articles = await getSitemapArticles().catch(() => []);

  return [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/blog`, changeFrequency: 'daily', priority: 0.8 },
    ...articles.map((a) => ({
      url: `${base}/blog/${a.slug}`,
      lastModified: a.updated_at,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
