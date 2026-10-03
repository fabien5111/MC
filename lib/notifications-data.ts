// Notifications in-app — lectures (session courante) et réservation des
// envois d'abonnement.
//
// **Les écritures ne sont plus ici** : toute notification passe par le moteur
// unique `notifier()` (`lib/notifier.ts`, JEP-278). Jamais du navigateur — d'où
// l'absence de policy RLS d'insertion pour un membre ordinaire (cf. migration).
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';
import { RYTHME_DEPUIS_BASE, type Categorie, type PreferencesMembre } from '@/lib/notification-events';

export type NotificationRow = {
  id: number;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  /** Chemin relatif que la cloche ouvre au clic (JEP-278), absent pour les anciennes lignes. */
  link: string | null;
};

// `notifications` n'est pas encore dans lib/database.types.ts tant que la
// migration n'a pas été appliquée puis régénérée (npm run gen:types, cf.
// CLAUDE.md) — accès non typé en attendant, même motif que `recipe_analysis`
// dans /api/moderation-recette et `ads` dans PartnersManager.
type NotificationDbRow = {
  id: number;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  link: string | null;
};

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

/**
 * Les vingt plus récentes, pour la cloche de l'en-tête — mémoïsé par
 * requête : la cloche et une éventuelle page dédiée partagent une lecture.
 */
export const getRecentNotifications = cache(async (userId: string): Promise<NotificationRow[]> => {
  const supabase = await createClient();
  const { data } = await (supabase.from('notifications' as never) as unknown as NotificationsSelect)
    .select('id, kind, title, body, read_at, created_at, link')
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
    link: n.link ?? null,
  }));
});

/**
 * Préférences de notification du membre courant (JEP-279) : les lignes
 * éparses de `notification_preferences` — seules les divergences par rapport
 * aux valeurs par défaut du catalogue y sont stockées. Lue à part de
 * `getProfile()` : elle ne sert qu'à `/reglages`, un écran rare.
 *
 * Client de SESSION (le membre lit sa propre ligne, RLS). Le moteur, lui, lit
 * avec le client service_role (`lirePreferences`, `lib/notifier.ts`) : un
 * appelant sans session passerait en rôle `anon` et la RLS lui renverrait
 * zéro ligne — défaut déjà constaté sur l'ancienne préférence (JEP-29).
 */
export const getNotificationPreferences = cache(async (userId: string): Promise<PreferencesMembre> => {
  const supabase = await createClient();
  const { data } = await (supabase.from('notification_preferences' as never) as unknown as PrefsSelect)
    .select('category, in_app, email, rhythm')
    .eq('user_id', userId);
  const prefs: PreferencesMembre = {};
  for (const l of data ?? []) {
    prefs[l.category] = { site: l.in_app, email: l.email, rythme: RYTHME_DEPUIS_BASE[l.rhythm] ?? 'immediat' };
  }
  return prefs;
});

type PrefsSelect = {
  select: (cols: string) => {
    eq: (col: string, value: string) => PromiseLike<{
      data: { category: Categorie; in_app: boolean; email: boolean; rhythm: string }[] | null;
    }>;
  };
};

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
