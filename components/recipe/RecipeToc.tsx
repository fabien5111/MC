'use client';

// Sommaire de navigation verticale de l'éditeur de recette (porté de
// nvelle_fonct/creer.html, option B « sommaire rétractable »).
//
// Rail fixé au bord gauche, replié à 58 px (icônes seules) et déplié à 252 px
// au survol, au focus clavier ou lorsqu'il est épinglé. Il s'estompe pendant la
// saisie pour ne pas gêner la rédaction — c'est la contrainte produit centrale.
//
// C'est un calque (`position: fixed`) : il ne modifie ni le flux ni la largeur
// du formulaire.
//
// Sous 700 px le rail est masqué (il n'a pas la place de coexister avec le
// contenu). Deux commandes distinctes prennent le relais (proposition D de la
// refonte de l'ergonomie mobile) :
//  - une **languette** collée au bord gauche ouvre un **panneau latéral** qui
//    porte le sommaire — même liste, même scroll-spy, même `navigate` — et une
//    jauge de progression dans la page : le bord gauche sert à se repérer ;
//  - les **actions** de l'écran (Lancer une fournée, Éditer, Enregistrer…)
//    vont au **bouton central de la barre basse** (« Actions ») quand l'écran
//    la monte (`mobileInset="nav"`) : elles y sont déclarées par
//    `lib/actions-ecran.ts`. Sans barre basse, une pastille « Actions » en bas
//    à droite ouvre la même feuille.
// Avant, un seul bouton rond à picto « liste » portait les deux, sommaire
// d'abord : les testeurs ne trouvaient pas les actions.
// Ce rendu mobile est **choisi par l'écran hôte** (prop `mobile`) et non
// automatique : un écran qui a déjà quelque chose de fixe en bas doit dire quoi
// dégager (`mobileInset`), sans quoi la pastille vient se poser dessus.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToc } from '@/lib/use-toc';
import { useRailTooltip } from '@/lib/use-rail-tooltip';
import { BottomSheet } from '@/components/BottomSheet';
import { declarerActions, retirerActions } from '@/lib/actions-ecran';

// Titre d'étape tel qu'affiché dans le sommaire. Volontairement réduit au
// minimum : le sommaire dérive du modèle de recette, il ne le duplique pas.
export type TocStep = { key: string; title: string };

type TocItem = {
  id: string;
  label: string;
  icon: string;
  level: 1 | 2;
  // Renseigné pour les entrées d'étape : permet de déplier l'étape visée avant
  // de défiler vers elle.
  stepIndex?: number;
};

// Sections fixes d'un écran, réparties de part et d'autre des entrées
// d'étapes. L'ordre suit celui du DOM : un sommaire qui remonte pendant que
// l'on descend rendrait le repérage incompréhensible.
export type TocSections = { before: TocItem[]; after: TocItem[] };

// Les deux écrans qui portent le sommaire n'ont ni les mêmes sections ni le
// même ordre ; leurs listes sont regroupées ici pour que tout le vocabulaire du
// sommaire (libellés, icônes, ancres) reste auditable d'un seul coup d'œil.

// Éditeur de recette — cf. components/CreerForm.
// « Conseils recette/dégustation » couvre deux sections voisines (astuces puis
// dégustation et conservation) : une seule entrée, posée sur la première,
// suffit à y amener.
export const CREER_SECTIONS: TocSections = {
  before: [
    { id: 'sec-haut', label: 'Haut de la recette', icon: 'vertical_align_top', level: 1 },
    { id: 'sec-description', label: 'Description', icon: 'edit_note', level: 1 },
    { id: 'sec-taille', label: 'Taille / Portions', icon: 'straighten', level: 1 },
    { id: 'sec-ustensiles', label: 'Ustensiles', icon: 'blender', level: 1 },
    { id: 'sec-etapes', label: 'Étapes', icon: 'format_list_numbered', level: 1 },
  ],
  after: [
    { id: 'sec-conseils', label: 'Conseils recette/dégustation', icon: 'lightbulb', level: 1 },
    { id: 'sec-planning', label: 'Planning', icon: 'calendar_month', level: 1 },
    { id: 'sec-difficulte', label: 'Difficulté & temps', icon: 'speed', level: 1 },
    { id: 'sec-ingredients', label: 'Récap Ingrédients', icon: 'egg_alt', level: 1 },
  ],
};

