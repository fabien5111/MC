'use client';

// Choix des recettes du carnet CAP (JEP-6, lot 3). Formulaire GET ordinaire :
// la sélection voyage dans l'URL (`?r=<id>&r=<id>`), la page d'impression se
// relit depuis la base. La recherche ne fait que MASQUER les lignes (jamais
// les démonter) : une recette cochée puis filtrée reste dans l'envoi.
import { useState } from 'react';
import { matchesSearch } from '@/lib/text-search';

export type CapChoix = { id: string; titre: string; origine: string };

export function CapSelection({ recettes, coches, max }: { recettes: CapChoix[]; coches: string[]; max: number }) {
  const [q, setQ] = useState('');
  const [selection, setSelection] = useState<Set<string>>(() => new Set(coches));
  const visibles = recettes.filter((r) => matchesSearch([r.titre], q));
  const basculer = (id: string, on: boolean) =>
    setSelection((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const tout = (on: boolean) =>
    setSelection((s) => {
      const n = new Set(s);
      visibles.forEach((r) => (on ? n.add(r.id) : n.delete(r.id)));
      return n;
    });
  const trop = selection.size > max;

  return (
    <form method="get" action="/carnet/cap" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher une recette"
          aria-label="Rechercher une recette"
          className="min-w-0 flex-1 rounded-pill border border-outline-variant bg-white px-4 py-2 text-[14px]"
        />
        <button type="button" onClick={() => tout(true)} className="text-[13px] text-primary underline">
          Tout cocher
        </button>
        <button type="button" onClick={() => tout(false)} className="text-[13px] text-primary underline">
          Tout décocher
        </button>
      </div>
      {!recettes.length && <p className="text-on-surface-variant">Votre carnet ne contient encore aucune recette.</p>}
      <ul className="divide-y divide-outline-variant/40 rounded-lg border border-outline-variant bg-white">
        {recettes.map((r) => (
          <li key={r.id} className={matchesSearch([r.titre], q) ? '' : 'hidden'}>
            <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5">
              <input
                type="checkbox"
                name="r"
                value={r.id}
                checked={selection.has(r.id)}
                onChange={(e) => basculer(r.id, e.target.checked)}
                className="accent-primary"
              />
              <span className="flex-1 text-[14px] text-on-surface">{r.titre}</span>
              <span className="text-[12px] text-on-surface-variant">{r.origine}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="sticky bottom-20 flex flex-wrap items-center justify-end gap-3 rounded-lg bg-surface/95 py-3 lg:bottom-0">
        {trop && <p className="text-[13px] text-error">{max} recettes au plus par impression.</p>}
        <span className="text-[13px] text-on-surface-variant">
          {selection.size} recette{selection.size > 1 ? 's' : ''} sélectionnée{selection.size > 1 ? 's' : ''}
        </span>
        <button
          type="submit"
          disabled={!selection.size || trop}
          className="rounded-pill bg-primary px-5 py-2.5 text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Préparer l’impression
        </button>
      </div>
    </form>
  );
}
