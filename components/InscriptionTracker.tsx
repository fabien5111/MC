'use client';

// Mesure `sign_up` pour une inscription par e-mail (JEP-89).
//
// Le lien de confirmation arrive sur `/auth/callback`, qui écrit le pseudo côté
// serveur puis REDIRIGE : le navigateur ne voit passer qu'une nouvelle page. Le
// serveur y glisse donc un marqueur (`?inscription=email`, cf.
// lib/inscription.ts) que ce composant, monté une fois dans le layout racine,
// lit, retire de l'adresse puis transforme en événement.
//
// Retiré AVANT toute attente : un rechargement, un favori ou un partage du lien
// ne rejoue pas l'événement, et le double montage d'un effet en développement
// non plus (le second passage ne trouve plus rien dans l'URL).
//
// `trackEventQuandPret` et non `trackEvent` : on arrive ici avant que le script
// de GA, chargé après l'hydratation, ait pu s'exécuter. Sans accord donné, rien
// ne part.
import { useEffect } from 'react';
import { trackEventQuandPret } from '@/lib/analytics';
import { PARAM_INSCRIPTION, estMethodeInscription } from '@/lib/inscription';

export function InscriptionTracker() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const methode = url.searchParams.get(PARAM_INSCRIPTION);
    if (methode === null) return;
    url.searchParams.delete(PARAM_INSCRIPTION);
    // L'état courant est repassé tel quel : le routeur de Next y range le sien.
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    if (estMethodeInscription(methode)) trackEventQuandPret('sign_up', { method: methode });
  }, []);

  return null;
}