// Relecture d'un brouillon importé — cf. components/RelectureEditor. L'écran
// n'a pas de section difficulté, et se termine par les indications globales
// suivies du planning de préparation puis du récapitulatif d'ingrédients.
export const RELECTURE_SECTIONS: TocSections = {
  before: [
    { id: 'sec-infos', label: 'Informations générales', icon: 'edit_note', level: 1 },
    { id: 'sec-ustensiles', label: 'Ustensiles', icon: 'blender', level: 1 },
    { id: 'sec-etapes', label: 'Étapes', icon: 'format_list_numbered', level: 1 },
  ],
  after: [
    { id: 'sec-conseils', label: 'Conseils recette/dégustation', icon: 'lightbulb', level: 1 },
    { id: 'sec-indications', label: 'Indications globales', icon: 'insights', level: 1 },
    { id: 'sec-planning', label: 'Planning', icon: 'calendar_month', level: 1 },
    { id: 'sec-ingredients', label: 'Récap Ingrédients', icon: 'egg_alt', level: 1 },
  ],
};

export function stepAnchorId(index: number) {
  return `sec-etape-${index + 1}`;
}

// Style des boutons d'action du pied du rail : reprend la hiérarchie visuelle
// de la barre de bas de page qu'ils remplacent (sortie discrète, enregistrement
// intermédiaire plus affirmé, action principale pleine et destruction en
// évidence côté relecture).
export type TocActionVariant = 'outline' | 'outline-strong' | 'filled' | 'outline-danger';

export type TocAction = {
  id: string;
  // Nom d'icône Material Symbols (ligature), ou un glyphe posé tel quel
  // (ex. PlanningIcon, pour rester visuellement identique au picto de
  // planification utilisé ailleurs) — dans ce second cas la police
  // material-symbols-outlined ne doit pas s'appliquer au badge, cf. rendu.
  icon: string | ReactNode;
  // Sert à la fois d'aria-label et de texte du tooltip : les deux doivent
  // rester identiques pour un lecteur d'écran comme à la souris.
  label: string;
  variant: TocActionVariant;
  onClick: () => void;
  disabled?: boolean;
};

type Props = {
  // Sections fixes de l'écran hôte (CREER_SECTIONS ou RELECTURE_SECTIONS).
  sections: TocSections;
  // Étapes de la recette en cours d'édition, dans l'ordre d'affichage.
  steps: TocStep[];
  // Appelé avec l'index de l'étape visée avant le défilement, pour la déplier
  // si elle est repliée.
  onNavigateToStep?: (index: number) => void;
  // Idem pour une entrée de section (hors étape) : permet de rouvrir un bloc
  // replié avant le défilement.
  onNavigateToSection?: (id: string) => void;
  // Ancre de l'entrée d'étape numéro `index`. Par défaut `stepAnchorId` (fiche,
  // éditeur) ; la fournée n'a pas ces ancres — ses blocs portent `etape-<id>`
  // (Préparer) ou `sec-jalon-<n>` (Pâtisser) — et nomme les siennes.
  anchorFor?: (index: number) => string;
  // Boutons d'action en pied de rail (quitter/enregistrer/publier côté éditeur,
  // créer/enregistrer/supprimer côté relecture). Absent : le pied du rail ne
  // garde que le bouton d'épinglage, comme avant leur introduction.
  actions?: TocAction[];
  // Rendu sous 700 px. `'none'` (défaut) : le sommaire disparaît, l'écran se
  // débrouille autrement. `'drawer'` : languette + panneau latéral pour le
  // sommaire, pastille « Actions » + feuille remontante pour les actions.
  mobile?: 'none' | 'drawer';
  // Ce que la pastille « Actions » doit dégager en bas d'écran. `'nav'` : la barre
  // de navigation basse du site. `'action-bar'` : une barre d'actions fixe
  // propre à l'écran (session d'exécution). Les hauteurs sont dans
  // `.recipe-toc-fab[data-inset]` — l'appelant nomme ce qu'il a en bas de
  // page, il n'a pas à en connaître les pixels.
  mobileInset?: 'none' | 'nav' | 'action-bar';
};

