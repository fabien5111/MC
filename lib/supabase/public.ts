// Client Supabase **sans session** : il ne lit aucun cookie et ne voit donc que
// ce que la RLS ouvre à tout le monde (ici, les articles publiés).
//
// Raison d'être : le client de `lib/supabase/server.ts` lit les cookies, ce qui
// interdit son usage dans `unstable_cache` (aucune API de requête n'y est
// accessible) et rend toute page qui l'appelle dynamique. Les lectures
// publiques du blog passent donc par ce client-ci, qui peut être mis en cache
// et partagé entre tous les visiteurs — c'est le même contenu pour chacun.
//
// À n'utiliser que pour du contenu réellement public. Toute lecture dépendant
// de l'utilisateur (brouillons, favoris, planning…) doit rester sur le client
// à cookies, sinon la RLS n'a plus rien à quoi s'appliquer.
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

export function createPublicClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
