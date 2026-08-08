import { type NextRequest } from 'next/server';
import { updateSession } from './lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Runtime Node plutôt qu'Edge : l'empaquetage Edge Function du projet Vercel
  // échoue à l'invocation (MIDDLEWARE_INVOCATION_FAILED) alors que le même
  // build fonctionne en local — on contourne en sortant de l'Edge runtime
  // (stable depuis Next 15.5).
  runtime: 'nodejs',
  matcher: [
    // Toutes les routes sauf assets statiques et fichiers d'image.
    // `api/image` en fait partie : ces routes servent les visuels d'une fiche
    // (une requête par image, cf. app/api/image/…) et lisent elles-mêmes la
    // session dans les cookies pour la RLS. Les faire passer par le
    // rafraîchissement de session n'ajouterait qu'un traitement par image,
    // alors que la requête de la page l'a déjà fait juste avant.
    '/((?!_next/static|_next/image|api/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
