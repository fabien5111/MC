// Notifications sur l'appareil (Web Push) — SERVEUR UNIQUEMENT : stockage des
// abonnements et envoi. La logique pure (liste blanche, message) est dans
// `lib/push.ts`.
//
// **Aucune policy d'écriture sur `push_subscriptions`** : seule la route
// `/api/push/abonnement` écrit, avec la clé service_role, après avoir vérifié
// la session et l'abonnement — même doctrine que le module contact. Le
// navigateur ne fait que lire le nombre de ses propres appareils (RLS).
//
// Table absente de `lib/database.types.ts` jusqu'à la régénération : accès non
// typé, comme les autres tables du moteur de notifications.
//
// **Best-effort de bout en bout** : un push manqué ne fait jamais échouer
// l'événement qui l'a provoqué — la cloche reste la référence, la livraison
// d'un push n'est de toute façon jamais garantie par les navigateurs.
import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { APPAREILS_PUSH_MAX, endpointPushAutorise, type AbonnementPush, type MessagePush } from '@/lib/push';

type Db = SupabaseClient;
const vers = (client: unknown): Db => client as Db;

type ConfigVapid = { publique: string; privee: string; sujet: string };

/**
 * Clés VAPID lues À L'EXÉCUTION (jamais `NEXT_PUBLIC_*`) : la clé publique est
 * transmise au navigateur par le rendu serveur, un changement ne demande donc
 * qu'un redémarrage du nœud, pas de reconstruction. Absentes → fonction
 * indisponible, rien ne casse.
 */
function configVapid(): ConfigVapid | null {
  const publique = process.env.VAPID_PUBLIC_KEY?.trim();
  const privee = process.env.VAPID_PRIVATE_KEY?.trim();
  const sujet = process.env.VAPID_SUBJECT?.trim() || 'mailto:noreply@jepatisse.com';
  if (!publique || !privee) return null;
  return { publique, privee, sujet };
}

export function clePubliquePush(): string | null {
  return configVapid()?.publique ?? null;
}

/**
 * Enregistre (ou réattribue) un appareil. Un même navigateur n'a qu'un
 * abonnement : s'il change de membre (connexion d'un autre compte sur le même
 * téléphone), la ligne passe au membre courant — les notifications suivent la
 * personne connectée, jamais l'ancienne.
 */
export async function enregistrerAbonnementPush(
  admin: unknown,
  userId: string,
  a: AbonnementPush,
  userAgent: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const db = vers(admin);
  const { error } = await db.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: a.endpoint, p256dh: a.p256dh, auth: a.auth, user_agent: userAgent?.slice(0, 300) ?? null },
    { onConflict: 'endpoint' },
  );
  if (error) {
    console.error('push: enregistrement échoué :', error.message);
    return { ok: false, message: 'Enregistrement impossible pour le moment.' };
  }
  // Plafond d'appareils : un navigateur réinstallé dix fois ne laisse pas dix
  // lignes mortes (les 404/410 les purgeraient, mais seulement au prochain envoi).
  const { data } = await db
    .from('push_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  const enTrop = ((data ?? []) as { id: string }[]).slice(APPAREILS_PUSH_MAX).map((l) => l.id);
  if (enTrop.length) await db.from('push_subscriptions').delete().in('id', enTrop);
  return { ok: true };
}

export async function supprimerAbonnementPush(admin: unknown, userId: string, endpoint: string): Promise<void> {
  const { error } = await vers(admin).from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', endpoint);
  if (error) console.error('push: suppression échouée :', error.message);
}

type LigneAbonnement = { id: string; endpoint: string; p256dh: string; auth: string };

/**
 * Envoie un message à TOUS les appareils du membre. Renvoie le nombre
 * d'appareils atteints. Un abonnement expiré (404/410 du service de push) est
 * supprimé : le navigateur l'a abandonné, il ne reviendra pas.
 */
export async function envoyerPush(admin: unknown, userId: string, message: MessagePush): Promise<number> {
  const config = configVapid();
  if (!config) return 0;
  const db = vers(admin);
  const { data, error } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  if (error) {
    // Table pas encore créée : silencieux au-delà du journal.
    console.error('push: lecture des appareils échouée :', error.message);
    return 0;
  }
  const lignes = (data ?? []) as LigneAbonnement[];
  if (lignes.length === 0) return 0;

  const charge = JSON.stringify(message);
  const resultats = await Promise.all(
    lignes.map(async (l) => {
      // Revérifiée à l'envoi : une ligne écrite avant la liste blanche, ou à la
      // main, ne fait jamais appeler une adresse arbitraire.
      if (!endpointPushAutorise(l.endpoint)) return 'ecarte' as const;
      try {
        await webpush.sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, charge, {
          vapidDetails: { subject: config.sujet, publicKey: config.publique, privateKey: config.privee },
          TTL: 24 * 60 * 60, // un rappel de la veille n'a plus de sens le surlendemain
          timeout: 10_000,
        });
        return l.id;
      } catch (e) {
        const statut = (e as { statusCode?: number }).statusCode;
        if (statut === 404 || statut === 410) {
          await db.from('push_subscriptions').delete().eq('id', l.id);
          return 'expire' as const;
        }
        console.error(`push: envoi échoué (${statut ?? 'réseau'}) :`, (e as Error).message);
        return 'echec' as const;
      }
    }),
  );
  const atteints = resultats.filter((r) => r !== 'ecarte' && r !== 'expire' && r !== 'echec');
  if (atteints.length) {
    await db.from('push_subscriptions').update({ last_success_at: new Date().toISOString() }).in('id', atteints);
  }
  return atteints.length;
}
