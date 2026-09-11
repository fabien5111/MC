import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';
import { matchBlogArticleSlug, isGoneSlug, goneArticleResponse } from './lib/blog-gone';

// Domaine des testeurs, exempté de la page d'attente ci-dessous : depuis que
// jepatisse.com et dev.jepatisse.com sont deux domaines du même projet
// Vercel (mc-snowy) — nécessaire pour que dev.jepatisse.com suive `main`
// automatiquement — `COMING_SOON` (scopée à l'environnement Production) vaut
// désormais `true` pour les deux. Le tri se fait donc ici, sur `Host`, et non
// plus par l'environnement Vercel du déploiement.
const TESTER_HOST = 'dev.jepatisse.com';

export async function middleware(request: NextRequest) {
  // Gel de maintenance — fenêtre de bascule du lot C
  // (docs/migration-infomaniak.md § 7.13). Absent par défaut : sans la
  // variable, ce bloc n'existe pas.
  //
  // **Distinct de `COMING_SOON`, et il fallait qu'il le soit** : celui-ci
  // exempte explicitement `dev.jepatisse.com` (ci-dessous), qui est la seule
  // production réelle à ce stade — il ne gèle donc rien de ce qu'on cherche à
  // geler. Ici aucun domaine n'est exempté, et la réponse est un 503 plutôt
  // qu'une page d'attente : c'est le code qui correspond à une
  // indisponibilité planifiée, et il évite qu'un moteur d'indexation prenne
  // la page d'attente pour le nouveau contenu du site.
  //
  // CE QUE CE GEL NE COUVRE PAS — à traiter autrement le jour de la bascule :
  //  - `/api/*` n'est pas dans le `matcher` (cf. `config` en bas de fichier),
  //    donc les crons Vercel continuent de tourner. Ils s'exécutent à 02:00 et
  //    02:30 UTC (`vercel.json`) : il suffit que la fenêtre évite ce créneau.
  //  - les écritures directes du navigateur vers Supabase — `supabase-js`
  //    parle à l'API REST sans passer par Vercel, donc un onglet ouvert avant
  //    le gel peut encore écrire. Aucun middleware ne peut l'intercepter :
  //    d'où la consigne de fermer les onglets, et la comparaison des
  //    décomptes après le dump plutôt qu'une confiance aveugle.
  if (process.env.MAINTENANCE_FREEZE === 'true') {
    return new NextResponse('Maintenance en cours. Le site rouvre dans quelques minutes.', {
      status: 503,
      headers: {
        'Retry-After': '900',
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  // Bascule avant le rafraîchissement de session : la page d'attente n'a rien
  // à faire dépendre d'une session Supabase.
  const host = request.headers.get('host')?.split(':')[0].toLowerCase();
  if (process.env.COMING_SOON === 'true' && host !== TESTER_HOST) {
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
    // Toutes les routes sauf assets statiques, fichiers d'image et `/api/*`.
    //
    // `/api/*` en est exclu parce que le middleware n'y apportait rien :
    // `PROTECTED_PREFIXES` (lib/supabase/middleware.ts) ne contient aucun
    // préfixe d'API — chaque route s'authentifie elle-même — et la bascule
    // `COMING_SOON` ci-dessus saute déjà `/api`. Le seul effet du passage
    // était donc un `getUser()` supplémentaire par appel, en pure perte, et
    // doublé sur les routes appelées à la frappe (autocomplétion des
    // ingrédients, des membres, compte de résultats de la recherche…).
    '/((?!api/|_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf)$).*)',
  ],
};
