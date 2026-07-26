'use client';

// Sommaire de navigation verticale de l'éditeur de recette (porté de
// nvelle_fonct/creer.html, option B « sommaire rétractable »).
//
// Rail fixé au bord gauche, replié à 58 px (icônes seules) et déplié à 252 px
// au survol, au focus clavier ou lorsqu'il est épinglé. Il s'estompe pendant la
// saisie pour ne pas gêner la rédaction — c'est la contrainte produit centrale.
//
// C'est un calque (`position: fixed`) : il ne modifie ni le flux ni la largeur
// du formulaire. Masqué sous 700 px, l'équivalent mobile restant à concevoir.
import { useCallback, useMemo } from 'react';
import { useToc } from '@/lib/use-toc';

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

// Sections fixes du formulaire, dans l'ordre du DOM (cf. components/CreerForm).
// L'ordre du sommaire suit celui de la page : un sommaire qui remonte pendant
// que l'on descend rendrait le repérage incompréhensible.
const SECTIONS_BEFORE_STEPS: TocItem[] = [
  { id: 'sec-description', label: 'Description', icon: 'edit_note', level: 1 },
  { id: 'sec-taille', label: 'Taille / Portions', icon: 'straighten', level: 1 },
  { id: 'sec-ustensiles', label: 'Ustensiles', icon: 'blender', level: 1 },
  { id: 'sec-etapes', label: 'Étapes', icon: 'format_list_numbered', level: 1 },
];

// « Conseils de la recette/dégustation » couvre deux sections voisines
// (astuces puis dégustation et conservation) : une seule entrée, posée sur la
// première, suffit à y amener.
const SECTIONS_AFTER_STEPS: TocItem[] = [
  { id: 'sec-conseils', label: 'Conseils de la recette/dégustation', icon: 'lightbulb', level: 1 },
  { id: 'sec-planning', label: 'Planning', icon: 'calendar_month', level: 1 },
  { id: 'sec-difficulte', label: 'Difficulté & temps', icon: 'speed', level: 1 },
  { id: 'sec-ingredients', label: 'Récapitulatif des ingrédients', icon: 'egg_alt', level: 1 },
];

export function stepAnchorId(index: number) {
  return `sec-etape-${index + 1}`;
}

type Props = {
  // Étapes de la recette en cours d'édition, dans l'ordre d'affichage.
  steps: TocStep[];
  // Appelé avec l'index de l'étape visée avant le défilement, pour la déplier
  // si elle est repliée.
  onNavigateToStep?: (index: number) => void;
};

export function RecipeToc({ steps, onNavigateToStep }: Props) {
  const items = useMemo<TocItem[]>(
    () => [
      ...SECTIONS_BEFORE_STEPS,
      ...steps.map((st, i) => ({
        id: stepAnchorId(i),
        label: `${i + 1}. ${st.title.trim() || 'Étape sans titre'}`,
        icon: 'radio_button_unchecked',
        level: 2 as const,
        stepIndex: i,
      })),
      ...SECTIONS_AFTER_STEPS,
    ],
    [steps],
  );

  const ids = useMemo(() => items.map((it) => it.id), [items]);

  const onBeforeNavigate = useCallback(
    (id: string) => {
      const item = items.find((it) => it.id === id);
      if (item?.stepIndex !== undefined) onNavigateToStep?.(item.stepIndex);
    },
    [items, onNavigateToStep],
  );

  const { activeId, pinned, typing, togglePin, navigate } = useToc(ids, onBeforeNavigate);

  const classes = ['recipe-toc'];
  if (pinned) classes.push('is-pinned');
  if (typing) classes.push('is-typing');

  return (
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
    </nav>
  );
}
