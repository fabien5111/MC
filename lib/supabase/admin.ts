// Client Supabase à privilèges service_role — Route Handlers UNIQUEMENT.
//
// Contourne la RLS : à n'utiliser que dans les routes serveur qui ont déjà
// vérifié l'appelant (`requireAdmin`, propriété de la session…). La clé n'est
// jamais préfixée NEXT_PUBLIC_ : elle ne doit pas atteindre le navigateur.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { ImpersonationClient, ImpersonationDatabase } from '@/lib/impersonation-types';

// Erreur explicite si la clé manque : le message remonte tel quel dans la
// réponse 503 de la route appelante.
export class MissingServiceKeyError extends Error {
  constructor() {
    super(
      "Fonction indisponible : la variable SUPABASE_SERVICE_ROLE_KEY n'est pas " +
        'configurée sur le serveur (Vercel → Settings → Environment Variables).',
    );
    this.name = 'MissingServiceKeyError';
  }
}

export function createAdminClient(): ImpersonationClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new MissingServiceKeyError();

  return createSupabaseClient<ImpersonationDatabase>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}
