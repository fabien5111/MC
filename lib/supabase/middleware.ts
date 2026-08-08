import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '../database.types';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Routes nécessitant une session. Le gating fin (payant/gratuit, admin) se fait
// ensuite dans chaque page/route ; ici on ne bloque que l'accès non authentifié.
const PROTECTED_PREFIXES = ['/profil', '/creer', '/admin', '/execution', '/courses', '/importer', '/relecture'];

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
    const { pathname } = request.nextUrl;
    const isProtected = PROTECTED_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );

    // IMPORTANT : ne rien exécuter entre createServerClient et cet appel (il
    // rafraîchit le token et repose les cookies — un Server Component, lui, ne
    // peut pas écrire de cookie : c'est toute la raison de ce middleware).
    //
    // `getUser()` appelle le serveur Auth à **chaque** requête, y compris pour
    // une page publique qui n'a aucune décision à en tirer : c'était un
    // aller-retour réseau ajouté devant chaque ouverture de fiche recette, en
    // série avec tout le reste. Hors routes protégées, `getSession()` suffit —
    // il lit la session des cookies et ne va sur le réseau que si le token est
    // expiré, ce qui préserve le rafraîchissement. La vérification côté serveur
    // reste faite là où elle décide de quelque chose : `getUser()` ci-dessous
    // pour la redirection, et `requireUser` / `requireAdmin` dans les pages.
    const user = isProtected
      ? (await supabase.auth.getUser()).data.user
      : (await supabase.auth.getSession()).data.session?.user ?? null;

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
