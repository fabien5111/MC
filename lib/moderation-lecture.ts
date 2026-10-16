// Modération des membres (JEP-272) — lectures qui prennent leur client en
// paramètre, sans dépendance à Next (`next/headers`, `react`) : importables
// par le moteur de notifications, que des tests et des scripts chargent hors
// d'un rendu. Les accesseurs liés à la session vivent dans
// `lib/moderation-data.ts`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { estBloque, etatModeration, statutPeutBloquer, type LigneModeration } from '@/lib/moderation';

// Les tables et colonnes ajoutées par la migration ne figurent pas encore
// dans `lib/database.types.ts` (à régénérer par le workflow dédié) : accès non
// typé, comme les tables du moteur de notifications avant elles.
type Db = SupabaseClient;
export const vers = (client: unknown): Db => client as Db;

export const COLONNES_MODERATION = 'status, suspended_until, suspension_reason, disabled_reason';

/** Ligne de modération d'un membre, lue avec le client fourni. */
export async function lireLigneModeration(client: unknown, userId: string): Promise<LigneModeration | null> {
  const db = vers(client);
  const { data, error } = await db.from('profiles').select(COLONNES_MODERATION).eq('id', userId).maybeSingle();
  if (!error) return (data as LigneModeration | null) ?? null;
  // Migration pas encore jouée : le statut seul.
  const { data: repli } = await db.from('profiles').select('status').eq('id', userId).maybeSingle();
  return (repli as LigneModeration | null) ?? null;
}

/**
 * Variante pour les traitements SANS session (cron, notifications), avec un
 * client service_role. Une ligne illisible vaut « non bloqué » : on ne coupe
 * pas les e-mails d'un membre sur une panne de lecture.
 */
export async function membreBloque(admin: unknown, userId: string): Promise<boolean> {
  const ligne = await lireLigneModeration(admin, userId);
  if (!ligne || !statutPeutBloquer(ligne.status)) return false;
  return estBloque(etatModeration(ligne));
}
