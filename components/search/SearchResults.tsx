'use client';

// Enveloppe des résultats : estompe la grille pendant qu'une nouvelle page
// arrive du serveur, et porte `aria-busy` pour les lecteurs d'écran.
//
// Volontairement pas de fouet ici : sur la colonne desktop, chaque case
// cochée relance une requête, et un overlay plein écran à chaque réglage
// rendrait l'écran « résultats en direct » inutilisable. Le fouet reste
// réservé aux actions ponctuelles (validation du tiroir, « Charger plus »).
import type { ReactNode } from 'react';
import { useSearch } from '@/components/search/SearchProvider';

export function SearchResults({ children }: { children: ReactNode }) {
  const { pending } = useSearch();
  return (
    <div className="search-results" aria-busy={pending}>
      {children}
    </div>
  );
}
