'use client';

// État partagé de l'écran de recherche avancée.
//
// Parti pris : l'URL est le seul état de l'écran, et les résultats restent
// rendus par le Server Component. Les facettes n'appellent donc pas d'API de
// résultats — elles réécrivent l'URL (`router.replace`), Next re-rend la page
// côté serveur et renvoie la nouvelle grille. Une seule grille à maintenir :
// les bandeaux publicitaires, les pictos d'allergènes (résolus côté serveur)
// et `RecipeCard` fonctionnent sans duplication côté client.
//
// Deux conséquences utiles :
//  - les requêtes concurrentes sont gérées par le routeur (une navigation en
//    remplace une autre), sans AbortController ni résultat périmé ;
//  - retour arrière, rechargement et partage de lien restituent la recherche.
//
// L'état local `criteria` sert d'affichage optimiste : les contrôles réagissent
// immédiatement, la navigation suit (débouncée pour la saisie et le curseur).
// Il est resynchronisé dès que le serveur rend d'autres critères.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { criteriaToQueryString, PAGE_SIZE, type SearchCriteria } from '@/lib/search-params';

// Délai de regroupement des réglages continus (saisie, curseur de temps) :
// sans lui, chaque cran du curseur déclencherait une requête.
const DEBOUNCE_MS = 300;

type SearchContextValue = {
  /** Critères affichés (optimistes). */
  criteria: SearchCriteria;
  /** Une navigation est en cours : les résultats affichés sont périmés. */
  pending: boolean;
  /** Applique de nouveaux critères et remet la pagination à zéro. */
  update: (next: SearchCriteria, opts?: { debounce?: boolean }) => void;
  /** Palier de pagination suivant, sans toucher aux critères. */
  showMore: () => void;
  /** Tiroir de critères (< 1024 px). */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
};

const SearchContext = createContext<SearchContextValue | null>(null);

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch doit être utilisé dans <SearchProvider>');
  return ctx;
}

export function SearchProvider({
  criteria: serverCriteria,
  initialPanelOpen = false,
  children,
}: {
  criteria: SearchCriteria;
  initialPanelOpen?: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [criteria, setCriteria] = useState(serverCriteria);
  const [panelOpen, setPanelOpen] = useState(initialPanelOpen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Empreinte des critères rendus par le serveur : `serverCriteria` est un
  // objet reconstruit à chaque rendu, inutilisable tel quel comme dépendance.
  const serverKey = criteriaToQueryString(serverCriteria);

  useEffect(() => {
    setCriteria(serverCriteria);
    // serverKey résume serverCriteria ; le suivre évite une boucle de rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const navigate = useCallback(
    (next: SearchCriteria) => {
      const qs = criteriaToQueryString(next);
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  const update = useCallback(
    (next: SearchCriteria, opts?: { debounce?: boolean }) => {
      // Tout changement de critère ou de tri repart de la première page : on
      // ne concatène jamais des cartes issues de deux jeux de critères.
      const target: SearchCriteria = { ...next, shown: PAGE_SIZE };
      setCriteria(target);
      if (timer.current) clearTimeout(timer.current);
      if (opts?.debounce) timer.current = setTimeout(() => navigate(target), DEBOUNCE_MS);
      else navigate(target);
    },
    [navigate],
  );

  const showMore = useCallback(() => {
    const target: SearchCriteria = { ...criteria, shown: criteria.shown + PAGE_SIZE };
    setCriteria(target);
    if (timer.current) clearTimeout(timer.current);
    navigate(target);
  }, [criteria, navigate]);

  const value = useMemo(
    () => ({ criteria, pending, update, showMore, panelOpen, setPanelOpen }),
    [criteria, pending, update, showMore, panelOpen],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}
