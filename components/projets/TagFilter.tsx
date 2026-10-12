'use client';

// Filtre par tags de la recherche d'une recette de base (mode projet) :
// pastilles pleines qu'un clic retire, « + Ajouter un tag » ouvre une liste
// avec recherche sans accents ni casse. Même présentation que les catégories
// de l'éditeur de recette, sans création de tag : ici on filtre, on ne
// catalogue pas.
import { useEffect, useMemo, useRef, useState } from 'react';
import { normSearch } from '@/lib/text-search';

export type TagOption = { id: number; name: string };

export function TagFilter({
  tags,
  selected,
  onChange,
}: {
  tags: TagOption[];
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Repli de la liste au clic en dehors.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choisis = selected.flatMap((id) => {
    const t = tags.find((x) => x.id === id);
    return t ? [t] : [];
  });
  const restants = useMemo(() => {
    const q = normSearch(search.trim());
    return tags.filter((t) => !selected.includes(t.id) && (!q || normSearch(t.name).includes(q)));
  }, [tags, selected, search]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="font-label-md text-[12px] uppercase tracking-wide text-outline">Tags</span>
      {choisis.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(selected.filter((id) => id !== t.id))}
          title="Retirer ce tag du filtre"
          className="flex items-center gap-1.5 rounded-full bg-primary-container px-4 py-1.5 font-label-md text-label-md text-white transition-opacity hover:opacity-80"
        >
          {t.name}
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      ))}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setSearch('');
          }}
          className="rounded-full border border-outline-variant px-4 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
        >
          + Ajouter un tag
        </button>
        {open && (
          <div className="absolute left-0 z-20 mt-2 flex max-h-64 min-w-[220px] flex-col overflow-hidden rounded-xl border border-outline-variant bg-white shadow-lg">
            <div className="shrink-0 px-2 pb-2 pt-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher un tag…"
                autoFocus
                className="w-full rounded-lg border border-outline-variant px-3 py-1.5 text-sm outline-none focus:border-primary"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {restants.length ? (
                restants.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onChange([...selected, t.id]);
                      setOpen(false);
                    }}
                    className="block w-full px-4 py-2 text-left font-label-md text-label-md text-on-surface transition-colors hover:bg-surface-container"
                  >
                    {t.name}
                  </button>
                ))
              ) : (
                <p className="px-4 py-2 text-sm italic text-on-surface-variant">Aucun autre tag disponible</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
