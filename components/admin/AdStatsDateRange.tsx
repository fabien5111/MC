'use client';

// Sélecteur de période de la page de statistiques d'une publicité. La période
// vit dans l'URL (`?from=&to=`), pas dans un état local persistant : partager
// le lien ou revenir en arrière restitue la même période.
import { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const FIELD =
  'border-b border-outline-variant bg-transparent py-2 text-sm text-on-surface focus:outline-none focus:border-primary transition-colors';
const LABEL = 'text-xs font-semibold text-on-surface-variant uppercase tracking-wider';
const PRESET =
  'px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium hover:bg-surface-container-high transition-colors';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const TODAY = new Date().toISOString().slice(0, 10);
// Repli « tout » : antérieur à toute campagne plausible plutôt que de gérer
// une borne ouverte séparément.
const EPOCH = '2020-01-01';

export function AdStatsDateRange({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  function apply(newFrom: string, newTo: string) {
    setStart(newFrom);
    setEnd(newTo);
    router.push(`${pathname}?from=${newFrom}&to=${newTo}`);
  }

  const invalid = end < start;

  return (
    <div className="flex flex-wrap items-end gap-4 mb-10">
      <div className="flex gap-2">
        <button type="button" onClick={() => apply(isoDaysAgo(6), TODAY)} className={PRESET}>
          7 jours
        </button>
        <button type="button" onClick={() => apply(isoDaysAgo(29), TODAY)} className={PRESET}>
          30 jours
        </button>
        <button type="button" onClick={() => apply(EPOCH, TODAY)} className={PRESET}>
          Tout
        </button>
      </div>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Du</span>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={FIELD} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>Au</span>
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={FIELD} />
      </label>
      <button
        type="button"
        disabled={invalid}
        onClick={() => apply(start, end)}
        className="px-5 py-2 bg-primary text-on-primary text-sm font-medium rounded hover:opacity-90 disabled:opacity-60"
      >
        Appliquer
      </button>
      {invalid && (
        <span className="text-xs text-error font-medium">La date de fin doit être postérieure ou égale à la date de début.</span>
      )}
    </div>
  );
}
