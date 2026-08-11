'use client';

// Liste des facettes de la recherche avancée, partagée entre la colonne
// persistante (≥ 1024 px) et le tiroir remontant (< 1024 px) : mêmes
// contrôles, mêmes libellés, seule la mise en page change.
//
// Ordre volontaire — Ingrédients, Catégories, Type, Difficulté, Temps, Note de
// la recette, Note de l'auteur, Allergènes : ingrédients et catégories
// ouvrent la liste — ce sont les deux facettes à zone de saisie, celles où
// l'utilisateur doit pouvoir taper tout de suite sans dérouler le reste — les
// allergènes la ferment parce qu'on y revient rarement une fois posés.
//
// En tiroir, les trois facettes vedettes (Ingrédients, Temps, Note de la
// recette) restent dépliées et le reste passe en accordéons — la liste doit
// rester courte à parcourir au pouce.
import { useState, type ReactNode } from 'react';
import { MaryseIcon } from '@/components/MaryseIcon';
import { IngredientPicker } from '@/components/search/IngredientPicker';
import { TagPicker } from '@/components/search/TagPicker';
import {
  ratingLabel,
  timeLabel,
  toggleValue,
  TIME_MAX,
  TIME_MIN,
  TIME_STEP,
  type SearchCriteria,
} from '@/lib/search-params';

export type FacetRefs = {
  types: { id: number; name: string; slug: string }[];
  difficulties: { id: number; name: string; level: number }[];
  tags: { id: number; name: string; slug: string }[];
  allergens: { id: number; name: string }[];
};

type Layout = 'column' | 'sheet';

