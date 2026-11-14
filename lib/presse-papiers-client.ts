// Bouton « Coller » (JEP-408) — lecture du presse-papiers, côté navigateur.
//
// Pourquoi un module commun et non un état par bouton : une page porte
// parfois vingt emplacements de photo. Chacun lisant le presse-papiers à
// chaque retour de focus, on ferait vingt lectures de suite. L'état est donc
// tenu ici, une seule fois, et lu par `useSyncExternalStore`.
//
// Ce que le navigateur permet — et qui explique la règle d'affichage :
//  - lire le presse-papiers sans geste exige une permission (`clipboard-read`),
//    que Chrome et Edge demandent à la première lecture, puis retiennent ;
//  - tant qu'elle n'est pas accordée, on NE PEUT PAS savoir si une image a été
//    copiée. Le bouton reste alors visible (état `inconnu`) : un clic lit le
//    presse-papiers et déclenche la demande du navigateur ;
//  - une fois accordée, l'état est exact : le bouton n'apparaît que si une
//    image est copiée (`image`), et disparaît sinon (`vide`) ;
//  - refusée, ou navigateur sans lecture (page non sécurisée…) : pas de
//    bouton (`indisponible`). Ctrl+V reste possible partout.
import { useSyncExternalStore } from 'react';

export type EtatPressePapiers = 'indisponible' | 'inconnu' | 'image' | 'vide';

let etat: EtatPressePapiers = 'indisponible';
let enCours = false;
let derniereLecture = 0;
const abonnes = new Set<() => void>();
let ecouteurs: (() => void) | null = null;

function changer(prochain: EtatPressePapiers) {
  if (prochain === etat) return;
  etat = prochain;
  abonnes.forEach((f) => f());
}

function lectureDisponible(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.read === 'function'
  );
}

async function permissionLecture(): Promise<PermissionState | 'inconnue'> {
  try {
    const p = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
    return p.state;
  } catch {
    // Firefox et Safari ne connaissent pas ce nom de permission.
    return 'inconnue';
  }
}

/**
 * Relit l'état du presse-papiers. Appelée au retour de focus de la page et au
 * survol d'un emplacement ; au plus une lecture toutes les 800 ms.
 */
export async function rafraichirPressePapiers(forcer = false): Promise<void> {
  if (!lectureDisponible()) {
    changer('indisponible');
    return;
  }
  const maintenant = Date.now();
  if (enCours || (!forcer && maintenant - derniereLecture < 800)) return;
  enCours = true;
  derniereLecture = maintenant;
  try {
    const permission = await permissionLecture();
    if (permission === 'denied') {
      changer('indisponible');
      return;
    }
    if (permission !== 'granted') {
      changer('inconnu');
      return;
    }
    try {
      const elements = await navigator.clipboard.read();
      changer(elements.some((e) => e.types.some((t) => t.startsWith('image/'))) ? 'image' : 'vide');
    } catch {
      // Page sans focus, ou lecture refusée à cet instant : on garde l'état
      // connu, sauf au tout premier passage où l'on ne sait rien.
      if (etat === 'indisponible') changer('inconnu');
    }
  } finally {
    enCours = false;
  }
}

function abonner(rappel: () => void): () => void {
  abonnes.add(rappel);
  if (abonnes.size === 1 && typeof window !== 'undefined') {
    const relire = () => void rafraichirPressePapiers();
    const visibilite = () => {
      if (document.visibilityState === 'visible') relire();
    };
    window.addEventListener('focus', relire);
    document.addEventListener('visibilitychange', visibilite);
    ecouteurs = () => {
      window.removeEventListener('focus', relire);
      document.removeEventListener('visibilitychange', visibilite);
    };
    relire();
  }
  return () => {
    abonnes.delete(rappel);
    if (abonnes.size === 0) {
      ecouteurs?.();
      ecouteurs = null;
    }
  };
}

/** État courant, à jour dès que la page reprend le focus. `indisponible` côté serveur. */
export function useEtatPressePapiers(): EtatPressePapiers {
  return useSyncExternalStore(
    abonner,
    () => etat,
    () => 'indisponible',
  );
}

/** Le bouton « Coller » est-il à montrer ? Voir la règle en tête de fichier. */
export function boutonCollerVisible(e: EtatPressePapiers): boolean {
  return e === 'inconnu' || e === 'image';
}

/**
 * Images actuellement copiées, prêtes à suivre le chemin d'un fichier local.
 * À appeler dans un geste du membre (clic) : c'est ce qui permet au navigateur
 * de lire, ou de demander l'autorisation. Lève `NotAllowedError` si refusée.
 */
export async function lireImagesCopiees(): Promise<File[]> {
  if (!lectureDisponible()) throw new DOMException('Lecture impossible', 'NotSupportedError');
  const elements = await navigator.clipboard.read();
  const fichiers: File[] = [];
  for (const element of elements) {
    const type = element.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await element.getType(type);
    fichiers.push(new File([blob], nomImageCollee(type, fichiers.length + 1), { type }));
  }
  // La lecture vient d'aboutir : l'état affiché se met à jour sans attendre un focus.
  changer(fichiers.length ? 'image' : 'vide');
  return fichiers;
}

/** Nom d'une image collée : une capture d'écran n'en a pas, et la liste des pages de l'import en montre un. */
export function nomImageCollee(type: string, rang: number): string {
  const ext = (type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/[^a-z0-9]/gi, '');
  return `image-collee-${rang}.${ext || 'png'}`;
}
