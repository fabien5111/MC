'use client';

// Rejoue un geste « bascule » (favori, vote…) interrompu par une redirection
// vers la connexion.
//
// `connexionHref(next)` (lib/nav.ts) restitue l'ÉCRAN de départ après
// connexion, mais pas le GESTE qui l'a précédé : un visiteur déconnecté qui
// clique « Favori » ou vote pour une idée, se connecte, puis revient sur le
// même écran retrouvait jusqu'ici l'état de départ — il fallait recliquer.
//
// Un marqueur `?<param>=<id>` voyage dans le `next=` (donc à travers
// `/connexion`, `LoginForm.router.replace(next)`) jusqu'à la page de
// destination ; `useResumeIntent`, monté par le bouton concerné, le
// consomme une fois de retour et rejoue l'action.
//
// Un seul mécanisme pour tout bouton bascule à deux états, plutôt qu'une
// copie par bouton (`FavoriteButton`/`FavoriteHeart` l'utilisaient d'abord
// en double sous des noms « favori » avant cette extraction ; `VoteButton`
// s'en sert désormais aussi) — même motif que `connexionHref` lui-même,
// factorisé plutôt que recopié composant par composant.
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// À appeler dans la branche `!user` d'un bouton bascule, à la place de
// `location.pathname + location.search` nu. `param` distingue le type de
// geste ('favori', 'vote'…) ; `id` identifie l'objet sur lequel il porte.
export function intentPath(param: string, id: string): string {
  const url = new URL(location.href);
  url.searchParams.set(param, id);
  return url.pathname + url.search;
}

// À appeler une fois au montage de chaque bouton bascule (un par objet :
// une grille en affiche plusieurs, seul celui dont l'`id` correspond doit
// réagir). Nettoie le marqueur de l'URL avant de rejouer l'action — jamais
// après — pour qu'un rechargement pendant l'écriture, ou un échec, ne la
// retente pas une seconde fois. `active` est l'état courant du bouton
// (`fav`, `hasVoted`…) : l'action n'est rejouée que si le geste n'a pas déjà
// abouti par un autre chemin.
export function useResumeIntent(param: string, id: string, active: boolean, apply: () => void) {
  const router = useRouter();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const sp = new URLSearchParams(location.search);
    if (sp.get(param) !== id) return;
    const url = new URL(location.href);
    url.searchParams.delete(param);
    router.replace(url.pathname + url.search, { scroll: false });
    if (!active) apply();
    // Volontairement une seule fois, au montage : ni `active` ni `apply`
    // (recréée à chaque rendu) ne doivent réarmer l'effet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
