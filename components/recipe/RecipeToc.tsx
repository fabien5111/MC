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
// contenu) et un bouton flottant ouvre un tiroir remontant portant les mêmes
// entrées — même liste, même scroll-spy, même `navigate`. Ce rendu mobile est
// **choisi par l'écran hôte** (prop `mobile`) et non automatique : un écran qui
// a déjà quelque chose de fixe en bas doit dire quoi dégager (`mobileInset`),
// sans quoi le bouton flottant vient se poser dessus.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useToc } from '@/lib/use-toc';
import { useRailTooltip } from '@/lib/use-rail-tooltip';
import { BottomSheet } from '@/components/BottomSheet';

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
// n'a ni planning ni difficulté, et se termine par les indications globales
// suivies du récapitulatif d'ingrédients.
export const RELECTURE_SECTIONS: TocSections = {
  before: [
    { id: 'sec-infos', label: 'Informations générales', icon: 'edit_note', level: 1 },
    { id: 'sec-ustensiles', label: 'Ustensiles', icon: 'blender', level: 1 },
    { id: 'sec-etapes', label: 'Étapes', icon: 'format_list_numbered', level: 1 },
  ],
  after: [
    { id: 'sec-conseils', label: 'Conseils recette/dégustation', icon: 'lightbulb', level: 1 },
    { id: 'sec-indications', label: 'Indications globales', icon: 'insights', level: 1 },
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
  icon: string;
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
  // Boutons d'action en pied de rail (quitter/enregistrer/publier côté éditeur,
  // créer/enregistrer/supprimer côté relecture). Absent : le pied du rail ne
  // garde que le bouton d'épinglage, comme avant leur introduction.
  actions?: TocAction[];
  // Rendu sous 700 px. `'none'` (défaut) : le sommaire disparaît, l'écran se
  // débrouille autrement. `'drawer'` : bouton flottant + tiroir remontant.
  mobile?: 'none' | 'drawer';
  // Ce que le bouton flottant doit dégager en bas d'écran. `'nav'` : la barre
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
  actions,
  mobile = 'none',
  mobileInset = 'none',
}: Props) {
  const items = useMemo<TocItem[]>(
    () => [
      ...sections.before,
      ...steps.map((st, i) => ({
        id: stepAnchorId(i),
        label: `${i + 1}. ${st.title.trim() || 'Étape sans titre'}`,
        icon: 'radio_button_unchecked',
        level: 2 as const,
        stepIndex: i,
      })),
      ...sections.after,
    ],
    [sections, steps],
  );

  const ids = useMemo(() => items.map((it) => it.id), [items]);

  const onBeforeNavigate = useCallback(
    (id: string) => {
      const item = items.find((it) => it.id === id);
      if (item?.stepIndex !== undefined) onNavigateToStep?.(item.stepIndex);
    },
    [items, onNavigateToStep],
  );

  const { activeId, pinned, typing, togglePin, navigate, refresh } = useToc(ids, onBeforeNavigate);
  const { show: showTip, hide: hideTip, node: tooltipNode } = useRailTooltip();

  const [sheetOpen, setSheetOpen] = useState(false);
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
              <span className={`badge variant-${a.variant} material-symbols-outlined`} aria-hidden="true">
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
        <button
          type="button"
          className="recipe-toc-fab rail:hidden"
          data-inset={mobileInset}
          // Le bouton s'efface quand le tiroir est ouvert : le tiroir porte
          // déjà tout ce qu'il propose, et le laisser flotter au-dessus du
          // voile le ferait passer pour une commande encore active.
          data-hidden={sheetOpen}
          aria-label={hasActions ? 'Sommaire et actions de la recette' : 'Aller à une section'}
          aria-expanded={sheetOpen}
          aria-controls={sheetId}
          onClick={() => setSheetOpen(true)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            format_list_bulleted
          </span>
        </button>
        <BottomSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          breakpoint="rail"
          id={sheetId}
          label={hasActions ? 'Sommaire et actions de la recette' : 'Sommaire de la recette'}
          sheetClassName="recipe-toc-sheet"
        >
          <h2 className="shrink-0">Aller à…</h2>
          {/* `relative` : c'est ce qui fait du conteneur l'`offsetParent` des
              entrées, donc ce qui rend `offsetTop` directement comparable à
              son `scrollTop` (cf. le centrage de l'entrée active).
              Pas de `flex-1` ici, contrairement au tiroir de filtres : sa
              base nulle ne contribuerait pas à la hauteur d'une feuille qui
              n'en a pas de fixée, et la feuille se réduirait à son titre. La
              liste garde donc sa base `auto` — elle donne sa hauteur à la
              feuille jusqu'aux 70 vh, puis se comprime et défile. */}
          <div ref={listRef} className="relative min-h-0 overflow-y-auto">
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
          {/* Les actions de l'écran hôte vivent autrement dans le pied du rail,
              inatteignable sous 700 px : sans ce bloc, la fiche recette
              perdrait Planifier, Éditer et Dupliquer sur téléphone. Elles sont
              en bas de la feuille, là où le pouce tombe. */}
          {hasActions && (
            <div className="actions shrink-0" role="group" aria-label="Actions sur la recette">
              {actionList.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="item"
                  onClick={() => {
                    setSheetOpen(false);
                    a.onClick();
                  }}
                  disabled={a.disabled}
                >
                  <span className={`badge variant-${a.variant} material-symbols-outlined`} aria-hidden="true">
                    {a.icon}
                  </span>
                  <span className="lbl">{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </BottomSheet>
      </>
    )}
    </>
  );
}
