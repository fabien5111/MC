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

export type TypeNotificationAbonnement = 'TRIAL_J3' | 'TRIAL_J1' | 'SUB_J3' | 'SUB_J1' | 'EXPIRED_J1';

/** Au-delà, un e-mail d'abonnement en échec n'est plus retenté (l'échec reste visible en base). */
export const ESSAIS_EMAIL_ABONNEMENT_MAX = 3;

/**
 * Résultat d'une réservation :
 *  - `nouveau` : première fois — cloche ET e-mail à envoyer ;
 *  - `a_renvoyer` : la cloche est déjà partie, mais l'e-mail a échoué à une
 *    passe précédente (JEP-277) — l'e-mail seul est à renvoyer ;
 *  - `deja` : rien à faire.
 */
export type ReservationNotification =
  | { etat: 'nouveau' }
  | { etat: 'a_renvoyer'; essais: number }
  | { etat: 'deja' };

// Client non typé : `email_status` / `email_error` / `email_attempts` sont
// ajoutées par une migration DDL (psql, nœud 216075) et absentes des types
// générés. Colonnes absentes : `a_renvoyer` n'arrive jamais, on retombe sur
// l'ancien comportement (un échec reste perdu), rien ne casse.
type Db = SupabaseClient;

/**
 * Tente de « réserver » un envoi — vérifie et marque en une seule opération,
 * sous la garantie de l'unicité `(subscription_id, notification_type)` :
 * c'est elle qui porte à elle seule l'idempotence (spec §10, critère 7), pas
 * un `select` suivi d'un `insert` séparés, qui laisserait une fenêtre entre
 * les deux si le cron était jamais relancé en parallèle.
 *
 * Un envoi déjà réservé dont l'e-mail a échoué (`email_status = 'failed'`,
 * moins de `ESSAIS_EMAIL_ABONNEMENT_MAX` essais) est repris : le passage
 * `failed` → `pending` se fait en une seule instruction filtrée, un seul
 * appelant l'obtient — pas de doublon, même avec deux crons simultanés.
 */
export async function claimNotification(
  admin: SupabaseClient<Database>,
  userId: string,
  subscriptionId: number,
  type: TypeNotificationAbonnement,
): Promise<ReservationNotification> {
  const { data, error } = await (
    admin.from('notifications_sent' as never) as unknown as NotificationsSentUpsert
  ).upsert(
    { user_id: userId, subscription_id: subscriptionId, notification_type: type },
    { onConflict: 'subscription_id,notification_type', ignoreDuplicates: true },
  ).select('id');
  if (error) {
    console.error(`notifications_sent: réservation échouée (${type}, abonnement ${subscriptionId}) :`, error.message);
    return { etat: 'deja' };
  }
  if ((data?.length ?? 0) > 0) return { etat: 'nouveau' };

  const { data: reprise, error: errReprise } = await (admin as unknown as Db)
    .from('notifications_sent')
    .update({ email_status: 'pending' })
    .eq('subscription_id', subscriptionId)
    .eq('notification_type', type)
    .eq('email_status', 'failed')
    .lt('email_attempts', ESSAIS_EMAIL_ABONNEMENT_MAX)
    .select('email_attempts');
  if (errReprise || !reprise?.length) return { etat: 'deja' };
  return { etat: 'a_renvoyer', essais: (reprise[0].email_attempts as number) ?? 0 };
}

/**
 * Trace l'issue de l'e-mail d'une notification d'abonnement (JEP-277) :
 * `sent`, `failed` (avec le message SMTP, retenté au passage suivant) ou
 * `skipped` (préférence coupée, pas d'adresse, mis en récapitulatif).
 * Best-effort : colonnes absentes, l'échec est ignoré.
 */
export async function noterEnvoiNotification(
  admin: SupabaseClient<Database>,
  subscriptionId: number,
  type: TypeNotificationAbonnement,
  issue: { statut: 'sent' | 'failed' | 'skipped'; erreur?: string | null; essais: number },
): Promise<void> {
  const { error } = await (admin as unknown as Db)
    .from('notifications_sent')
    .update({
      email_status: issue.statut,
      email_error: issue.statut === 'failed' ? (issue.erreur ?? 'Échec inconnu').slice(0, 500) : null,
      email_attempts: issue.statut === 'skipped' ? issue.essais : issue.essais + 1,
    })
    .eq('subscription_id', subscriptionId)
    .eq('notification_type', type);
  if (error) console.error(`notifications_sent: suivi d'envoi non écrit (${type}, abonnement ${subscriptionId}) :`, error.message);
}
