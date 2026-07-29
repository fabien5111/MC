// Service worker « auto-destructeur ».
//
// L'ancienne version vanilla du site était une PWA : elle enregistrait un
// service worker sur ce même domaine. Resté actif dans les navigateurs des
// visiteurs après le passage à Next.js, il continuait à servir des pages
// depuis son cache en ignorant le `no-store` envoyé par le serveur — le
// carnet de recettes affichait alors un état périmé qu'un simple F5 ne
// corrigeait pas (seul un vidage manuel du cache y parvenait).
//
// Un service worker ne peut pas être désinscrit à distance : la seule méthode
// fiable est d'en publier un nouveau, qui se désenregistre lui-même et purge
// les caches. Le navigateur vérifie ce fichier à chaque navigation, sans
// passer par le cache HTTP, ce qui garantit sa prise en compte.
//
// NE PAS SUPPRIMER ce fichier : tant qu'un navigateur porte encore l'ancien
// worker, il a besoin de le télécharger pour s'en débarrasser.
//
// Aucun gestionnaire `fetch` n'est déclaré : ce worker n'intercepte rien.

self.addEventListener('install', () => {
  // Prend la main immédiatement, sans attendre la fermeture des onglets.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Purge tous les caches laissés par l'ancien worker.
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));

      await self.registration.unregister();

      // Recharge les onglets ouverts : ils repassent alors par le réseau.
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) {
        client.navigate(client.url);
      }
    })(),
  );
});