export function SearchFacets({
  value,
  onChange,
  refs,
  layout,
}: {
  value: SearchCriteria;
  onChange: (next: SearchCriteria, opts?: { debounce?: boolean }) => void;
  refs: FacetRefs;
  layout: Layout;
}) {
  const sheet = layout === 'sheet';
  const set = (patch: Partial<SearchCriteria>, opts?: { debounce?: boolean }) =>
    onChange({ ...value, ...patch }, opts);

  // ── Portée : recettes / pâtissiers ──────────────────────────────────────
  // Décide *quoi* chercher, pas *comment* — passe donc avant les facettes de
  // recette, qui ne s'appliquent pas à un pâtissier. Les deux cases sont
  // cochées par défaut ; la dernière case cochée est désactivée plutôt que de
  // permettre les deux décochées, un état sans résultat possible.
  const scope = (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center gap-2.5 py-1 cursor-pointer group">
        <input
          type="checkbox"
          checked={value.includeRecipes}
          disabled={value.includeRecipes && !value.includeAuthors}
          onChange={() => set({ includeRecipes: !value.includeRecipes })}
          className="w-4 h-4 accent-primary disabled:opacity-40"
        />
        <span className="text-[14px] group-hover:text-primary transition-colors">Recettes</span>
      </label>
      <label className="flex items-center gap-2.5 py-1 cursor-pointer group">
        <input
          type="checkbox"
          checked={value.includeAuthors}
          disabled={value.includeAuthors && !value.includeRecipes}
          onChange={() => set({ includeAuthors: !value.includeAuthors })}
          className="w-4 h-4 accent-primary disabled:opacity-40"
        />
        <span className="text-[14px] group-hover:text-primary transition-colors">Pâtissiers</span>
      </label>
    </div>
  );

  // ── Ingrédients ────────────────────────────────────────────────────────
  const ingredients = (
    <IngredientPicker value={value} onChange={onChange} compact={sheet} showLegend={!sheet} />
  );

  // ── Catégories ───────────────────────────────────────────────────────
  // Zone de saisie avec autocomplétion — même principe que l'ajout de tags
  // dans l'éditeur de recette (pastilles retirables), la mécanique d'ajout
  // reprenant celle de la facette Ingrédients (saisie filtrée).
  const categories = <TagPicker value={value} onChange={onChange} tags={refs.tags} />;

  // ── Type de recette (radio, « Toutes » par défaut) ─────────────────────
  const type = (
    <div className="flex flex-col gap-0.5">
      {[{ slug: null, name: 'Toutes' }, ...refs.types].map((t) => (
        <label key={t.slug ?? 'all'} className="flex items-center gap-2.5 py-1.5 cursor-pointer group">
          <input
            type="radio"
            name={`type-${layout}`}
            checked={value.type === t.slug}
            onChange={() => set({ type: t.slug })}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-[14px] group-hover:text-primary transition-colors">{t.name}</span>
        </label>
      ))}
    </div>
  );

  // ── Difficulté (cases cumulables) ──────────────────────────────────────
  // Le niveau s'affiche en maryses, exactement comme sur la carte : le même
  // concept ne doit pas se lire de deux façons différentes sur un même écran.
  const difficulty = (
    <div className="flex flex-col">
      {refs.difficulties.map((d) => (
        <label key={d.id} className="flex items-center gap-2 py-1.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={value.diff.includes(d.level)}
            onChange={() => set({ diff: toggleValue(value.diff, d.level).sort((a, b) => a - b) })}
            className="w-4 h-4 accent-primary"
          />
          <span className="flex items-center gap-0.5 shrink-0">
            {[1, 2, 3, 4, 5].map((i) => (
              <MaryseIcon
                key={i}
                size={13}
                className={i <= d.level ? 'text-primary' : 'text-outline-variant'}
              />
            ))}
          </span>
          <span className="text-[13.5px] text-on-surface-variant group-hover:text-primary transition-colors">
            {d.name}
          </span>
        </label>
      ))}
    </div>
  );

  // ── Temps total ────────────────────────────────────────────────────────
  // Le curseur pilote le temps *effectif* (temps saisi, sinon somme des
  // étapes) : le filtre SQL applique la même règle que `effectiveTimes()`,
  // sans quoi les résultats contrediraient le temps affiché sur les cartes.
  const time = (
    <div>
      <input
        type="range"
        min={TIME_MIN}
        max={TIME_MAX}
        step={TIME_STEP}
        value={value.tmax ?? TIME_MAX}
        aria-label="Temps total maximum"
        onChange={(e) => {
          const v = Number(e.target.value);
          set({ tmax: v >= TIME_MAX ? null : v }, { debounce: true });
        }}
        className="search-range"
      />
      <div className="flex justify-between text-[11px] text-outline mt-2">
        <span>30 min</span>
        <span>8 h et +</span>
      </div>
    </div>
  );

  // ── Note de la recette (étoiles ; re-cliquer la valeur courante annule) ─
  const recipeRating = (
    <RatingStars
      value={value.minRecipeRating}
      onChange={(n) => set({ minRecipeRating: n })}
      sheet={sheet}
      ariaSuffix=""
    />
  );

  // ── Note de l'auteur ───────────────────────────────────────────────────
  // Même principe que la note de la recette : cinq étoiles cumulables,
  // re-cliquer la valeur courante l'annule. Moyenne des notes de ses
  // recettes publiées (vue SQL `author_ratings`) — le produit n'a pas
  // d'autre notion de note d'auteur.
  const authorRating = (
    <RatingStars
      value={value.minAuthorRating}
      onChange={(n) => set({ minAuthorRating: n })}
      sheet={sheet}
      ariaSuffix=" pour l'auteur"
    />
  );

  // ── Allergènes à exclure ───────────────────────────────────────────────
  // Aide au tri, pas garantie de sécurité alimentaire : le rattachement des
  // ingrédients au référentiel des allergènes n'est pas systématique. Le
  // filtre interroge les deux sources (référence + saisie libre), mais la
  // mention sous la liste le dit explicitement.
  const allergens = (
    <div>
      <div className="grid grid-cols-2 gap-y-1.5 gap-x-2">
        {refs.allergens.map((a) => (
          <label key={a.id} className="flex items-center gap-2 py-1 cursor-pointer group">
            <input
              type="checkbox"
              checked={value.allerg.includes(a.name)}
              onChange={() => set({ allerg: toggleValue(value.allerg, a.name) })}
              className="w-4 h-4 accent-error"
            />
            <span className="text-[13.5px] group-hover:text-primary transition-colors">{a.name}</span>
          </label>
        ))}
      </div>
      <p className="text-[11.5px] text-outline italic mt-2.5">
        Aide au tri : tous les ingrédients ne sont pas rattachés au référentiel des allergènes.
      </p>
    </div>
  );

  if (!sheet) {
    return (
      <div className="divide-y divide-outline-variant/50">
        <Block title="Rechercher parmi">{scope}</Block>
        <Block>{ingredients}</Block>
        <Block>{categories}</Block>
        <Block title="Type de recette">{type}</Block>
        <Block title="Difficulté">{difficulty}</Block>
        <Block
          title="Temps total"
          aside={<span className="text-[13px] font-semibold text-primary">{timeLabel(value.tmax)}</span>}
        >
          {time}
        </Block>
        <Block title="Note de la recette">{recipeRating}</Block>
        <Block title="Note de l&apos;auteur">{authorRating}</Block>
        <Block title="Allergènes à exclure">{allergens}</Block>
      </div>
    );
  }

  return (
    <div className="divide-y divide-outline-variant/50">
      <div className="py-5">
        <p className="facet-h mb-3">Rechercher parmi</p>
        {scope}
      </div>
      <div className="py-5">{ingredients}</div>
      <div className="py-5">
        <div className="flex items-baseline justify-between mb-4">
          <p className="facet-h">Temps total</p>
          <span className="text-[12.5px] font-semibold text-primary">{timeLabel(value.tmax)}</span>
        </div>
        {time}
      </div>
      <div className="py-5">
        <p className="facet-h mb-3">Note de la recette</p>
        {recipeRating}
      </div>
      {/* Catégories garde sa zone de saisie même repliée : le premier
          accordéon est ouvert par défaut, comme avant, il signale qu'il y a
          une suite. */}
      <Accordion title="Catégories" defaultOpen>
        {categories}
      </Accordion>
      <Accordion title="Type de recette">{type}</Accordion>
      <Accordion title="Difficulté">{difficulty}</Accordion>
      <Accordion title="Allergènes à exclure">{allergens}</Accordion>
      <Accordion title={"Note de l'auteur"}>{authorRating}</Accordion>
    </div>
  );
}

