// Service worker, servi par une route plutôt que par `public/sw.js` — c'est ce
// qui permet un interrupteur d'arrêt côté serveur (`PWA_DISABLE_SERVICE_WORKER`,
// cf. tableau des variables d'environnement dans CLAUDE.md) sans toucher au
// code du navigateur : couper l'interrupteur change ce que cette route sert,
// pas un fichier statique qu'il faudrait redéployer pour modifier.
//
// Pourquoi un vrai service worker (retour en arrière sur la doctrine
// précédente) : Chrome/Edge n'exigent plus qu'un manifeste valide pour
// proposer l'installation, mais Samsung Internet, lui, exige toujours un
// service worker portant un gestionnaire `fetch` — sans lui, aucune bannière
// d'installation n'apparaît sur ce navigateur, quel que soit le manifeste.
//
// Garde-fou impératif (cf. `public/sw.js`, l'ancien worker auto-destructeur,
// et la régression qu'il corrigeait) : ce worker ne met JAMAIS en cache une
// page HTML dynamique ni une réponse d'API. Tout ce qui n'est pas dans
// `PRECACHE_URLS` passe en réseau pur, sans interception réelle — s'il n'est
// pas disponible hors ligne, tant pis, mais il n'est jamais servi périmé.
// Seule exception : `/hors-ligne`, un repli statique pour les navigations qui
// échouent faute de réseau.
export const dynamic = 'force-dynamic';

const DISABLED = process.env.PWA_DISABLE_SERVICE_WORKER === 'true';

// Un identifiant de déploiement fait naturellement office de version de
// cache : chaque déploiement purge donc le précédent à l'activation, sans
// numéro à incrémenter à la main et sans risque d'oubli.
const CACHE_NAME = `mc-pwa-${process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev'}`;

const PRECACHE_URLS = ['/hors-ligne', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

const DISABLED_WORKER = `
// Service worker « auto-destructeur » — interrupteur d'arrêt engagé
// (PWA_DISABLE_SERVICE_WORKER=true). Même doctrine que l'ancien
// public/sw.js : un service worker ne se désinscrit pas à distance, la seule
// méthode fiable est de publier un remplaçant qui se désenregistre lui-même
// et purge les caches.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })(),
  );
});
`;

const ACTIVE_WORKER = `
const CACHE_NAME = ${JSON.stringify(CACHE_NAME)};
const PRECACHE_URLS = ${JSON.stringify(PRECACHE_URLS)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Best-effort ligne par ligne : une icône manquante ne doit pas faire
      // échouer l'installation entière du worker.
      await Promise.all(
        PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})),
      );
    })(),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge les caches des déploiements précédents (nom versionné par le
      // commit) et ceux laissés par un ancien worker auto-destructeur.
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Seules les lectures sont concernées : une mutation ne doit jamais
  // transiter par une logique de cache.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Un seul domaine : pas de proxy vers des ressources tierces (polices
  // Google, etc.) — laissées au réseau normal du navigateur.
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Réseau d'abord, systématiquement : la page rendue côté serveur ne doit
    // jamais être remplacée par une copie en cache (cf. régression documentée
    // dans CLAUDE.md — un carnet de recettes périmé qu'un F5 ne corrigeait
    // pas). Le cache n'intervient qu'en dernier recours, hors ligne.
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('/hors-ligne')) ?? Response.error();
      }),
    );
    return;
  }

  // Tout le reste (scripts, styles, données d'API) : passe-plat réseau pur.
  // Seuls les quelques fichiers précachés (icônes, manifeste) retombent sur le
  // cache si le réseau échoue — le reste échoue normalement hors ligne.
  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      return Response.error();
    }),
  );
});
`;

export async function GET() {
  return new Response(DISABLED ? DISABLED_WORKER : ACTIVE_WORKER, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
