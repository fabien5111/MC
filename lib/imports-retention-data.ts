// Purge des imports expirés — server-only (clé service_role). Le pendant pur
// — durée, échéance, prédicats — est dans lib/imports-retention.ts, que le
// composant client de « Mes imports » peut importer sans entraîner celui-ci
// côté navigateur. Motif ideas.ts / ideas-data.ts.
import 'server-only';

import { seuilPurge } from '@/lib/imports-retention';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Supprime les imports sans activité depuis `RETENTION_JOURS`.
 *
 * **Écrit avec la clé service_role**, comme le reste du ménage nocturne : la
 * purge traverse les lignes de tous les membres, aucune session n'est en jeu,
 * et la RLS d'`imports` (`user_id = auth.uid()`) l'arrêterait net.
 *
 * Supprimer un import ne touche jamais la recette qui en est issue :
 * `imports_recipe_id_fkey` va d'`imports` vers `recipes`, pas l'inverse. La
 * copie de travail disparaît, la recette du carnet reste.
 *
 * Ne lève pas : une panne du ménage ne doit pas faire échouer le cron des
 * abonnements, qui envoie des notifications et compte, lui, pour le membre.
 */
export async function purgerImportsExpires(
  maintenant: Date = new Date(),
): Promise<{ supprimes: number; erreur: string | null }> {
  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { supprimes: 0, erreur: e instanceof Error ? e.message : 'client service_role indisponible' };
  }

  const { data, error } = await admin
    .from('imports')
    .delete()
    .lt('updated_at', seuilPurge(maintenant))
    .select('id');

  if (error) {
    console.error('purgerImportsExpires:', error.message);
    return { supprimes: 0, erreur: error.message };
  }
  return { supprimes: data?.length ?? 0, erreur: null };
}
