'use client';

// Mémorise l'historique des chemins visités au fil des navigations côté
// client, pour en dériver le dernier écran de LISTE reconnu (résultats de
// recherche, carnet, profil…) — c'est ce que `RetourContextuel` affiche.
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
//    dans le même onglet. Le suivi en mémoire ci-dessous ne connaît QUE les
//    chemins réellement visités dans cette session de navigation — jamais
//    une valeur périmée, sans qu'aucun délai n'ait à être choisi.
//
// **Ne retient pas que l'écran immédiatement précédent.** Une première
// version ne gardait qu'un seul chemin (« le précédent »), et se laissait
// donc perdre par un simple détour : recherche → profil d'un pâtissier →
// une de ses recettes → « ← @pseudo » pour revenir au profil, et le profil
// affichait alors « Accueil » — la fiche recette qu'on venait de quitter
// n'étant pas elle-même un écran de liste, tandis que le souvenir de la
// recherche, plus ancien, avait été écrasé. La pile ci-dessous conserve
// tout l'historique de la session, et `RetourContextuel` remonte jusqu'au
// dernier écran de liste reconnu, aussi loin qu'il faille — un détour par
// une fiche recette ou une fournée ne doit jamais faire perdre le souvenir
// d'une recherche ou d'un carnet plus ancien.
//
// Conséquence assumée, dans les deux sens : rechargement complet, lien
// externe ou nouvel onglet → aucun historique connu → les écrans de
// destination retombent sur leur fil d'Ariane statique, jamais une fausse
// information.
import { createContext, useCallback, useContext, useEffect, useRef, useState, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { labelForReturnPath, type ReturnOrigin } from '@/lib/return-nav';

// Bornée : une session de navigation très longue ne doit pas accumuler un
// historique sans fin. Largement suffisant pour retrouver un écran de liste
// visité plusieurs pages plus tôt — au-delà, le repli statique de
// `RetourContextuel` reprend la main, jamais une erreur.
const HISTORY_LIMIT = 30;

const Ctx = createContext<ReturnOrigin | null>(null);

function PathTracker({ onChange }: { onChange: (origin: ReturnOrigin | null) => void }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const current = pathname + (search.toString() ? `?${search}` : '');
  // Le chemin courant tel qu'affiché, gardé à part de la pile : on ne pousse
  // dans l'historique qu'au changement RÉEL de route, jamais à chaque rendu
  // (ce composant se re-rend pour d'autres raisons, ex. l'overlay de
  // chargement qui se superpose). La pile elle-même est une ref, pas un
  // state : elle ne doit provoquer aucun rendu par elle-même, seul l'origine
  // qui en découle (exposée via le contexte) en a besoin.
  const currentRef = useRef(current);
  const stackRef = useRef<string[]>([]);

  useEffect(() => {
    if (currentRef.current === current) return;
    stackRef.current.push(currentRef.current);
    if (stackRef.current.length > HISTORY_LIMIT) stackRef.current.shift();
    currentRef.current = current;

    // Remonte l'historique du plus récent au plus ancien : le premier écran
    // de liste reconnu l'emporte, qu'il date d'un ou de dix pas en arrière.
    // Exclut les entrées identiques à la page courante — sans quoi revenir
    // sur un écran de liste par son propre lien contextuel (ex. le profil
    // qu'on vient de quitter, encore présent plus haut dans la pile) lui
    // ferait afficher un retour vers lui-même.
    for (let i = stackRef.current.length - 1; i >= 0; i--) {
      const path = stackRef.current[i];
      if (path === current) continue;
      const label = labelForReturnPath(path.split('?')[0].split('#')[0]);
      if (label) {
        onChange({ href: path, label });
        return;
      }
    }
    onChange(null);
  }, [current, onChange]);

  return null;
}

export function PreviousPathProvider({ children }: { children: React.ReactNode }) {
  const [origin, setOrigin] = useState<ReturnOrigin | null>(null);
  const onChange = useCallback((o: ReturnOrigin | null) => setOrigin(o), []);

  return (
    <Ctx.Provider value={origin}>
      {/* `PathTracker` est seul à appeler `useSearchParams` : cette API
          impose une frontière de Suspense à l'endroit où elle est lue (même
          contrainte que `NavigationSpinner`, cf. son en-tête). L'isoler dans
          un composant sans rendu, plutôt que d'envelopper `children` —
          c'est-à-dire tout le site — dans cette frontière, évite qu'une
          suspension ne fasse disparaître l'app entière le temps de sa
          résolution. */}
      <Suspense fallback={null}>
        <PathTracker onChange={onChange} />
      </Suspense>
      {children}
    </Ctx.Provider>
  );
}

// Dernier écran de liste reconnu dans l'historique de cette session de
// navigation (résultats de recherche, carnet, profil…), ou `null` si aucun
// — premier rendu côté client, rechargement, lien externe, ou historique qui
// n'en contient aucun.
export function useReturnOrigin(): ReturnOrigin | null {
  return useContext(Ctx);
}
