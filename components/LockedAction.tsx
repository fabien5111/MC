'use client';

// Repère unique d'une action que la formule du membre n'autorise pas, ou dont
// le crédit du mois est épuisé (JEP-130).
//
// **Pourquoi l'action reste VISIBLE.** Avant ce composant, cinq grammaires
// cohabitaient (relevé complet dans docs/abonnements.md §14), dont deux par
// accident : un bouton purement absent, sans un mot (fusion de listes,
// poignée de réordonnancement, remplacement d'un ingrédient), et un refus
// découvert seulement après le clic (bouton « Projet » du carnet). Une action
// qui n'existe pas ne s'explique pas : le membre ne pouvait pas savoir
// qu'elle existait, donc pas non plus qu'elle était payante.
//
// **Deux motifs, deux composants**, et c'est la signature qui les sépare
// plutôt qu'un drapeau — impossible de se tromper d'issue :
//
// - `LockedAction` — le droit n'est pas dans la formule. Un tap/clic révèle
//   l'explication ET le lien vers `/plans` (voir plus bas pourquoi).
// - `LockedHint` — le droit existe, le crédit du mois est consommé. Le
//   contrôle reste en place, désactivé, et n'apporte que l'explication.
//   **Aucun lien** : le crédit se renouvelle seul à la prochaine période,
//   inviter à payer serait mensonger. Doctrine posée au JEP-77
//   (§ « Quota épuisé signalé avant le clic »), conservée telle quelle.
//
// **`LockedAction` : infobulle tactile (Popover API native), même principe
// que `AllergenPicto`.** Un premier jet reposait sur `:hover`/`:focus` et
// naviguait directement au premier tap sur mobile, faute de survol — l'exact
// défaut que le `title` HTML de l'ancien picto d'allergène avait déjà pour
// motif d'abandon. Le repère est donc un **bouton**, jamais un lien : le
// clic/tap ouvre un popover contenant le motif et le SEUL lien réel vers
// `/plans` — un geste supplémentaire, mais explicable et identique sur
// souris, tactile et clavier (Entrée/Espace sur le bouton ouvrent le
// popover ; Tab suivant atteint le lien). `LockedHint` ne peut pas
// reprendre ce mécanisme : son contenu est un vrai contrôle `disabled`
// (bouton, `input`), et un élément désactivé ne déclenche jamais
// d'événement `click` à intercepter — c'est justement pour ça qu'il ne
// porte qu'une explication, jamais de navigation.
//
// Élément top-layer (comme `AllergenPicto`) : il ne peut pas s'ancrer via un
// parent `position: relative`, d'où le repositionnement manuel au clic, sur
// les coordonnées du bouton — aligné à DROITE plutôt que centré (ces repères
// sont presque tous en fin de ligne, et le message est plus long qu'un nom
// d'allergène : centré, il déborderait à gauche de l'écran).
//
// **La bulle vit dans un portail, et n'est jamais interactive.** Deux
// raisons contraignantes, toutes deux vérifiées dans le code appelant, et
// qui motivent `LockedHint` (portail + `useBulle`, ci-dessous) : celui-ci
// enveloppe un contrôle déjà existant, pas question de le remplacer par un
// bouton.
//
//  1. `PlanningDayView` monte ses journées dans un `<details>` en
//     `overflow-hidden` (arrondi) : une bulle en `absolute` y serait rognée.
//  2. Cinq des conteneurs appelants portent déjà la classe `group`
//     (`<details className="group">`, cartes de `CuisineContent`). Une
//     variante `group-hover:` sur la bulle aurait donc répondu au survol de
//     TOUT le conteneur, pas seulement du repère.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

const PICTO = 'material-symbols-outlined shrink-0 text-[18px] leading-none';

