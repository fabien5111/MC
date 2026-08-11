// Détection des articles dépubliés, pour le 410 servi par `middleware.ts`.
//
// Une page (Server Component) ne peut renvoyer que 404 (`notFound()`) ou une
// redirection — rien d'équivalent pour un code 410. Le middleware, lui,
// contrôle la réponse HTTP en entier : c'est le seul endroit du site qui peut
// réellement répondre 410. Ce module y est donc appelé, PAS depuis
// `app/blog/[slug]/page.tsx`.
//
// Cache mémoire (pas `unstable_cache`, dont l'usage en middleware n'est pas
// garanti) : la liste des slugs dépubliés est petite et change rarement, un
// TTL de 60 s aligné sur le reste des lectures publiques du blog
// (cf. `lib/blog.ts`) suffit largement à amortir l'appel réseau.
import { NextResponse } from 'next/server';
import { withBlogSchema } from '@/lib/blog-types';
import { createPublicClient } from '@/lib/supabase/public';

const TTL_MS = 60_000;
let cache: { slugs: Set<string>; expiresAt: number } | null = null;

async function fetchGoneSlugs(): Promise<Set<string>> {
  const supabase = withBlogSchema(createPublicClient());
  const { data, error } = await supabase.rpc('gone_article_slugs');
  if (error || !data) return new Set();
  return new Set(data.map((r) => r.slug));
}

// Tolérant aux pannes, comme `getImpersonationContext` : tant que la
// migration du 410 (fonction `gone_article_slugs`) n'est pas passée en base,
// ou en cas d'incident réseau, le middleware ne doit jamais faire tomber
// TOUTES les pages d'article — au pire, un article dépublié réapparaît en 404
// au lieu de 410 le temps de la corriger.
export async function isGoneSlug(slug: string): Promise<boolean> {
  try {
    if (!cache || cache.expiresAt <= Date.now()) {
      cache = { slugs: await fetchGoneSlugs(), expiresAt: Date.now() + TTL_MS };
    }
    return cache.slugs.has(slug);
  } catch (err) {
    console.error('Middleware blog : échec de la détection des articles dépubliés', err);
    return false;
  }
}

// Route `/blog/<slug>` uniquement — jamais `/blog`, `/blog/rss.xml`, ni les
// autres routes du site : le seul but est d'intercepter la lecture d'un
// article qui a existé.
const BLOG_ARTICLE_RE = /^\/blog\/([^/]+)\/?$/;

export function matchBlogArticleSlug(pathname: string): string | null {
  const m = BLOG_ARTICLE_RE.exec(pathname);
  if (!m) return null;
  if (m[1] === 'rss.xml') return null;
  return decodeURIComponent(m[1]);
}

// Réponse HTML minimale, autonome (pas de chrome du site — le middleware n'a
// pas de rendu React à sa disposition) mais reprenant les tokens de design du
// blog, pour ne pas renvoyer une page blanche aux quelques visiteurs humains
// qui la verront réellement.
export function goneArticleResponse(): NextResponse {
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Article retiré — Je pâtisse !</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&family=Work+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
  body { background:#fff8f7; color:#221a1a; font-family:'Work Sans',sans-serif; margin:0;
         min-height:100vh; display:flex; align-items:center; justify-content:center; text-align:center; padding:24px; }
  h1 { font-family:'Playfair Display',serif; color:#300a12; font-size:28px; margin:0 0 12px; }
  p { color:#514345; font-size:15px; line-height:1.6; margin:0 0 24px; }
  a { display:inline-block; background:#300a12; color:#fff; text-decoration:none;
      padding:10px 22px; border-radius:999px; font-size:14px; font-weight:600; }
</style>
</head>
<body>
  <div>
    <h1>Cet article n'est plus disponible</h1>
    <p>Il a été retiré du blog. Retrouvez les articles publiés sur la page principale.</p>
    <a href="/blog">Retour au blog</a>
  </div>
</body>
</html>`;
  return new NextResponse(html, { status: 410, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