// Rangée de 5 étoiles cumulables, partagée entre la note de la recette et la
// note de l'auteur : re-cliquer la valeur courante l'annule (retour à
// « toutes les notes »). `ariaSuffix` distingue les deux dans le libellé
// accessible sans dupliquer le balisage.
function RatingStars({
  value,
  onChange,
  sheet,
  ariaSuffix,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  sheet: boolean;
  ariaSuffix: string;
}) {
  return (
    <div className={sheet ? '' : 'flex items-center gap-3'}>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${n} étoile${n > 1 ? 's' : ''} et plus${ariaSuffix}`}
            aria-pressed={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={`material-symbols-outlined leading-none transition-colors ${
              sheet ? 'text-[30px]' : 'text-[26px]'
            } ${n <= (value ?? 0) ? 'text-primary' : 'text-outline-variant'}`}
            style={{ fontVariationSettings: `'FILL' ${n <= (value ?? 0) ? 1 : 0}` }}
          >
            star
          </button>
        ))}
      </div>
      <span className={`text-[13px] text-on-surface-variant ${sheet ? 'block mt-1.5' : ''}`}>
        {ratingLabel(value)}
      </span>
    </div>
  );
}

function Block({
  title,
  aside,
  children,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="px-6 py-5">
      {title && (
        <div className="flex items-baseline justify-between mb-3">
          <p className="facet-h">{title}</p>
          {aside}
        </div>
      )}
      {children}
    </div>
  );
}

function Accordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  // L'ouverture est un état React : laissée au DOM (`open` en attribut fixe),
  // elle serait réimposée à chaque re-rendu et rouvrirait une section que
  // l'utilisateur vient de replier.
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="py-4 group" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex items-center justify-between cursor-pointer list-none">
        <span className="facet-h">{title}</span>
        <span className="material-symbols-outlined text-[19px] text-outline group-open:rotate-180 transition-transform">
          expand_more
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}
