'use client';

// Mémorise le chemin précédent (pathname + recherche) au fil des navigations
// côté client, pour `RetourContextuel` (cf. lib/return-nav.ts).
//
// Monté une seule fois dans `app/layout.tsx`, qui ne se démonte JAMAIS entre
// deux navigations côté client (seul le segment de page change dans l'App
// Router) : son état survit donc à toute la session de navigation dans cet
// onglet, sans avoir besoin de `sessionStorage` ni d'un horodatage de
// péremption. Trois alternatives écartées à la conception :
//
//  - `document.referrer` : jamais mis à jour par le routeur (navigation par
//    `history.pushState`), resterait figé sur le dernier chargement complet ;
//  - un paramètre `?from=` dans l'URL : polluerait l'URL partagée et la
//    canonique SEO de la fiche recette ;
//  - `sessionStorage` avec péremption (~30 min) : fonctionne, mais peut
//    afficher un retour vers une recherche qu'on a quittée depuis longtemps
//    dans le même onglet. Le suivi en mémoire ci-dessous ne connaît QUE le
//    chemin réellement précédent dans cette session de navigation — jamais
//    une valeur périmée, sans qu'aucun délai n'ait à être choisi.
//
// Conséquence assumée, dans les deux sens : rechargement complet, lien
// externe ou nouvel onglet → aucun précédent connu → les écrans de
// destination retombent sur leur fil d'Ariane statique, jamais une fausse
// information.
//
// `PathTracker` est séparé du provider et seul à appeler `useSearchParams` :
// cette API impose une frontière de Suspense à l'endroit où elle est lue
// (même contrainte que `NavigationSpinner`, cf. son en-tête). L'isoler dans
// un composant sans rendu, plutôt que d'envelopper `children` — c'est-à-dire
// tout le site — dans cette frontière, évite qu'une suspension ne fasse
// disparaître l'app entière le temps de sa résolution.
import { createContext, useCallback, useContext, useEffect, useRef, useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const Ctx = createContext<string | null>(null);

function PathTracker({ onChange }: { onChange: (path: string) => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const current = pathname + (search.toString() ? `?${search}` : '');
  // Le chemin courant tel qu'affiché, gardé à part de l'état exposé : on ne
  // fait glisser `current` vers « précédent » qu'au changement RÉEL de
  // route, jamais à chaque rendu (ce composant se re-rend pour d'autres
  // raisons, ex. l'overlay de chargement qui se superpose).
  const currentRef = useRef(current);

  useEffect(() => {
    if (currentRef.current === current) return;
    onChange(currentRef.current);
    currentRef.current = current;
  }, [current, onChange]);

  return null;
}

export function PreviousPathProvider({ children }: { children: React.ReactNode }) {
  const [previous, setPrevious] = useState<string | null>(null);
  const onChange = useCallback((path: string) => setPrevious(path), []);

  return (
    <Ctx.Provider value={previous}>
      <Suspense fallback={null}>
        <PathTracker onChange={onChange} />
      </Suspense>
      {children}
    </Ctx.Provider>
  );
}

// Chemin (pathname + recherche) affiché juste avant celui-ci dans cette
// session de navigation, ou `null` si c'est le premier rendu côté client
// (chargement initial, rechargement, lien externe).
export function usePreviousPath(): string | null {
  return useContext(Ctx);
}
