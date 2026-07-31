'use client';

// Facette « Catégories » — zone de saisie avec autocomplétion, même principe
// que l'ajout de tags dans l'éditeur de recette (CreerForm.tsx) : les tags
// choisis apparaissent en pastilles retirables, l'ajout se fait un par un et
// exclut ce qui est déjà sélectionné. Seule la mécanique d'ajout diffère —
// une saisie filtrée plutôt qu'un bouton ouvrant la liste complète — pour
// rester cohérente avec le reste de l'écran (facette Ingrédients).
//
// La liste des tags est déjà chargée pour toute la page (`refs.tags`) : pas
// de requête réseau, le filtrage se fait en mémoire.
import { useState } from 'react';
import { normLoose, toggleValue, type SearchCriteria } from '@/lib/search-params';

// Suggestions affichées sous le champ, même borne que l'autocomplétion
// d'ingrédients.
const MAX_SUGGESTIONS = 7;

export function TagPicker({
  value,
  onChange,
  tags,
}: {
  value: SearchCriteria;
  onChange: (next: SearchCriteria) => void;
  tags: { id: number; name: string; slug: string }[];
}) {
  const [term, setTerm] = useState('');

  const selected = value.cat
    .map((slug) => tags.find((t) => t.slug === slug))
    .filter((t): t is { id: number; name: string; slug: string } => !!t);

  const query = normLoose(term.trim());
  const suggestions = query
    ? tags
        .filter((t) => !value.cat.includes(t.slug) && normLoose(t.name).includes(query))
        .slice(0, MAX_SUGGESTIONS)
    : [];

  function add(slug: string) {
    onChange({ ...value, cat: toggleValue(value.cat, slug) });
    setTerm('');
  }

  function remove(slug: string) {
    onChange({ ...value, cat: value.cat.filter((s) => s !== slug) });
  }

  return (
    <div>
      <p className="facet-h mb-3">Catégories</p>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selected.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[12.5px] bg-primary text-on-primary"
            >
              {t.name}
              <button
                type="button"
                onClick={() => remove(t.slug)}
                aria-label={`Retirer ${t.name}`}
                className="material-symbols-outlined text-[15px] hover:opacity-70 transition-opacity"
              >
                close
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2.5 focus-within:border-primary transition-colors">
          <span className="material-symbols-outlined text-[18px] text-outline">sell</span>
          <input
            type="text"
            value={term}
            autoComplete="off"
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              if (suggestions[0]) add(suggestions[0].slug);
            }}
            placeholder="Rechercher une catégorie…"
            aria-label="Rechercher une catégorie"
            className="flex-1 bg-transparent text-[13.5px] text-on-surface placeholder:text-outline/70 focus:outline-none"
          />
        </div>

        {suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full mt-1 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-xl z-30 max-h-[184px] overflow-y-auto hide-sb">
            {suggestions.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => add(t.slug)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13.5px] text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <span className="material-symbols-outlined text-[15px] text-outline">sell</span>
                  {t.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
