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
// - `LockedAction` — le droit n'est pas dans la formule. Le repère remplace
//   l'action absente et EST un lien vers `/plans` : c'est la seule porte de
//   sortie, et la page publique porte déjà tout le discours (comparaison,
//   tarifs, essai).
// - `LockedHint` — le droit existe, le crédit du mois est consommé. Le
//   contrôle reste en place, désactivé, et n'apporte que l'explication.
//   **Aucun lien** : le crédit se renouvelle seul à la prochaine période,
//   inviter à payer serait mensonger. Doctrine posée au JEP-77
//   (§ « Quota épuisé signalé avant le clic »), conservée telle quelle.
//
// **La bulle vit dans un portail, et n'est jamais interactive.** Deux raisons
// contraignantes, toutes deux vérifiées dans le code appelant :
//
//  1. `PlanningDayView` monte ses journées dans un `<details>` en
//     `overflow-hidden` (arrondi) : une bulle en `absolute` y serait rognée,
//     exactement le cas qui a imposé un portail à `lib/use-rail-tooltip.tsx`.
//  2. Cinq des conteneurs appelants portent déjà la classe `group`
//     (`<details className="group">`, cartes de `CuisineContent`). Une
//     variante `group-hover:` sur la bulle aurait donc répondu au survol de
//     TOUT le conteneur, pas seulement du repère.
//
// Le lien n'est jamais DANS la bulle, toujours porté par le repère lui-même :
// un lien à l'intérieur d'un portail sort de l'ordre de tabulation, et une
// bulle qu'il faut survoler pour cliquer réclame un délai de grâce que le CSS
// ne sait pas tenir. La bulle est donc purement explicative
// (`pointer-events: none`), et c'est le repère qui navigue.
//
// **Compromis assumé sur mobile** : faute de survol, un appui sur un repère
// `LockedAction` navigue directement vers `/plans`. Le geste est donc à un
// doigt de l'action réelle qu'il remplace — un appui par erreur en pleine
// fournée quitte l'écran. Le retour arrière le rétablit à l'identique (le
// mode Préparer/Pâtisser vit dans l'URL, rien n'est perdu), et c'est le prix
// d'un repère explicable d'un seul geste.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

type Position = { top: number; left: number };

/**
 * Ouverture/fermeture et position de la bulle. Mesurée à chaque survol comme
 * dans `useRailTooltip` : le repère peut être dans une liste défilante, une
 * position retenue au montage serait fausse au premier défilement.
 */
function useBulle() {
  const [pos, setPos] = useState<Position | null>(null);

  const montrer = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    // Alignée à DROITE du repère : ces pictos sont presque tous en fin de
    // ligne, une bulle qui pousse vers la droite sortirait de l'écran.
    setPos({ top: r.bottom + 6, left: r.right });
  }, []);

  const cacher = useCallback(() => setPos(null), []);

  // Un défilement ou un redimensionnement déplace le repère sans qu'aucun
  // `mouseleave` ne vienne corriger la position mesurée.
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
      // `-translate-x-full` plutôt qu'un `right` calculé : la largeur réelle
      // n'est connue qu'après le rendu, la transformation s'en passe.
      className="pointer-events-none fixed z-[60] w-max max-w-[min(17rem,70vw)] -translate-x-full whitespace-normal rounded bg-primary px-3 py-2 text-left font-body-md text-[12px] leading-snug text-white shadow-lg"
      style={{ top: pos.top, left: pos.left }}
    >
      {message}
    </span>,
    document.body,
  );
}

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
  const { pos, montrer, cacher } = useBulle();

  const gestes = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => montrer(e.currentTarget),
    onMouseLeave: cacher,
    onFocus: (e: React.FocusEvent<HTMLElement>) => montrer(e.currentTarget),
    onBlur: cacher,
  };

  // Le picto vient EN TÊTE, et remplace l'icône d'origine de l'action plutôt
  // que de s'y ajouter : sur un bouton de 18 px, deux glyphes côte à côte ne
  // donnent qu'une bouillie, et sur un bouton libellé, « ⊘ Ajouter une
  // sous-étape » se lit mieux que « + Ajouter une sous-étape ⊘ », qui laisse
  // croire un instant que l'action est disponible.
  const contenu = (
    <>
      <span className={PICTO} aria-hidden>
        block
      </span>
      {children}
      {pos && <Bulle message={message} pos={pos} />}
    </>
  );

  // `cursor-help` : le repère a l'air désactivé mais porte une explication et
  // mène à la page des formules. La couleur grise est déclarée APRÈS
  // `className` pour qu'un appelant qui réutilise la classe de son bouton
  // d'origine (souvent `text-primary`) ne rende pas le repère indistinguable
  // d'une action disponible.
  const classes = `no-print relative inline-flex cursor-help items-center gap-1.5 ${className ?? ''} text-on-surface-variant/60`;

  return (
    <Link
      href="/plans"
      prefetch={false}
      aria-label={`${label} — non inclus dans votre formule`}
      className={classes}
      {...gestes}
    >
      {contenu}
    </Link>
  );
}

/**
 * Variante pour un contrôle qui EXISTE DÉJÀ et qui est simplement `disabled`
 * (les trois boutons « Importer », le mode d'ajustement par IA quand le
 * crédit est épuisé) : n'apporte que la bulle, sans picto ni style — le
 * contrôle garde entièrement son apparence, c'est l'appelant qui décide
 * d'échanger son icône contre `block`.
 *
 * Réservée au crédit épuisé, et c'est délibéré : sans le droit, il n'y a pas
 * de contrôle à conserver, il y a une porte de sortie à offrir — c'est
 * `LockedAction` et son lien. D'où l'absence de tout drapeau de motif ici :
 * cette variante ne peut structurellement pas proposer `/plans`.
 *
 * Le `tabIndex` et les gestes sont portés par l'enveloppe, jamais par le
 * contrôle : un élément de formulaire `disabled` n'est ni focusable ni
 * destinataire d'événements de souris, ce qui est précisément pourquoi le
 * `title` natif qu'on remplace ne s'affichait pas de façon fiable.
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
