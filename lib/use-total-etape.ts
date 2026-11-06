'use client';

// Case « Afficher le total » des ingrédients d'une étape (mode Préparer) : un
// seul réglage pour toutes les étapes, mémorisé dans le navigateur (rien n'est
// écrit en base). Synchronisé entre les étapes de la page par un événement,
// sans quoi cocher l'une ne coche pas les autres.
import { useCallback, useSyncExternalStore } from 'react';

const CLE = 'mc.total-etape';
const EVENEMENT = 'mc:total-etape';

function lire(): boolean {
  try {
    return window.localStorage.getItem(CLE) === '1';
  } catch {
    return false;
  }
}

function abonner(cb: () => void) {
  window.addEventListener(EVENEMENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENEMENT, cb);
    window.removeEventListener('storage', cb);
  };
}

export function useTotalEtape(): [boolean, (v: boolean) => void] {
  const actif = useSyncExternalStore(abonner, lire, () => false);
  const poser = useCallback((v: boolean) => {
    try {
      window.localStorage.setItem(CLE, v ? '1' : '0');
    } catch {
      /* stockage indisponible : le réglage vaut pour cette page seulement */
    }
    window.dispatchEvent(new Event(EVENEMENT));
  }, []);
  return [actif, poser];
}
