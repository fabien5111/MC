'use client';

// Barre haute de l'écran de recherche : champ en pilule, bouton d'effacement,
// puis le tri (≥ 1024 px) ou le bouton « Filtres » du tiroir (< 1024 px).
//
// Le champ est un vrai formulaire `role="search"` : la soumission est déjà
// détectée par NavigationSpinner, qui affiche le fouet pendant la navigation.
// La saisie est débouncée comme les facettes — inutile de valider pour voir
// les résultats bouger, mais Entrée reste possible.
import { useSearch } from '@/components/search/SearchProvider';
import { countActiveCriteria, SORT_KEYS, SORT_LABELS, type SortKey } from '@/lib/search-params';

export function SearchHeaderBar() {
  const { criteria, update, setPanelOpen } = useSearch();
  const activeCount = countActiveCriteria(criteria);

  // « Pertinence » n'a pas de sens sans terme de recherche : l'option
  // disparaît, et le tri par défaut devient « Plus récentes » côté SQL.
  const sortOptions = SORT_KEYS.filter((k) => k !== 'relevance' || criteria.q);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:items-center border-b border-outline-variant/50 px-margin-mobile md:px-margin-desktop py-5 bg-surface-container-low/60">
      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="flex-1 flex items-center gap-2.5 bg-surface-container-lowest border border-outline-variant rounded-full pl-5 pr-2 py-2.5 shadow-sm"
      >
        <span className="material-symbols-outlined text-[21px] text-outline">search</span>
        <input
          type="search"
          value={criteria.q}
          onChange={(e) => update({ ...criteria, q: e.target.value }, { debounce: true })}
          placeholder="Rechercher une recette, un ingrédient, un auteur…"
          aria-label="Rechercher"
          className="flex-1 bg-transparent text-[15px] text-on-surface placeholder:text-outline/70 focus:outline-none"
        />
        {criteria.q && (
          <button
            type="button"
            onClick={() => update({ ...criteria, q: '' })}
            title="Effacer"
            aria-label="Effacer la recherche"
            className="material-symbols-outlined text-[19px] p-1 text-outline hover:text-primary transition-colors"
          >
            close
          </button>
        )}
      </form>

      {/* Tri — desktop */}
      <div className="hidden lg:flex items-center gap-3 shrink-0">
        <label htmlFor="search-sort" className="facet-h">
          Trier par
        </label>
        <select
          id="search-sort"
          value={criteria.sort}
          onChange={(e) => update({ ...criteria, sort: e.target.value as SortKey })}
          className="border border-outline-variant rounded-full bg-surface-container-lowest text-[13.5px] py-2 pl-4 pr-9 focus:border-primary focus:outline-none"
        >
          {sortOptions.map((k) => (
            <option key={k} value={k}>
              {SORT_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {/* Filtres — mobile / tablette */}
      <button
        type="button"
        onClick={() => setPanelOpen(true)}
        className="lg:hidden relative self-start flex items-center gap-1.5 bg-primary text-on-primary pl-3.5 pr-4 py-2.5 rounded-full font-label-md text-[12px] active:scale-95 transition-transform"
      >
        <span className="material-symbols-outlined text-[16px]">tune</span>
        Filtres
        {activeCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-primary-container text-on-primary text-[10px] font-bold flex items-center justify-center border-2 border-surface">
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
}