export function LockedAction({
  message,
  label,
  children,
  className,
}: {
  /** Motif, en une phrase. Nomme la fonctionnalité — jamais « non autorisé » seul. */
  message: string;
  /**
   * Nom de l'action pour les lecteurs d'écran. Indispensable quand le repère
   * remplace une icône seule : le picto `block` dit « interdit », pas
   * « ajouter une note ».
   */
  label: string;
  /**
   * Libellé grisé, quand l'action en porte un. L'icône d'origine, elle, ne
   * se passe jamais ici : le picto `block` la remplace. Omis, seul le picto
   * s'affiche — c'est le cas des actions réduites à une icône de 18 px.
   */
  children?: ReactNode;
  className?: string;
}) {
  const popoverId = `locked-action-${useId()}`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Positionné au clic/tap, comme AllergenPicto : un popover natif ne peut
  // pas s'ancrer sur son déclencheur via du CSS pur.
  function toggle() {
    const btn = btnRef.current;
    const pop = popRef.current;
    if (!btn || !pop) return;
    const rect = btn.getBoundingClientRect();
    pop.style.left = `${rect.right}px`;
    pop.style.top = `${rect.bottom + 6}px`;
    pop.togglePopover();
  }

  return (
    <span className={`no-print relative inline-flex items-center gap-1.5 ${className ?? ''} text-on-surface-variant/60`}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={`${label} — non inclus dans votre formule`}
        aria-describedby={popoverId}
        className="inline-flex cursor-help items-center gap-1.5 border-0 bg-transparent p-0"
      >
        <span className={PICTO} aria-hidden>
          block
        </span>
        {children}
      </button>
      <div
        ref={popRef}
        id={popoverId}
        popover="auto"
        role="tooltip"
        // `inset-auto m-0 border-0` reprend le reset d'AllergenPicto :
        // l'UA pose par défaut une bordure, une marge et un centrage sur
        // tout élément `popover`.
        className="inset-auto m-0 w-max max-w-[min(17rem,70vw)] -translate-x-full rounded border-0 bg-primary px-3 py-2 text-left font-body-md text-[12px] leading-snug text-white shadow-lg"
      >
        {message}
        <Link href="/plans" prefetch={false} className="mt-1.5 block font-label-md text-[11px] underline">
          Voir les formules
        </Link>
      </div>
    </span>
  );
}

// ── LockedHint ──────────────────────────────────────────────────────────

type Position = { top: number; left: number };

/**
 * Bulle explicative de `LockedHint` — hover/focus, jamais interactive
 * (`pointer-events: none`) : contrairement à `LockedAction`, il n'y a rien à
 * cliquer dedans (pas de lien, le crédit se renouvelle seul), donc pas
 * besoin qu'elle capte le pointeur ni qu'un tap l'ouvre.
 */
function useBulle() {
  const [pos, setPos] = useState<Position | null>(null);

  const montrer = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.right });
  }, []);

  const cacher = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    window.addEventListener('scroll', cacher, true);
    window.addEventListener('resize', cacher);
    return () => {
      window.removeEventListener('scroll', cacher, true);
      window.removeEventListener('resize', cacher);
    };
  }, [pos, cacher]);

  return { pos, montrer, cacher };
}

function Bulle({ message, pos }: { message: string; pos: Position }) {
  return createPortal(
    <span
      role="tooltip"
      className="pointer-events-none fixed z-[60] w-max max-w-[min(17rem,70vw)] -translate-x-full whitespace-normal rounded bg-primary px-3 py-2 text-left font-body-md text-[12px] leading-snug text-white shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      {message}
    </span>,
    document.body,
  );
}

/**
 * Variante pour un contrôle qui EXISTE DÉJÀ et qui est simplement `disabled`
 * (les trois boutons « Importer », le mode d'ajustement par IA quand le
 * crédit est épuisé) : n'apporte que la bulle, sans picto ni style — le
 * contrôle garde entièrement son apparence, c'est l'appelant qui décide
 * d'échanger son icône contre `block`.
 *
 * Reste sur hover/focus (pas le mécanisme tactile de `LockedAction`) :
 * `children` est un vrai contrôle `disabled` (bouton, `input`), qui ne
 * déclenche jamais d'événement `click` — rien à intercepter pour ouvrir un
 * popover au tap. Le `tabIndex` porté par l'enveloppe reste atteignable au
 * clavier, contrairement au contrôle désactivé qu'elle entoure.
 *
 * **Connu, non traité ici** : sur mobile, sans survol, cette bulle reste
 * silencieuse au tap — moins grave que l'ancien défaut de `LockedAction`
 * (elle ne navigue nulle part par erreur), mais elle n'informe pas non plus.
 * Un vrai correctif demanderait un mécanisme différent, hors du périmètre
 * de cette demande.
 */
export function LockedHint({
  message,
  active = true,
  children,
  className,
}: {
  message: string;
  /**
   * `false` rend les enfants **sans aucune enveloppe**. Indispensable : une
   * enveloppe laissée en place hors blocage ajouterait un arrêt de
   * tabulation sur chaque bouton parfaitement utilisable, et changerait sa
   * participation à la mise en page du parent.
   */
  active?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const { pos, montrer, cacher } = useBulle();

  if (!active) return <>{children}</>;
  return (
    <span
      tabIndex={0}
      className={`relative inline-flex ${className ?? ''}`}
      onMouseEnter={(e) => montrer(e.currentTarget)}
      onMouseLeave={cacher}
      onFocus={(e) => montrer(e.currentTarget)}
      onBlur={cacher}
    >
      {children}
      {pos && <Bulle message={message} pos={pos} />}
    </span>
  );
}
