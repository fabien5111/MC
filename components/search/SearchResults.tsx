'use client';

// Enveloppe des résultats : porte le fouet « Le Fouet » pendant qu'une
// nouvelle page arrive du serveur, et `aria-busy` pour les lecteurs d'écran.
//
// C'est le point unique d'affichage du spinner sur l'écran de recherche —
// validation du tiroir, « Charger plus » et réglage d'une facette passent
// tous par la même navigation, donc par le même overlay. Le déclarer ici
// évite d'en empiler plusieurs, ce qui doublerait le voile.
//
// Le délai avant affichage reprend celui de NavigationSpinner : un
// rafraîchissement quasi instantané ne doit pas produire un clignotement.
//
// Exception : la saisie du champ texte (`silent`, cf. SearchProvider) ne
// déclenche jamais le voile — il clignoterait à chaque pause de frappe et
// cacherait le champ. `showOverlay` porte cette exception ; `aria-busy`
// reste sur `pending`, l'état de navigation réel.
import { useEffect, useState, type ReactNode } from 'react';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useSearch } from '@/components/search/SearchProvider';

const SHOW_DELAY_MS = 120;

export function SearchResults({ children }: { children: ReactNode }) {
  const { pending, showOverlay } = useSearch();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!showOverlay) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [showOverlay]);

  return (
    <div className="search-results" aria-busy={pending}>
      {children}
      <LoadingOverlay visible={visible} label="Recherche en cours" />
    </div>
  );
}
