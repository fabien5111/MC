'use client';

// Compteur de résultats + rappel des critères actifs.
//
// Le rappel évite de faire remonter l'utilisateur dans la colonne (ou de
// rouvrir le tiroir) pour défaire un réglage : chaque critère est retirable
// sur place. Les ingrédients y gardent leur code couleur — c'est le même
// objet que dans la facette, il doit se lire pareil.
//
// Sur mobile, la bande défile horizontalement et le tri se trouve à droite du
// compteur : un `<select>` natif plutôt qu'une feuille maison, parce que le
// sélecteur du système est plus rapide au pouce et déjà accessible.
import { IngredientBadge } from '@/components/search/IngredientBadge';
import { useSearch } from '@/components/search/SearchProvider';
import {
  countActiveCriteria,
  ratingLabel,
  removeIngredient,
  SORT_KEYS,
  SORT_LABELS,
  timeLabel,
  TIME_MAX,
  type SearchCriteria,
  type SortKey,
} from '@/lib/search-params';
import type { FacetRefs } from '@/components/search/SearchFacets';

export function SearchSummary({ total, refs }: { total: number; refs: FacetRefs }) {
  const { criteria, update } = useSearch();
  const activeCount = countActiveCriteria(criteria);
  const sortOptions = SORT_KEYS.filter((k) => k !== 'relevance' || criteria.q);
  // Sans terme de recherche l'option « Pertinence » disparaît, mais le critère
  // peut encore la porter : on affiche alors le tri réellement appliqué par le
  // SQL (les plus récentes), plutôt qu'une option choisie par défaut par le
  // navigateur faute de correspondance.
  const shownSort: SortKey = sortOptions.includes(criteria.sort) ? criteria.sort : 'recent';

  const label = (slug: string, list: { slug: string; name: string }[]) =>
    list.find((x) => x.slug === slug)?.name ?? slug;

  // Critères non-ingrédients, sous forme de puces retirables.
  const chips: { key: string; label: string; next: SearchCriteria }[] = [];
  if (criteria.type) {
    chips.push({
      key: `type:${criteria.type}`,
      label: label(criteria.type, refs.types),
      next: { ...criteria, type: null },
    });
  }
  for (const level of criteria.diff) {
    const d = refs.difficulties.find((x) => x.level === level);
    chips.push({
      key: `diff:${level}`,
      label: d?.name ?? `Difficulté ${level}`,
      next: { ...criteria, diff: criteria.diff.filter((x) => x !== level) },
    });
  }
  if (criteria.tmax !== null && criteria.tmax < TIME_MAX) {
    chips.push({ key: 'tmax', label: timeLabel(criteria.tmax), next: { ...criteria, tmax: null } });
  }
  for (const slug of criteria.cat) {
    chips.push({
      key: `cat:${slug}`,
      label: label(slug, refs.tags),
      next: { ...criteria, cat: criteria.cat.filter((x) => x !== slug) },
    });
  }
  if (criteria.minRecipeRating !== null) {
    chips.push({
      key: 'min_rr',
      label: `Recette ${ratingLabel(criteria.minRecipeRating)}`,
      next: { ...criteria, minRecipeRating: null },
    });
  }
  if (criteria.minAuthorRating !== null) {
    chips.push({
      key: 'min_ar',
      label: `Auteur ${ratingLabel(criteria.minAuthorRating)}`,
      next: { ...criteria, minAuthorRating: null },
    });
  }
  for (const name of criteria.allerg) {
    chips.push({
      key: `allerg:${name}`,
      label: `Sans ${name.toLowerCase()}`,
      next: { ...criteria, allerg: criteria.allerg.filter((x) => x !== name) },
    });
  }

  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-[15px] text-on-surface-variant">
          <strong className="font-headline-md text-[19px] text-primary">
            {total} recette{total > 1 ? 's' : ''}
          </strong>
          {criteria.q && <> pour «&nbsp;{criteria.q}&nbsp;»</>}
        </p>

        {/* Tri — mobile / tablette (le desktop l'a dans la barre haute). */}
        <label className="lg:hidden flex items-center gap-1 text-[12px] font-semibold text-secondary">
          <span className="material-symbols-outlined text-[15px]">swap_vert</span>
          <span className="sr-only">Trier par</span>
          <select
            value={shownSort}
            onChange={(e) => update({ ...criteria, sort: e.target.value as SortKey })}
            className="bg-transparent font-semibold text-secondary focus:outline-none"
          >
            {sortOptions.map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {activeCount > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto hide-sb lg:flex-wrap lg:overflow-visible pt-4 mt-4 border-t border-outline-variant/50">
          <span className="facet-h shrink-0 mr-1 hidden lg:inline">Critères actifs</span>
          {criteria.inc.map((name) => (
            <span key={`inc:${name}`} className="shrink-0">
              <IngredientBadge
                label={name}
                mode="inc"
                onRemove={() => update(removeIngredient(criteria, name))}
              />
            </span>
          ))}
          {criteria.exc.map((name) => (
            <span key={`exc:${name}`} className="shrink-0">
              <IngredientBadge
                label={name}
                mode="exc"
                onRemove={() => update(removeIngredient(criteria, name))}
              />
            </span>
          ))}
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => update(c.next)}
              className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] bg-primary text-on-primary hover:opacity-85 transition-opacity"
            >
              {c.label}
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
