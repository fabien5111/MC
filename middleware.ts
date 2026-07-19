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
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
