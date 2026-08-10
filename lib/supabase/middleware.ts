import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '../database.types';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Routes nécessitant une session. Le gating fin (payant/gratuit, admin) se fait
// ensuite dans chaque page/route ; ici on ne bloque que l'accès non authentifié.
//
// `/carnet` et `/en-cuisine` y figurent **à titre provisoire**. La navigation
// cible montre ces deux entrées au visiteur, sans cadenas, et les fait aboutir
// à un écran d'invitation qui donne à voir ce qu'il y a derrière — jamais à un
// renvoi sec vers la connexion. Le jour où cet écran existe, les deux préfixes
// sortent d'ici **et** le `requireUser` de leur page cède la place au rendu à
// deux états. Les retirer d'ici seul ne ferait que remplacer la redirection par
// une erreur.
//
// `/profil` reste protégé bien qu'il ne soit plus qu'une redirection : il
// dispatche vers des écrans privés, autant refuser tôt.
const PROTECTED_PREFIXES = [
  '/profil',
  '/reglages',
  '/carnet',
  '/en-cuisine',
  '/creer',
  '/admin',
  '/execution',
  '/courses',
  '/importer',
  '/relecture',
];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Sans les clés Supabase, createServerClient lèverait une exception et le
  // middleware (exécuté sur CHAQUE requête) renverrait 500 sur tout le site. On
  // laisse alors simplement passer la requête, en loggant la cause exacte.
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      'Middleware : NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
        'absentes au runtime. Définissez-les dans Vercel puis redéployez SANS ' +
        'cache de build (ces variables sont inlinées au build).',
    );
    return response;
  }

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  try {
    // IMPORTANT : ne rien exécuter entre createServerClient et getUser (rafraîchit le token).
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;
    const isProtected = PROTECTED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );
    // Les prefetch automatiques de <Link> (survol, apparition dans le
    // viewport) déclenchent le middleware au même titre qu'une navigation
    // réelle. S'ils arrivent juste après une connexion (avant propagation
    // complète du cookie de session), on ne doit pas rediriger le routeur
    // client vers /connexion sur la base d'un prefetch — seule une
    // navigation effective doit produire cette redirection.
    const isPrefetch = request.headers.get('next-router-prefetch') === '1';

    if (!user && isProtected && !isPrefetch) {
      const url = request.nextUrl.clone();
      url.pathname = '/connexion';
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  } catch (err) {
    // Erreur transitoire (réseau, Supabase indisponible) : on ne casse pas tout
    // le site — le gating fin reste assuré côté page/route via requireUser.
    console.error('Middleware : échec de la vérification de session Supabase', err);
  }

  return response;
}
