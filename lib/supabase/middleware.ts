import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '../database.types';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Routes nécessitant une session. Le gating fin (payant/gratuit, admin) se fait
// ensuite dans chaque page/route ; ici on ne bloque que l'accès non authentifié.
//
// `/carnet` et `/en-cuisine` en sont volontairement absents : un visiteur qui
// clique dessus doit voir l'écran d'invitation (README « Écran 4 »,
// components/invitation/InvitationScreen.tsx) — jamais un renvoi sec vers la
// connexion. Chacune des deux pages gère elle-même son rendu à deux états
// (`getCurrentUser()` plutôt que `requireUser()`).
//
// `/profil` reste protégé bien qu'il ne soit plus qu'une redirection : il
// dispatche vers des écrans privés, autant refuser tôt. `/idees` (liste) est
// public à l'inverse — seule `/idees/nouvelle` (création) exige une session.
//
// `/choix-pseudo` y figure au même titre : c'est un écran de compte, un
// visiteur déconnecté n'y a rien à faire. Le contrôle « a-t-il déjà un
// pseudo ? » reste, lui, côté page (`requireUser`, lib/auth.ts) — le poser
// ici coûterait une requête base sur chaque requête HTTP du site.
const PROTECTED_PREFIXES = [
  '/profil',
  '/reglages',
  '/choix-pseudo',
  '/creer',
  '/admin',
  '/execution',
  '/fournee',
  '/courses',
  '/importer',
  '/relecture',
  '/idees/nouvelle',
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
    // IMPORTANT : ne rien exécuter entre createServerClient et cet appel (il
    // rafraîchit le token et réécrit les cookies de session).
    //
    // `getClaims()` plutôt que `getUser()` : ce dernier interroge le serveur
    // d'authentification à **chaque** appel, et le middleware s'exécute sur
    // chaque requête — navigations, mais aussi prefetch RSC de `<Link>`. Un
    // `getUser()` déclenche côté GoTrue les lectures de `sessions`,
    // `identities`, `mfa_amr_claims` et `users` : c'est le poste à ~37 000
    // appels du relevé du 25/08/2026.
    //
    // `getClaims()` vérifie la signature du JWT **localement** contre le JWKS
    // du projet, récupéré une fois puis mis en cache dans un registre de
    // processus (`GLOBAL_JWKS`, partagé entre tous les clients d'une même
    // instance Lambda). Coût réseau : nul, une fois l'instance chaude.
    //
    // Trois choses à savoir :
    //
    // 1. **Le rafraîchissement est préservé.** `getClaims()` appelle
    //    `getSession()` en interne, qui rafraîchit un token expiré et le
    //    repose en cookies par l'adaptateur ci-dessus — exactement le chemin
    //    qu'empruntait `getUser()`. C'est la mise en garde du § 4 de la spec,
    //    et elle est respectée.
    // 2. **Le gain suppose des clés de signature asymétriques** (ECC/RSA) côté
    //    projet Supabase. Sur l'ancien secret partagé (HS256), la signature
    //    n'est pas vérifiable sans le secret : `getClaims()` retombe alors
    //    tout seul sur `getUser()`. Le comportement reste juste, simplement
    //    sans gain — la bascule se fait dans le tableau de bord Supabase
    //    (Authentication → JWT Keys).
    // 3. **Ce que ça ne voit plus** : une session révoquée avant l'expiration
    //    de son token (déconnexion ailleurs, compte supprimé) reste acceptée
    //    ici jusqu'à échéance. C'est acceptable parce que ce contrôle-ci ne
    //    fait qu'aiguiller vers /connexion : le contrôle fin des pages privées
    //    passe par `requireUser()` → `getCurrentUser()`, qui appelle toujours
    //    `getUser()` et interroge donc bien le serveur d'authentification.
    const { data } = await supabase.auth.getClaims();
    // Seule la présence d'une session compte ici : le middleware aiguille, il
    // n'a besoin d'aucun attribut de l'utilisateur.
    const estConnecte = !!data?.claims;

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

    if (!estConnecte && isProtected && !isPrefetch) {
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