export function RecipeToc({
  sections,
  steps,
  onNavigateToStep,
  onNavigateToSection,
  anchorFor = stepAnchorId,
  actions,
  mobile = 'none',
  mobileInset = 'none',
}: Props) {
  const items = useMemo<TocItem[]>(
    () => [
      ...sections.before,
      ...steps.map((st, i) => ({
        id: anchorFor(i),
        label: `${i + 1}. ${st.title.trim() || 'Étape sans titre'}`,
        icon: 'radio_button_unchecked',
        level: 2 as const,
        stepIndex: i,
      })),
      ...sections.after,
    ],
    [sections, steps, anchorFor],
  );

  const ids = useMemo(() => items.map((it) => it.id), [items]);

  const onBeforeNavigate = useCallback(
    (id: string) => {
      const item = items.find((it) => it.id === id);
      if (item?.stepIndex !== undefined) onNavigateToStep?.(item.stepIndex);
      else onNavigateToSection?.(id);
    },
    [items, onNavigateToStep, onNavigateToSection],
  );

  const { activeId, pinned, typing, togglePin, navigate, refresh } = useToc(ids, onBeforeNavigate);
  const { show: showTip, hide: hideTip, node: tooltipNode } = useRailTooltip();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  // Avancement dans la page, mesuré à l'ouverture du panneau : la page est
  // verrouillée tant qu'il est ouvert, la valeur ne bouge donc pas.
  const [progression, setProgression] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  // Identifiant généré : rien n'interdit à un écran de monter deux sommaires,
  // et un `aria-controls` en double ne désignerait plus rien.
  const sheetId = useId();

  // À l'ouverture, la section courante doit être visible sans avoir à défiler
  // dans la liste : sur une recette à huit étapes elle dépasse largement les
  // 70 vh du tiroir. On ajuste le `scrollTop` du conteneur plutôt que
  // d'appeler `scrollIntoView`, qui remonterait aussi la page derrière la
  // feuille. `refresh()` rend la section à l'instant même — `activeId` ne
  // serait à jour qu'au rendu suivant, soit trop tard pour ce calcul.
  useEffect(() => {
    if (!sheetOpen) return;
    const course = document.documentElement.scrollHeight - window.innerHeight;
    setProgression(course > 0 ? Math.min(100, Math.round((100 * window.scrollY) / course)) : 0);
    const current = refresh();
    const list = listRef.current;
    if (!list) return;
    const el = current ? list.querySelector<HTMLElement>(`[data-toc-id="${current}"]`) : null;
    // Aucune section franchie (haut de page) : la liste reste à son début.
    list.scrollTop = el ? Math.max(0, el.offsetTop - (list.clientHeight - el.offsetHeight) / 2) : 0;
  }, [sheetOpen, refresh]);

  // Fermer *puis* défiler, jamais l'inverse : `navigate` diffère sa mesure de
  // deux frames, ce qui laisse à <BottomSheet> le temps de lever son verrou de
  // défilement au commit. Émis dans l'autre ordre, le défilement partirait sur
  // un `document.body` encore en `overflow: hidden` et serait perdu.
  const goTo = useCallback(
    (id: string) => {
      setSheetOpen(false);
      navigate(id);
    },
    [navigate],
  );

  const classes = ['recipe-toc'];
  if (pinned) classes.push('is-pinned');
  if (typing) classes.push('is-typing');

  const actionList = actions ?? [];
  const hasActions = actionList.length > 0;

  // Barre basse présente : les actions partent au bouton central plutôt que
  // dans une pastille de plus. Redéclarées à chaque rendu (libellés et états
  // `disabled` changent), retirées au démontage.
  const versBoutonCentral = mobile === 'drawer' && mobileInset === 'nav';
  const proprietaire = useMemo(() => Symbol('actions-ecran'), []);
  useEffect(() => {
    if (versBoutonCentral) declarerActions(proprietaire, actionList);
  });
  useEffect(() => {
    if (!versBoutonCentral) return;
    return () => retirerActions(proprietaire);
  }, [versBoutonCentral, proprietaire]);

  return (
    <>
    <nav className={classes.join(' ')} aria-label="Sommaire de la recette">
      <ul>
        {items.map((it) => (
          <li key={it.id} className={it.level === 2 ? 'sub' : undefined}>
            <a
              href={`#${it.id}`}
              className={activeId === it.id ? 'on' : undefined}
              aria-current={activeId === it.id ? 'true' : undefined}
              // Les libellés longs sont tronqués à l'ellipse dans le rail.
              title={it.label}
              onClick={(e) => {
                e.preventDefault();
                navigate(it.id);
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {it.icon}
              </span>
              <span className="lbl">{it.label}</span>
            </a>
          </li>
        ))}
      </ul>
      {hasActions && (
        <div className="actions">
          {actionList.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={a.onClick}
              disabled={a.disabled}
              aria-label={a.label}
              onMouseEnter={(e) => showTip(e.currentTarget, a.label)}
              onMouseLeave={hideTip}
              onFocus={(e) => showTip(e.currentTarget, a.label)}
              onBlur={hideTip}
            >
              <span
                className={`badge variant-${a.variant}${typeof a.icon === 'string' ? ' material-symbols-outlined' : ''}`}
                aria-hidden="true"
              >
                {a.icon}
              </span>
              <span className="lbl">{a.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="pin">
        <button
          type="button"
          onClick={togglePin}
          aria-pressed={pinned}
          aria-label="Épingler le sommaire ouvert"
          title="Épingler le sommaire ouvert"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            push_pin
          </span>
        </button>
      </div>
      {tooltipNode}
    </nav>

    {mobile === 'drawer' && (
      <>
        {/* Languette du sommaire. Petite (22 × 38 px) pour ne pas masquer le
            texte, mais sa zone de toucher est élargie en CSS (::before). */}
        <button
          type="button"
          className="recipe-toc-tab no-print"
          data-hidden={sheetOpen}
          aria-label="Ouvrir le sommaire"
          title="Sommaire"
          aria-expanded={sheetOpen}
          aria-controls={sheetId}
          onClick={() => setSheetOpen(true)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            toc
          </span>
        </button>
        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          breakpoint="rail"
          side="left"
          id={sheetId}
          label="Sommaire"
          sheetClassName="recipe-toc-sheet"
        >
          <div
            className="recipe-toc-progress shrink-0"
            role="progressbar"
            aria-label="Avancement dans la page"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progression}
          >
            <span style={{ width: `${progression}%` }} />
          </div>
          {/* `relative` : c'est ce qui fait du conteneur l'`offsetParent` des
              entrées, donc ce qui rend `offsetTop` directement comparable à
              son `scrollTop` (cf. le centrage de l'entrée active). `flex-1` :
              le panneau a une hauteur fixe (tout l'écran), la liste prend ce
              qui reste sous l'en-tête et défile. */}
          <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto">
            <ul>
              {items.map((it) => (
                <li key={it.id} className={it.level === 2 ? 'sub' : undefined}>
                  <a
                    href={`#${it.id}`}
                    data-toc-id={it.id}
                    className={activeId === it.id ? 'item on' : 'item'}
                    aria-current={activeId === it.id ? 'true' : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      goTo(it.id);
                    }}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {it.icon}
                    </span>
                    <span className="lbl">{it.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </BottomSheet>

        {/* Actions de l'écran hôte : elles vivent autrement dans le pied du
            rail, inatteignable sous 700 px. Pastille étiquetée plutôt qu'un
            bouton rond : on doit savoir ce qu'elle ouvre avant de la toucher. */}
        {hasActions && !versBoutonCentral && (
          <>
            <button
              type="button"
              className="recipe-toc-fab is-pill no-print"
              data-inset={mobileInset}
              // La pastille s'efface quand la feuille est ouverte : la feuille
              // porte déjà tout ce qu'elle propose, et la laisser flotter
              // au-dessus du voile la ferait passer pour une commande active.
              data-hidden={actionsOpen}
              aria-expanded={actionsOpen}
              aria-controls={`${sheetId}-actions`}
              onClick={() => setActionsOpen(true)}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                more_horiz
              </span>
              Actions
            </button>
            <FeuilleActions
              id={`${sheetId}-actions`}
              open={actionsOpen}
              onClose={() => setActionsOpen(false)}
              breakpoint="rail"
              actions={actionList}
            />
          </>
        )}
      </>
    )}
    </>
  );
}

// Feuille « Que voulez-vous faire ? » : partagée par la pastille « Actions »
// (écrans sans barre basse) et le bouton central de la barre basse. En bas de
// l'écran, là où le pouce tombe ; même badge rond et mêmes variantes que le
// pied du rail, pour que ce soient visiblement les mêmes actions.
export function FeuilleActions({
  id,
  open,
  onClose,
  breakpoint,
  actions,
}: {
  id?: string;
  open: boolean;
  onClose: () => void;
  breakpoint: 'rail' | 'lg';
  actions: TocAction[];
}) {
  return (
    <BottomSheet open={open} onClose={onClose} breakpoint={breakpoint} id={id} label="Actions" sheetClassName="recipe-toc-sheet">
      <h2 className="shrink-0">Que voulez-vous faire ?</h2>
      <div className="actions is-sheet min-h-0 overflow-y-auto" role="group" aria-label="Actions">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            className="item"
            onClick={() => {
              onClose();
              a.onClick();
            }}
            disabled={a.disabled}
          >
            <span
              className={`badge variant-${a.variant}${typeof a.icon === 'string' ? ' material-symbols-outlined' : ''}`}
              aria-hidden="true"
            >
              {a.icon}
            </span>
            <span className="lbl">{a.label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
