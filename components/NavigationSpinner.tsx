'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Spinner } from '@/components/Spinner';

// Overlay de chargement affiché PAR-DESSUS la page courante pendant les
// navigations internes : l'ancienne page reste montée, floutée, derrière le
// fouet (plus d'écran plein sur fond uni). On ne remplace donc plus la page,
// on la superpose.
//
// L'App Router n'expose pas d'événements de navigation ; on détecte donc :
//  - le départ : un clic sur un lien interne, ou un retour/avant du navigateur ;
//  - l'arrivée : le changement de `pathname` / `searchParams` (page rendue).
// Un léger délai avant l'affichage évite le clignotement sur une navigation
// instantanée ; un filet de sécurité masque l'overlay au bout de 12 s.
//
// Le départ est détecté à la fois sur `click` (souris, clavier) et sur
// `pointerdown` pour les pointeurs tactiles : sur certains navigateurs
// mobiles, l'écart entre le tapotement et l'événement `click` synthétique
// peut dépasser le délai d'affichage, ce qui masque l'overlay avant même
// qu'il ait eu la chance d'apparaître. `pointerdown` réagit dès l'appui.
export function NavigationSpinner() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (safetyTimer.current) clearTimeout(safetyTimer.current);
  };

  // Arrivée sur la nouvelle page → on masque l'overlay.
  useEffect(() => {
    clearTimers();
    setVisible(false);
  }, [pathname, search]);

  useEffect(() => {
    const start = () => {
      clearTimers();
      showTimer.current = setTimeout(() => setVisible(true), 120);
      safetyTimer.current = setTimeout(() => setVisible(false), 12000);
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

    // Retour / avant du navigateur.
    const onPopState = () => start();

    // Capture pour intercepter avant que Next ne gère le clic du <Link>.
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('popstate', onPopState);
      clearTimers();
    };
  }, []);

  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background/40 backdrop-blur-[2px] transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {visible ? <Spinner size={84} /> : null}
    </div>
  );
}
