import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';
import { matchBlogArticleSlug, isGoneSlug, goneArticleResponse } from './lib/blog-gone';

export async function middleware(request: NextRequest) {
  // Domaine de production en attente de lancement : `COMING_SOON` n'est posée
  // que sur l'environnement Production Vercel (jepatisse.com), jamais sur
  // Preview (dev.jepatisse.com) — inutile donc de distinguer par `Host` ici.
  // Bascule avant le rafraîchissement de session : la page d'attente n'a rien
  // à faire dépendre d'une session Supabase.
  if (process.env.COMING_SOON === 'true') {
    const { pathname } = request.nextUrl;
    if (pathname !== '/bientot-disponible' && !pathname.startsWith('/api')) {
      return NextResponse.rewrite(new URL('/bientot-disponible', request.url));
    }
  }

  // Toujours d'abord : rafraîchit la session, la protège dessus. Un article
  // dépublié n'a pas de raison de sauter ce rafraîchissement.
  const response = await updateSession(request);

  // 410 sur un article dépublié (il a existé, `published_at` en fait foi) —
  // pas 404, qui ne dirait pas à l'indexation « ça a disparu pour de bon ».
  // `matchBlogArticleSlug` ne retient que `/blog/<slug>` : le test échoue en
  // une comparaison de regex pour toute autre route, avant tout accès réseau.
  // `?preview=` doit toujours atteindre la page réelle — la RLS y décide de
  // la visibilité (son propre travail, ou l'admin) ; le 410 ne doit jamais
  // intercepter la prévisualisation d'un article qu'on vient de dépublier.
  const slug = request.nextUrl.searchParams.has('preview')
    ? null
    : matchBlogArticleSlug(request.nextUrl.pathname);
  if (slug && (await isGoneSlug(slug))) {
    const gone = goneArticleResponse();
    // Conserve les cookies de session posés par updateSession ci-dessus (en-
    // têtes complets — attributs compris) : sans ça, un rafraîchissement de
    // session en cours serait perdu sur cette réponse précise.
    for (const cookie of response.headers.getSetCookie()) {
      gone.headers.append('Set-Cookie', cookie);
    }
    return gone;
  }

  return response;
}

export const config = {
  // Runtime Node plutôt qu'Edge : l'empaquetage Edge Function du projet Vercel
  // échoue à l'invocation (MIDDLEWARE_INVOCATION_FAILED) alors que le même
  // build fonctionne en local — on contourne en sortant de l'Edge runtime
  // (stable depuis Next 15.5).
  runtime: 'nodejs',
  matcher: [
    // Toutes les routes sauf assets statiques et fichiers d'image.
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
