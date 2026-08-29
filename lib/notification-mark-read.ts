// Marquage d'une notification comme lue — client-safe (aucun import
// `next/headers`), à l'inverse de `lib/notifications-data.ts`. Un composant
// client qui importerait ce dernier ferait échouer le build : il porte
// `createClient` de `lib/supabase/server`. Même séparation que
// `ideas.ts` / `ideas-data.ts`.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type NotificationsUpdate = {
  update: (values: unknown) => { eq: (col: string, value: number) => PromiseLike<{ error: { message: string } | null }> };
};

/** RLS : le membre ne peut marquer comme lues que ses propres notifications. */
export async function markNotificationRead(
  client: SupabaseClient<Database>,
  notificationId: number,
): Promise<{ error: { message: string } | null }> {
  return (client.from('notifications' as never) as unknown as NotificationsUpdate)
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);
}
