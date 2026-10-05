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
import {
  CATEGORIES_ADMIN,
  NOTIFICATIONS_CLOCHE,
  filtreMembre,
  type Portee,
} from '@/lib/notifications-view';

export type NotificationRow = {
  id: number;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
  /** Chemin relatif que la cloche ouvre au clic (JEP-278), absent pour les anciennes lignes. */
  link: string | null;
  /** Catégorie du catalogue ; absente des lignes antérieures au moteur (elles concernent le membre). */
  category: string | null;
};

const COLONNES = 'id, kind, title, body, read_at, created_at, link, category';

type LigneNotification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  link: string | null;
  category: string | null;
};

const versLigne = (n: LigneNotification): NotificationRow => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  readAt: n.read_at,
  createdAt: n.created_at,
  link: n.link ?? null,
  category: n.category ?? null,
});

/**
 * Les plus récentes, pour la cloche de l'en-tête (cinq : le reste est sur
 * /notifications) — mémoïsé par requête : la cloche et une éventuelle page
 * dédiée partagent une lecture.
 */
export const getRecentNotifications = cache(
  async (userId: string, limite: number = NOTIFICATIONS_CLOCHE): Promise<NotificationRow[]> => {
    const supabase = await createClient();
    const { data } = await supabase
      .from('notifications')
      .select(COLONNES)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limite);
    return (data ?? []).map(versLigne);
  },
);

/**
 * Nombre TOTAL de notifications non lues — la pastille de la cloche. Compté en
 * base plutôt que sur les lignes chargées : la cloche n'en montre plus que
 * cinq, une pastille bâtie dessus mentirait dès la sixième.
 */
export const countUnreadNotifications = cache(async (userId: string): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  return count ?? 0;
});

/**
 * Page /notifications : `limite` entrées de la portée demandée, les plus
 * récentes d'abord. On lit une ligne de plus que demandé pour savoir s'il en
 * reste, sans second comptage.
 */
export async function listNotifications(
  userId: string,
  opts: { portee: Portee; limite: number },
): Promise<{ rows: NotificationRow[]; hasMore: boolean }> {
  const supabase = await createClient();
  let q = supabase.from('notifications').select(COLONNES).eq('user_id', userId);
  if (opts.portee === 'admin') q = q.in('category', CATEGORIES_ADMIN);
  else if (opts.portee === 'membre') q = q.or(filtreMembre());
  const { data } = await q.order('created_at', { ascending: false }).limit(opts.limite + 1);
  const lignes = (data ?? []).map(versLigne);
  return { rows: lignes.slice(0, opts.limite), hasMore: lignes.length > opts.limite };
}

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
  const table = () => supabase.from('notification_preferences' as never) as unknown as PrefsSelect;
  // `push` (canal « sur l'appareil ») est lue si la colonne existe ; avant la
  // migration, la lecture sans elle garde intactes les préférences site/e-mail
  // — un e-mail refusé ne doit jamais redevenir reçu faute d'une colonne.
  let { data, error } = await table().select('category, in_app, email, rhythm, push').eq('user_id', userId);
  if (error) ({ data } = await table().select('category, in_app, email, rhythm').eq('user_id', userId));
  const prefs: PreferencesMembre = {};
  for (const l of data ?? []) {
    prefs[l.category] = {
      site: l.in_app,
      email: l.email,
      rythme: RYTHME_DEPUIS_BASE[l.rhythm] ?? 'immediat',
      push: l.push ?? null,
    };
  }
  return prefs;
});

type PrefsSelect = {
  select: (cols: string) => {
    eq: (col: string, value: string) => PromiseLike<{
      data: { category: Categorie; in_app: boolean; email: boolean; rhythm: string; push?: boolean | null }[] | null;
      error: { message: string } | null;
    }>;
  };
};

/**
 * Nombre d'appareils sur lesquels le membre courant reçoit les notifications
 * (Web Push, `push_subscriptions`) — client de session, la RLS ne lui montre
 * que les siens. `null` si la table n'existe pas encore : /reglages n'affiche
 * alors aucun compte, rien ne casse.
 */
export async function countPushDevices(userId: string): Promise<number | null> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { count, error } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);
  return error ? null : (count ?? 0);
}

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
