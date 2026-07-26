'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { LoadingOverlay } from '@/components/LoadingOverlay';

// Overlay de chargement affiché PAR-DESSUS la page courante pendant les
// navigations internes : l'ancienne page reste montée, floutée, derrière le
// fouet (plus d'écran plein sur fond uni). On ne remplace donc plus la page,
// on la superpose.
//
// L'App Router n'expose pas d'événements de navigation ; on détecte donc :
//  - le départ : un clic sur un lien interne, la soumission d'un formulaire
//    de recherche (role="search"), ou un retour/avant du navigateur ;
//  - l'arrivée : le changement de `pathname` / `searchParams` (page rendue).
// Un léger délai avant l'affichage évite le clignotement sur une navigation
// instantanée ; un filet de sécurité masque l'overlay au bout de 12 s.
//
// Le départ est détecté à la fois sur `click` (souris, clavier) et sur
// `pointerdown` pour les pointeurs tactiles : sur certains navigateurs
// mobiles, l'écart entre le tapotement et l'événement `click` synthétique
// peut dépasser le délai d'affichage, ce qui masque l'overlay avant même
// qu'il ait eu la chance d'apparaître. `pointerdown` réagit dès l'appui.
//
// Les barres de recherche (HomeSearch, HeaderSearch) redirigent en JS via
// `router.push` plutôt qu'une vraie soumission de formulaire : on ne peut
// donc pas les détecter comme un lien. On écoute `submit` en capture sur les
// formulaires `role="search"` — ce mécanisme centralisé évite de dupliquer un
// spinner local par composant, dont l'état (`isPending` d'un useTransition)
// peut rester bloqué à `true` si le Router Cache gèle la page pendant la
// transition et la restaure telle quelle sur un retour navigateur.
export function NavigationSpinner() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL effectivement rendue par React (et non celle de `history`, que le
  // navigateur met à jour avant même d'émettre `popstate`) : sert à savoir,
  // lors d'un retour navigateur, si la page de destination est déjà affichée.
  const committedUrl = pathname + (search.toString() ? `?${search}` : '');
  const committedUrlRef = useRef(committedUrl);

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
  };

  // Arrivée sur la nouvelle page → on masque l'overlay. La dépendance est une
  // chaîne : `search` est un objet recréé à chaque rendu, donc inutilisable
  // tel quel comme dépendance.
  useEffect(() => {
    committedUrlRef.current = committedUrl;
    clearTimers();
    setVisible(false);
  }, [committedUrl]);

  useEffect(() => {
    const start = () => {
      clearTimers();
      showTimer.current = setTimeout(() => setVisible(true), 120);
      safetyTimer.current = setTimeout(() => setVisible(false), 8000);
    };

    const isInternalNavigation = (target: EventTarget | null) => {
      const anchor = (target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return false;
      if (!anchor.getAttribute('href')) return false;
      if (anchor.target && anchor.target !== '_self') return false;
      if (anchor.hasAttribute('download')) return false;

      const url = new URL(anchor.href, window.location.href);
      // Liens externes ou protocoles spéciaux (mailto:, tel:…) : ignorés.
      if (url.origin !== window.location.origin) return false;
      // Même URL (ancre sur la page courante) : pas de navigation.
      if (
        url.pathname === window.location.pathname &&
        url.search === window.location.search
      ) {
        return false;
      }
      return true;
    };

    const onClick = (e: MouseEvent) => {
      // On ignore les clics « augmentés » (nouvel onglet, sélection…).
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (isInternalNavigation(e.target)) start();
    };

    // Tactile : réagit dès l'appui plutôt que d'attendre le `click` de
    // synthèse (voir note ci-dessus). Les pointeurs souris sont laissés à
    // `click`, qui gère déjà correctement les modificateurs.
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      if (isInternalNavigation(e.target)) start();
    };

    // Retour / avant du navigateur. Contrairement à un clic sur un lien, le
    // navigateur a déjà mis `history` à jour quand l'événement nous parvient,
    // et Next — dont l'écouteur est enregistré avant le nôtre — a souvent déjà
    // rendu la page de destination (route en cache). Déclencher le spinner
    // dans ce cas l'affichait par-dessus une page pourtant arrivée, sans plus
    // aucun changement de route pour le masquer ensuite : il restait jusqu'au
    // filet de sécurité. On ne l'affiche donc que si React n'a pas encore
    // committé l'URL vers laquelle on revient.
    const onPopState = () => {
      const target = window.location.pathname + window.location.search;
      if (committedUrlRef.current === target) return;
      start();
    };

    // Soumission d'une barre de recherche (HomeSearch, HeaderSearch) :
    // `preventDefault()` dans leur propre handler n'empêche pas cet écouteur
    // en capture de recevoir l'événement en premier.
    const onSubmit = (e: SubmitEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('form[role="search"]')) start();
    };

    // Capture pour intercepter avant que Next ne gère le clic du <Link>.
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('popstate', onPopState);
      clearTimers();
    };
  }, []);

  return <LoadingOverlay visible={visible} />;
}
