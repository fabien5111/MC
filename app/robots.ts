// robots.txt décidé par domaine (JEP-274), sur l'en-tête `Host` — comme
// `COMING_SOON` dans le middleware. `www` seul est explorable ; tout autre
// domaine (dev, aperçu de PR, *.vercel.app) est fermé. Ce fichier ne suffit pas
// seul (il interdit l'exploration, pas l'indexation d'une page déjà connue) :
// l'en-tête `X-Robots-Tag` posé par next.config.mjs fait le reste.
import { headers } from 'next/headers';
import type { MetadataRoute } from 'next';
import { estHoteIndexable, ORIGINE_CANONIQUE } from '@/lib/indexation.mjs';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host');
  if (!estHoteIndexable(host)) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${ORIGINE_CANONIQUE}/sitemap.xml`,
  };
}
