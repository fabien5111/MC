// Notifications sur l'appareil (Web Push) — module PUR, utilisable côté
// serveur (route d'abonnement, moteur `notifier`) comme côté client (bloc
// « Notifications sur cet appareil » de /reglages). Aucune lecture de base,
// aucun import `next/headers` : l'envoi et le stockage vivent dans
// `lib/push-data.ts` (même séparation que `ideas.ts` / `ideas-data.ts`).
//
// **Liste blanche des services de push, impérative.** L'adresse d'un
// abonnement (`endpoint`) est fournie par le navigateur, et le serveur y
// enverra ensuite des requêtes signées : sans contrôle, n'importe quel membre
// pourrait faire appeler par le serveur une adresse de son choix — réseau
// interne Virtuozzo compris (SSRF). On n'accepte donc que les services de push
// des navigateurs réels, en HTTPS, sur le port par défaut.

/** Domaines des services de push des navigateurs (sous-domaines compris). */
export const SERVICES_PUSH_AUTORISES = [
  'fcm.googleapis.com', // Chrome, Edge Android, Samsung Internet, Opera
  'android.googleapis.com', // anciens abonnements Chrome
  'push.services.mozilla.com', // Firefox
  'push.apple.com', // Safari (macOS, iOS ≥ 16.4 installé sur l'écran d'accueil)
  'notify.windows.com', // Edge sur Windows
] as const;

/** Au-delà, l'appareil le plus ancien est oublié à chaque nouvel abonnement. */
export const APPAREILS_PUSH_MAX = 10;

/** Taille maximale du texte d'une notification (le service plafonne la charge à 4 Kio). */
const CORPS_MAX = 300;
const TITRE_MAX = 120;

export function endpointPushAutorise(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return false;
  const hote = url.hostname.toLowerCase();
  return SERVICES_PUSH_AUTORISES.some((d) => hote === d || hote.endsWith(`.${d}`));
}

// Clés d'un abonnement, en base64url : `p256dh` est une clé publique P-256 non
// compressée (65 octets → 87 caractères), `auth` un secret de 16 octets
// (22 caractères). Bornes un peu larges pour tolérer un `=` de remplissage.
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export type AbonnementPush = { endpoint: string; p256dh: string; auth: string };

/**
 * Lit un abonnement tel que l'envoie le navigateur (`PushSubscription.toJSON()`)
 * — `null` s'il n'est pas exploitable ou vise un service non autorisé.
 */
export function lireAbonnementPush(brut: unknown): AbonnementPush | null {
  if (!brut || typeof brut !== 'object') return null;
  const b = brut as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof b.endpoint === 'string' ? b.endpoint : '';
  const p256dh = typeof b.keys?.p256dh === 'string' ? b.keys.p256dh : '';
  const auth = typeof b.keys?.auth === 'string' ? b.keys.auth : '';
  if (endpoint.length > 1000 || !endpointPushAutorise(endpoint)) return null;
  if (p256dh.length < 80 || p256dh.length > 100 || !BASE64URL.test(p256dh)) return null;
  if (auth.length < 16 || auth.length > 30 || !BASE64URL.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/** Ce que le service worker reçoit et affiche (`app/sw.js/route.ts`, gestionnaire `push`). */
export type MessagePush = { titre: string; corps: string; lien: string };

/** Un chemin du site, jamais une adresse externe (`//hote` compris) : sinon la liste des notifications. */
export function lienPushSur(lien: string | null | undefined): string {
  return typeof lien === 'string' && lien.startsWith('/') && !lien.startsWith('//') && !lien.startsWith('/\\')
    ? lien
    : '/notifications';
}

const tronquer = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

export function composerMessagePush(titre: string, corps: string, lien: string | null): MessagePush {
  return {
    titre: tronquer(titre.trim() || 'Je pâtisse !', TITRE_MAX),
    corps: tronquer(corps.trim(), CORPS_MAX),
    lien: lienPushSur(lien),
  };
}

/**
 * Clé publique VAPID (base64url) → octets attendus par
 * `pushManager.subscribe({ applicationServerKey })`.
 */
export function cleVapidVersOctets(cle: string): Uint8Array<ArrayBuffer> {
  const base64 = (cle + '='.repeat((4 - (cle.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const brut = atob(base64);
  const octets = new Uint8Array(new ArrayBuffer(brut.length));
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i);
  return octets;
}
