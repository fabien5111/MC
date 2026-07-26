'use client';

// Logique du sommaire de navigation de l'éditeur de recette : section active
// (scroll-spy), défilement doux compensé, estompage pendant la saisie et
// épinglage persistant.
//
// Séparé du markup (components/recipe/RecipeToc.tsx) parce que rien ici ne
// dépend du rendu : le hook ne connaît que des identifiants d'ancre.
import { useCallback, useEffect, useRef, useState } from 'react';

// Clé de persistance de l'épinglage. À déplacer dans les préférences du compte
// le jour où celles-ci existent (le réglage est aujourd'hui par navigateur).
const PIN_KEY = 'maryse.sommaire.pinned';
// Compensation de l'en-tête sticky du site (~73 px) pour que le titre de la
// section visée ne se retrouve pas caché dessous.
const SCROLL_OFFSET = 110;
// Hauteur sous le haut de la fenêtre à partir de laquelle une section est
// considérée comme franchie.
const SPY_THRESHOLD = 160;
// Délai avant de considérer la saisie terminée : évite que le sommaire
// clignote au passage d'un champ au champ suivant.
const TYPING_DELAY = 250;

export type UseTocResult = {
  activeId: string | null;
  pinned: boolean;
  typing: boolean;
  togglePin: () => void;
  navigate: (id: string) => void;
};

// `targetIds` : les ancres dans l'ordre du DOM. `onBeforeNavigate` permet à
// l'appelant de préparer la cible avant le défilement (déplier une étape
// repliée, notamment).
export function useToc(targetIds: string[], onBeforeNavigate?: (id: string) => void): UseTocResult {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pinned, setPinned] = useState(false);
  const [typing, setTyping] = useState(false);

  // Refs plutôt que dépendances d'effet : la liste d'ancres et le callback sont
  // recréés à chaque rendu du formulaire, on ne veut pas réattacher les
  // écouteurs pour autant.
  const idsRef = useRef(targetIds);
  idsRef.current = targetIds;
  const beforeRef = useRef(onBeforeNavigate);
  beforeRef.current = onBeforeNavigate;

  // Scroll-spy. On relit les positions à chaque frame plutôt que de les mettre
  // en cache : dans l'éditeur, les hauteurs changent en permanence (étapes
  // repliées/dépliées, ingrédients ajoutés, images chargées en data-URL), donc
  // toute position mémorisée serait fausse au premier repli.
  //
  // Un IntersectionObserver serait plus économe mais ne sait pas exprimer
  // « la dernière section franchie » : une section d'étape dépasse largement la
  // hauteur de fenêtre, et plus aucune ancre n'intersecte la bande de détection
  // quand on défile en son milieu. Le calcul est donc gardé, mais limité à une
  // frame d'affichage.
  const idsKey = targetIds.join('|');
  useEffect(() => {
    let frame = 0;
    const spy = () => {
      frame = 0;
      const limit = window.scrollY + SPY_THRESHOLD;
      let current: string | null = null;
      for (const id of idsRef.current) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top + window.scrollY <= limit) current = id;
      }
      setActiveId(current);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(spy);
    };
    spy();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [idsKey]);

  // Lecture différée de localStorage : au premier rendu, le serveur ne connaît
  // pas l'épinglage, le lire directement provoquerait un écart d'hydratation.
  useEffect(() => {
    try {
      setPinned(localStorage.getItem(PIN_KEY) === '1');
    } catch {
      // Stockage indisponible (navigation privée, réglages restrictifs) : le
      // sommaire reste simplement non épinglé.
    }
  }, []);

  const togglePin = useCallback(() => {
    setPinned((v) => {
      const next = !v;
      try {
        localStorage.setItem(PIN_KEY, next ? '1' : '0');
      } catch {
        // Idem : l'épinglage reste valable pour la session en cours.
      }
      return next;
    });
  }, []);

  // Estompage pendant la saisie. Écouteurs délégués sur le document : les
  // champs du formulaire apparaissent et disparaissent au fil des ajouts
  // d'étapes et d'ingrédients.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || typeof el.matches !== 'function') return;
      if (!el.matches('input, textarea, select')) return;
      clearTimeout(timer);
      setTyping(true);
    };
    const onFocusOut = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setTyping(false), TYPING_DELAY);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  const navigate = useCallback((id: string) => {
    beforeRef.current?.(id);
    // Double frame : laisse React appliquer le dépliage éventuel déclenché
    // ci-dessus (et le navigateur refaire la mise en page) avant de mesurer la
    // cible — sans quoi le document est encore trop court pour que le
    // défilement l'atteigne.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (!el) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({
          top: el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET,
          behavior: reduce ? 'auto' : 'smooth',
        });
      }),
    );
  }, []);

  return { activeId, pinned, typing, togglePin, navigate };
}
