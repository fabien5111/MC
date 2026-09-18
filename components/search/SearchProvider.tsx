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
  /**
   * `pending`, sauf pendant une saisie texte (`silent`) : le fouet plein
   * écran clignoterait à chaque pause de frappe et cacherait le champ.
   */
  showOverlay: boolean;
  /** Applique de nouveaux critères et remet la pagination à zéro. */
  update: (next: SearchCriteria, opts?: { debounce?: boolean; silent?: boolean }) => void;
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
  // Vrai tant que la navigation en cours provient uniquement de la saisie du
  // champ texte : lu au moment du rendu (même tick que la mise à jour de
  // `pending` par la transition), pas besoin d'un state dédié.
  const silentNav = useRef(false);

  // Empreinte des critères rendus par le serveur : `serverCriteria` est un
  // objet reconstruit à chaque rendu, inutilisable tel quel comme dépendance.
  const serverKey = criteriaToQueryString(serverCriteria);

  // Empreinte des derniers critères posés localement, et « une navigation est
  // partie (ou attend son debounce) sans que l'URL l'ait rattrapée ». Sans ces
  // deux repères, la resynchronisation ci-dessous réécrivait `criteria` avec
  // l'écho de sa PROPRE navigation débouncée, en retard du debounce plus du
  // rendu serveur : `criteria.q` étant la valeur du champ, les lettres tapées
  // entre-temps étaient perdues et le curseur sautait en fin de champ (même
  // défaut que `CarnetToolbar`, JEP-54). Vaut pour tout l'état optimiste, pas
  // seulement le texte — le curseur de temps est débouncé lui aussi.
  const derniereCle = useRef(serverKey);
  const navEnVol = useRef(false);

  useEffect(() => {
    // L'URL a rattrapé ce qu'on a posé : plus rien en vol.
    if (serverKey === derniereCle.current) {
      navEnVol.current = false;
      return;
    }
    // Écho en retard de notre propre navigation : l'état local fait foi.
    if (navEnVol.current) return;
    // Changement venu d'ailleurs — retour arrière du navigateur, lien
    // partagé : c'est ce que cette resynchronisation protège.
    derniereCle.current = serverKey;
    setCriteria(serverCriteria);
    // serverKey résume serverCriteria ; le suivre évite une boucle de rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  // Fin de navigation, mais seulement si aucune frappe n'attend son debounce :
  // sinon le drapeau retomberait entre deux lettres, et l'écho suivant
  // écraserait de nouveau la saisie.
  useEffect(() => {
    if (!pending && !timer.current) navEnVol.current = false;
  }, [pending]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const navigate = useCallback(
    (next: SearchCriteria, silent?: boolean) => {
      silentNav.current = !!silent;
      const qs = criteriaToQueryString(next);
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router],
  );

  // Seul point de pose de l'état optimiste : les deux repères ci-dessus s'y
  // arment ensemble, sinon un chemin d'écriture oublierait l'un des deux.
  const poser = useCallback((target: SearchCriteria) => {
    derniereCle.current = criteriaToQueryString(target);
    navEnVol.current = true;
    setCriteria(target);
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const update = useCallback(
    (next: SearchCriteria, opts?: { debounce?: boolean; silent?: boolean }) => {
      // Tout changement de critère ou de tri repart de la première page : on
      // ne concatène jamais des cartes issues de deux jeux de critères.
      const target: SearchCriteria = { ...next, shown: PAGE_SIZE };
      poser(target);
      if (opts?.debounce)
        timer.current = setTimeout(() => {
          // Remis à null avant de partir : c'est ce qui distingue « une frappe
          // attend » de « la navigation est lancée » pour le filet ci-dessus.
          timer.current = null;
          navigate(target, opts.silent);
        }, DEBOUNCE_MS);
      else navigate(target, opts?.silent);
    },
    [navigate, poser],
  );

  const showMore = useCallback(() => {
    const target: SearchCriteria = { ...criteria, shown: criteria.shown + PAGE_SIZE };
    poser(target);
    navigate(target);
  }, [criteria, navigate, poser]);

  const showOverlay = pending && !silentNav.current;

  const value = useMemo(
    () => ({ criteria, pending, showOverlay, update, showMore, panelOpen, setPanelOpen }),
    [criteria, pending, showOverlay, update, showMore, panelOpen],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}
