'use client';

// Filet de sécurité complémentaire à `public/sw.js` : désinscrit tout service
// worker encore enregistré sur le domaine et purge les caches associés.
//
// `public/sw.js` ne peut neutraliser que le worker enregistré à cette adresse
// précise ; ce composant couvre les enregistrements faits sous un autre chemin
// et s'exécute dès le premier rendu client. Sans service worker enregistré, il
// ne fait rien et ne déclenche aucun rechargement.
import { useEffect } from 'react';

export function ServiceWorkerCleanup() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    let cancelled = false;

    (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      // Rien à nettoyer : cas de la quasi-totalité des visites.
      if (cancelled || registrations.length === 0) return;

      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }

      // Un seul rechargement : au suivant, il n'y a plus d'enregistrement.
      window.location.reload();
    })().catch(() => {
      // Nettoyage best-effort : une erreur ici ne doit jamais casser la page.
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
