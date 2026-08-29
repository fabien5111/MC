// Notifications in-app — lecture (session courante) et écriture (serveur
// uniquement, via un client à privilèges).
//
// Séparé de `lib/entitlements-data.ts` : ce module n'a rien à voir avec les
// droits d'abonnement, seulement avec leur mise en avant. Les créations
// viennent exclusivement du cron d'expiration (`app/api/cron/abonnements`),
// jamais du navigateur — d'où l'absence de policy RLS d'insertion pour un
// membre ordinaire (cf. migration).
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type NotificationRow = {
  id: number;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
};

// `notifications` n'est pas encore dans lib/database.types.ts tant que la
// migration n'a pas été appliquée puis régénérée (npm run gen:types, cf.
// CLAUDE.md) — accès non typé en attendant, même motif que `recipe_analysis`
// dans /api/moderation-recette et `ads` dans PartnersManager.
type NotificationDbRow = { id: number; kind: string; title: string; body: string; read_at: string | null; created_at: string };

type NotificationsSelect = {
  select: (cols: string) => {
    eq: (col: string, value: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => { limit: (n: number) => PromiseLike<{ data: NotificationDbRow[] | null }> };
    };
  };
};
type NotificationsInsert = {
  insert: (values: unknown) => PromiseLike<{ error: { message: string } | null }>;
};

/**
 * Les vingt plus récentes, pour la cloche de l'en-tête — mémoïsé par
 * requête : la cloche et une éventuelle page dédiée partagent une lecture.
 */
export const getRecentNotifications = cache(async (userId: string): Promise<NotificationRow[]> => {
  const supabase = await createClient();
  const { data } = await (supabase.from('notifications' as never) as unknown as NotificationsSelect)
    .select('id, kind, title, body, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []).map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    readAt: n.read_at,
    createdAt: n.created_at,
  }));
});

/**
 * Préférence e-mail du membre courant, lue à part de `getProfile()` — elle
 * ne sert qu'à `/reglages`, un écran rare ; l'ajouter à la liste énumérée de
 * `lib/auth.ts` la ferait relire à chaque rendu de page pour rien.
 */
export const getNotifyEmailPreference = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('notify_email' as never).eq('id', userId).maybeSingle();
  return (data as { notify_email?: boolean } | null)?.notify_email ?? true;
});

type NotificationsSentUpsert = {
  upsert: (
    values: unknown,
    opts: { onConflict: string; ignoreDuplicates: boolean },
  ) => { select: (cols: string) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };
};

/**
 * Tente de « réserver » un envoi — vérifie et marque en une seule opération,
 * sous la garantie de l'unicité `(subscription_id, notification_type)` :
 * c'est elle qui porte à elle seule l'idempotence (spec §10, critère 7), pas
 * un `select` suivi d'un `insert` séparés, qui laisserait une fenêtre entre
 * les deux si le cron était jamais relancé en parallèle.
 *
 * Renvoie `true` si CET appel a obtenu la réservation (donc : envoyer),
 * `false` si elle existait déjà (donc : ne rien faire, déjà notifié).
 */
export async function claimNotification(
  admin: SupabaseClient<Database>,
  userId: string,
  subscriptionId: number,
  type: 'TRIAL_J3' | 'TRIAL_J1' | 'SUB_J3' | 'SUB_J1' | 'EXPIRED_J1',
): Promise<boolean> {
  const { data, error } = await (
    admin.from('notifications_sent' as never) as unknown as NotificationsSentUpsert
  ).upsert(
    { user_id: userId, subscription_id: subscriptionId, notification_type: type },
    { onConflict: 'subscription_id,notification_type', ignoreDuplicates: true },
  ).select('id');
  if (error) {
    console.error(`notifications_sent: réservation échouée (${type}, abonnement ${subscriptionId}) :`, error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/**
 * Crée une notification in-app. Appelée avec un client à privilèges
 * (`createAdminClient()`, cf. le cron) : la RLS n'ouvre l'insertion à aucun
 * rôle authentifié, une notification ne s'auto-écrit jamais depuis le
 * navigateur.
 */
export async function createNotification(
  admin: SupabaseClient<Database>,
  userId: string,
  kind: string,
  title: string,
  body: string,
): Promise<void> {
  const { error } = await (admin.from('notifications' as never) as unknown as NotificationsInsert).insert({
    user_id: userId,
    kind,
    title,
    body,
  });
  if (error) console.error(`notifications: création échouée (${kind}, ${userId}) :`, error.message);
}
