// Lecture de l'état réel des files de modération (JEP-386) — SERVEUR. Un seul
// lecteur pour le récapitulatif e-mail (client service_role) et la cloche
// (client de session : la RLS ouvre les recettes en attente à l'équipe, les
// avis à l'admin complet — `filesDuRole` écarte de toute façon ce qu'un rôle
// ne traite pas).
import type { SupabaseClient } from '@supabase/supabase-js';
import { TITRES_MAX, type FileModeration, type FilesModeration } from '@/lib/notification-moderation-recap';

/**
 * État des files à l'instant de l'appel, ou `null` si une lecture échoue : à
 * l'appelant de choisir le repli (le mail omet la section, la cloche garde ses
 * entrées plutôt que de perdre une alerte sur une panne passagère).
 */
export async function lireFilesModeration(db: SupabaseClient): Promise<FilesModeration | null> {
  const [recettes, avis] = await Promise.all([
    db
      .from('recipes')
      .select('title', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(TITRES_MAX),
    db
      .from('comments')
      .select('recipes(title)', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(TITRES_MAX),
  ]);
  if (recettes.error || avis.error) {
    console.error('notifications/moderation: files illisibles :', (recettes.error ?? avis.error)?.message);
    return null;
  }
  const file = (total: number | null, titres: (string | null | undefined)[]): FileModeration => ({
    total: total ?? 0,
    titres: titres.filter((t): t is string => !!t),
  });
  return {
    recettes: file(recettes.count, (recettes.data ?? []).map((r) => r.title as string | null)),
    avis: file(
      avis.count,
      (avis.data ?? []).map((a) => {
        const r = (a as { recipes?: { title?: string | null } | { title?: string | null }[] | null }).recipes;
        return (Array.isArray(r) ? r[0] : r)?.title ?? null;
      }),
    ),
  };
}
