'use client';

// Rejoue un « Favori » interrompu par la connexion.
//
// `connexionHref(next)` (lib/nav.ts) restitue l'ÉCRAN de départ après
// connexion, mais pas le GESTE qui l'a précédé : un visiteur déconnecté qui
// clique « Favori », se connecte, puis revient sur la même fiche retrouvait
// jusqu'ici une recette toujours pas en favori — il fallait recliquer.
//
// Le marqueur `?favori=<recipeId>` voyage dans le `next=` (donc à travers
// `/connexion`, `LoginForm.router.replace(next)`, jusqu'à la page de
// destination) ; `useResumeFavoriteIntent`, monté par le bouton concerné,
// le consomme une fois de retour et rejoue l'ajout.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

const PARAM = 'favori';

// À appeler dans la branche `!user` d'un bouton favori, à la place de
// `location.pathname + location.search` nu.
export function favoriteIntentPath(recipeId: string): string {
  const url = new URL(location.href);
  url.searchParams.set(PARAM, recipeId);
  return url.pathname + url.search;
}

// À appeler une fois au montage de chaque bouton favori (un par recette :
// une grille en affiche plusieurs, seul celui dont le `recipeId` correspond
// doit réagir). Nettoie le marqueur de l'URL avant de rejouer l'action —
// jamais après — pour qu'un rechargement pendant l'écriture, ou un échec,
// ne la retente pas une seconde fois.
export function useResumeFavoriteIntent(recipeId: string, fav: boolean, apply: () => void) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sp = new URLSearchParams(location.search);
    if (sp.get(PARAM) !== recipeId) return;
    const url = new URL(location.href);
    url.searchParams.delete(PARAM);
    router.replace(url.pathname + url.search, { scroll: false });
    if (!fav) apply();
    // Volontairement une seule fois, au montage : ni `fav` ni `apply`
    // (recréée à chaque rendu) ne doivent réarmer l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
