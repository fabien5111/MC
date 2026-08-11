// Base URL absolue du site — nécessaire partout où une URL relative ne suffit
// pas (sitemap, flux RSS, OpenGraph, JSON-LD, URL canonique).
//
// Vercel expose automatiquement le domaine de production
// (`VERCEL_PROJECT_PRODUCTION_URL`) et celui du déploiement courant
// (`VERCEL_URL`) sans configuration à ajouter. `NEXT_PUBLIC_SITE_URL` reste un
// raccourci pour forcer un domaine si besoin (ex. un domaine personnalisé pas
// encore propagé aux variables Vercel).
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}
