'use client';

// Page de retour d'une connexion par fenêtre (JEP-408) : rend `code` et
// `state` à la page d'origine par un canal de diffusion (même origine), puis
// ferme la fenêtre. Le canal plutôt que `window.opener` : la page de connexion
// du fournisseur peut couper ce lien (en-tête COOP), le canal ne dépend que de
// l'origine. La page d'origine vérifie `state` avant d'utiliser le code.
import { useEffect, useState } from 'react';
import { CANAL_RETOUR_OAUTH, lireRetourOAuth } from '@/lib/stockage-en-ligne';

export function RetourConnexion() {
  const [message, setMessage] = useState('Connexion en cours…');

  useEffect(() => {
    const retour = lireRetourOAuth(window.location.search);
    if (!retour) {
      setMessage('Rien à transmettre : vous pouvez fermer cette fenêtre.');
      return;
    }
    try {
      const canal = new BroadcastChannel(CANAL_RETOUR_OAUTH);
      canal.postMessage(retour);
      canal.close();
    } catch {
      setMessage("Votre navigateur n'a pas pu transmettre la connexion. Fermez cette fenêtre et réessayez.");
      return;
    }
    // Le code ne doit pas rester dans l'historique de la fenêtre.
    window.history.replaceState(null, '', window.location.pathname);
    setMessage(retour.erreur ? 'Connexion annulée.' : 'Connexion réussie : vous pouvez fermer cette fenêtre.');
    window.setTimeout(() => window.close(), 300);
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface p-6">
      <p className="font-body-md text-on-surface-variant text-center">{message}</p>
    </main>
  );
}
