'use client';

// Facette « Ingrédients » — inclure / exclure. C'est la facette qui
// différencie le produit : elle ouvre la liste, en colonne comme en tiroir.
//
// Comportement identique dans les deux mises en page :
//  - bascule de mode (« À inclure » / « À exclure ») qui redonne le focus au
//    champ, pour enchaîner les saisies sans repointer la souris ;
//  - autocomplétion sur `ingredient_refs` (7 suggestions au maximum) ;
//  - ajout au clic ou à Entrée (première suggestion, à défaut la saisie
//    brute — un ingrédient absent du référentiel reste cherchable) ;
//  - dédoublonnage insensible à la casse et aux accents, et exclusion
//    mutuelle inclus/exclu (cf. `addIngredient`).
import { useEffect, useRef, useState } from 'react';
import { IngredientBadge } from '@/components/search/IngredientBadge';
import {
  addIngredient,
  removeIngredient,
  type IngredientMode,
  type SearchCriteria,
} from '@/lib/search-params';

type Suggestion = { id: number; name: string };

// Regroupement des frappes avant l'appel au référentiel.
const SUGGEST_DEBOUNCE_MS = 200;

export function IngredientPicker({
  value,
  onChange,
  compact = false,
  showLegend = true,
}: {
  value: SearchCriteria;
  onChange: (next: SearchCriteria) => void;
  compact?: boolean;
  showLegend?: boolean;
}) {
  const [mode, setMode] = useState<IngredientMode>('inc');
  const [term, setTerm] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Autocomplétion : la requête précédente est annulée, seule la dernière
  // réponse est appliquée — sinon les suggestions clignotent et peuvent
  // s'afficher dans le désordre.
  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ingredients?q=${encodeURIComponent(t)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const { items } = (await res.json()) as { items: Suggestion[] };
        setSuggestions(items ?? []);
      } catch {
        // Requête annulée ou réseau indisponible : on laisse la liste en état.
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  function add(label: string) {
    const next = addIngredient(value, label, mode);
    setTerm('');
    setSuggestions([]);
    onChange(next);
    inputRef.current?.focus();
  }

  function switchMode(next: IngredientMode) {
    setMode(next);
    inputRef.current?.focus();
  }

  const modeIcon = mode === 'inc' ? 'add_circle' : 'do_not_disturb_on';
  const badges: { label: string; mode: IngredientMode }[] = [
    ...value.inc.map((label) => ({ label, mode: 'inc' as const })),
    ...value.exc.map((label) => ({ label, mode: 'exc' as const })),
  ];

  return (
    <div>
      <p className="facet-h mb-3">Ingrédients</p>

      {/* Bascule de mode : la position active prend le fond blanc et la
          couleur de son mode, pour que le champ et les suggestions en
          dessous se lisent sans ambiguïté. */}
      <div className="flex items-center gap-1 p-0.5 bg-surface-container-high rounded-full mb-3" role="group">
        {(['inc', 'exc'] as const).map((m) => {
          const on = mode === m;
          const tone =
            m === 'inc' ? 'text-ingredient-include-text' : 'text-ingredient-exclude-text';
          return (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              aria-pressed={on}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full font-label-md transition-all ${
                compact ? 'text-[11.5px]' : 'text-[12px]'
              } ${on ? `bg-surface-container-lowest shadow-sm ${tone}` : 'text-on-surface-variant'}`}
            >
              <span className="material-symbols-outlined text-[15px]">
                {m === 'inc' ? 'add_circle' : 'do_not_disturb_on'}
              </span>
              {compact ? (m === 'inc' ? 'Inclure' : 'Exclure') : m === 'inc' ? 'À inclure' : 'À exclure'}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <div className="flex items-center gap-2 bg-surface-container-lowest border border-outline-variant rounded-lg px-3 py-2.5 focus-within:border-primary transition-colors">
          <span className="material-symbols-outlined text-[18px] text-outline">nutrition</span>
          <input
            ref={inputRef}
            type="text"
            value={term}
            autoComplete="off"
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const label = suggestions[0]?.name ?? term;
              if (label.trim()) add(label);
            }}
            placeholder={compact ? 'Ajouter un ingrédient…' : 'Tapez un ingrédient…'}
            aria-label={mode === 'inc' ? 'Ingrédient à inclure' : 'Ingrédient à exclure'}
            className="flex-1 bg-transparent text-[13.5px] text-on-surface placeholder:text-outline/70 focus:outline-none"
          />
        </div>

        {suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 top-full mt-1 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-xl z-30 max-h-[184px] overflow-y-auto hide-sb">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => add(s.name)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13.5px] text-on-surface hover:bg-surface-container-low transition-colors"
                >
                  <span
                    className={`material-symbols-outlined text-[15px] ${
                      mode === 'inc' ? 'text-ingredient-include-text' : 'text-ingredient-exclude-text'
                    }`}
                  >
                    {modeIcon}
                  </span>
                  {s.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {badges.map((b) => (
            <IngredientBadge
              key={`${b.mode}:${b.label}`}
              label={b.label}
              mode={b.mode}
              onRemove={() => onChange(removeIngredient(value, b.label))}
            />
          ))}
        </div>
      )}

      {showLegend && (
        <p className="text-[11.5px] text-outline italic mt-2.5">
          Vert = présent dans la recette · Rouge barré = absent
        </p>
      )}
    </div>
  );
}
