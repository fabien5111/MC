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
// instantanée ; un filet de sécurité masque l'overlay au bout de 4 s.
//
// Piège vérifié dans les sources de Next (`HistoryUpdater`,
// app-router.js) : `window.history.pushState` — donc `window.location` — n'est
// posé qu'au commit du routeur, exactement en même temps que `pathname` /
// `searchParams` changent, jamais avant. Il est donc impossible de détecter
// « cette navigation n'aboutira à aucun changement d'URL » en comparant
// `window.location` à l'URL de départ pendant l'attente : sur une route sans
// cache (`force-dynamic`, ex. `/carnet`) ou simplement lente, `window.location`
// reste celle de départ tant que le nouveau rendu n'est pas revenu — un tel
// filet éteindrait le spinner sur une navigation bien réelle, juste lente.
// (Une tentative en ce sens a été revertée pour cette raison — cf. historique
// git.) Le cas « lien ciblant l'URL de départ après une redirection serveur »
// reste donc couvert par le seul filet de sécurité à 4 s.
//
// `console.debug('[spinner-timing]', …)` : instrumentation temporaire pour
// mesurer la durée réelle de l'overlay par déclencheur (aide à trancher la
// question « le spinner ralentit-il la page » sans deviner). À retirer une
// fois la mesure faite sur dev.jepatisse.com.
//
// Le départ est détecté sur `click` (souris, clavier) et, pour les pointeurs
// tactiles, dès le relâchement du doigt : sur certains navigateurs mobiles,
// l'écart entre le tapotement et l'événement `click` synthétique peut
// dépasser le délai d'affichage, ce qui masque l'overlay avant même qu'il ait
// eu la chance d'apparaître. On ne peut pas pour autant réagir dès l'appui
// (`pointerdown`) : les photos des cartes de recette étant enveloppées dans
// un lien, poser le doigt dessus pour faire défiler la page déclencherait le
// spinner alors qu'aucune navigation ne suit. On suit donc le geste complet
// (appui → déplacement → relâchement) et on n'arme le spinner que si le doigt
// n'a pas bougé, c'est-à-dire s'il s'agit bien d'un tapotement.
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

  // Navigation déjà signalée, en attente d'arrivée : évite qu'un second
  // déclencheur pour le même geste (le `click` qui suit un tapotement) ne
  // relance le délai d'affichage depuis le début.
  const pending = useRef(false);
  // Horodatage et URL de départ au moment de l'armement, uniquement pour
  // l'instrumentation ci-dessous (durée réellement affichée par déclencheur).
  const armedAt = useRef<number | null>(null);
  const armedFromUrl = useRef<string | null>(null);
  const shown = useRef(false);

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
    pending.current = false;
  };

  const logTiming = (reason: string) => {
    if (armedAt.current === null) return;
    const elapsed = Math.round(performance.now() - armedAt.current);
    console.debug(
      `[spinner-timing] ${reason} — ${elapsed}ms depuis ${armedFromUrl.current}` +
        (shown.current ? ' (overlay affiché)' : ' (jamais affiché, <120ms)'),
    );
  };

  // Arrivée sur la nouvelle page → on masque l'overlay. La dépendance est une
  // chaîne : `search` est un objet recréé à chaque rendu, donc inutilisable
  // tel quel comme dépendance.
  useEffect(() => {
    const wasPending = pending.current;
    committedUrlRef.current = committedUrl;
    clearTimers();
    setVisible(false);
    if (wasPending) logTiming('navigation-committed');
  }, [committedUrl]);

  useEffect(() => {
    const start = () => {
      if (pending.current) return;
      clearTimers();
      pending.current = true;
      armedAt.current = performance.now();
      armedFromUrl.current = committedUrlRef.current;
      shown.current = false;
      showTimer.current = setTimeout(() => {
        setVisible(true);
        shown.current = true;
      }, 120);
      safetyTimer.current = setTimeout(() => {
        logTiming('safety-timeout');
        setVisible(false);
        pending.current = false;
      }, 4000);
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
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!isInternalNavigation(e.target)) return;
      // Écouteur en capture : il reçoit l'événement avant tout gestionnaire
      // React porté par l'ancre elle-même (ex. une navigation interceptée
      // pour un défilement en page). `defaultPrevented` n'est donc fiable
      // qu'une fois la diffusion de l'événement terminée — on le relit après
      // coup plutôt qu'ici, où il vaut toujours `false`.
      setTimeout(() => {
        if (!e.defaultPrevented) start();
      }, 0);
    };

    // Tactile : on suit le geste pour distinguer un tapotement d'un début de
    // défilement (voir note en tête de fichier). Les pointeurs souris sont
    // laissés à `click`, qui gère déjà correctement les modificateurs.
    // Au-delà de ce seuil de déplacement, le geste est un défilement.
    const TAP_SLOP = 10;
    let tap: { id: number; x: number; y: number } | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      tap = isInternalNavigation(e.target)
        ? { id: e.pointerId, x: e.clientX, y: e.clientY }
        : null;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!tap || e.pointerId !== tap.id) return;
      if (Math.abs(e.clientX - tap.x) > TAP_SLOP || Math.abs(e.clientY - tap.y) > TAP_SLOP) {
        tap = null;
      }
    };

    // Le navigateur prend la main sur le geste (défilement, zoom…).
    const onPointerCancel = () => {
      tap = null;
    };

    const onPointerUp = (e: PointerEvent) => {
      const started = tap;
      tap = null;
      if (!started || e.pointerId !== started.id) return;
      // Le doigt peut avoir été relâché ailleurs que sur le lien de départ.
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
    // `pointermove` est passif : on n'y appelle jamais `preventDefault()`, et
    // un écouteur non passif sur tout le document pénaliserait le défilement.
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    document.addEventListener('pointercancel', onPointerCancel, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('submit', onSubmit, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('submit', onSubmit, true);
      window.removeEventListener('popstate', onPopState);
      clearTimers();
    };
  }, []);

  return <LoadingOverlay visible={visible} />;
}
