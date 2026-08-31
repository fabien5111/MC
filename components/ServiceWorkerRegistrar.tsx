'use client';

// Enregistre le service worker du site (`app/sw.js/route.ts`) et purge tout
// enregistrement qui ne pointe pas dessus.
//
// Ce second point couvre deux cas : l'ancienne version vanilla du site, qui
// enregistrait un worker resté actif dans les navigateurs des visiteurs après
// le passage à Next.js (il ignorait le `no-store` envoyé par le serveur — le
// carnet de recettes affichait alors un état périmé qu'un simple F5 ne
// corrigeait pas, seul un vidage manuel du cache y parvenait) ; et tout
// enregistrement fait sous un autre chemin par erreur. Dans les deux cas, on
// désinscrit puis on recharge — le worker actuel, lui, n'a jamais besoin de ce
// traitement : l'enregistrer à nouveau ne fait que vérifier une mise à jour.
//
// L'interrupteur d'arrêt (`PWA_DISABLE_SERVICE_WORKER`) vit entièrement côté
// serveur : quand il est engagé, `/sw.js` sert lui-même un worker
// auto-destructeur, et `register()` ci-dessous l'installe sans le savoir — ce
// composant n'a donc rien à connaître de ce réglage.
import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;

    (async () => {
      const currentSwUrl = new URL('/sw.js', window.location.origin).href;
      const registrations = await navigator.serviceWorker.getRegistrations();
      const stale = registrations.filter((registration) => {
        const scriptURL =
          registration.active?.scriptURL ??
          registration.waiting?.scriptURL ??
          registration.installing?.scriptURL;
        return scriptURL !== currentSwUrl;
      });

      if (stale.length > 0) {
        await Promise.all(stale.map((registration) => registration.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
        if (!cancelled) {
          // Un seul rechargement : au suivant, il n'y a plus de reliquat.
          window.location.reload();
        }
        return;
      }

      if (!cancelled) {
        await navigator.serviceWorker.register('/sw.js');
      }
    })().catch(() => {
      // Best-effort : une erreur ici ne doit jamais casser la page.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
