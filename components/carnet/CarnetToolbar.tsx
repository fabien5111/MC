'use client';

// Barre de filtres du carnet — même doctrine que la recherche avancée
// (components/search/SearchProvider.tsx) : l'URL est le seul état de l'écran,
// les pastilles et les contrôles réécrivent l'URL (`router.replace`), le
// Server Component (app/carnet/page.tsx) refait le rendu. Un état local sert
// d'affichage optimiste, en particulier pour la saisie (débouncée) — sans
// quoi chaque frappe déclencherait une navigation.
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  SCOPES,
  SCOPE_LABELS,
  STATUSES,
  STATUS_LABELS,
  SORT_KEYS,
  SORT_LABELS,
  carnetParamsToQueryString,
  type CarnetParams,
} from '@/lib/carnet-params';

const DEBOUNCE_MS = 300;

export function CarnetToolbar({
  params: serverParams,
  counts,
  statusCounts,
}: {
  params: CarnetParams;
  counts: Record<string, number>;
  statusCounts: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [params, setParams] = useState(serverParams);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serverKey = carnetParamsToQueryString(serverParams);
  useEffect(() => {
    setParams(serverParams);
    // serverKey résume serverParams ; le suivre évite une boucle de rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const navigate = useCallback(
    (next: CarnetParams) => {
      const qs = carnetParamsToQueryString(next);
      // `router.refresh()` appelé juste derrière un `router.replace()` a été
      // essayé puis retiré : les deux dispatchés dans le même tick semblent
      // interrompre la navigation avant qu'elle ne pose la nouvelle URL (le
      // symptôme constaté : la barre d'adresse ne change plus du tout). Même
      // ligne, sans le `refresh()`, que `SearchProvider.navigate` (recherche
      // avancée) — seule référence du produit où ce motif est éprouvé.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const update = useCallback(
    (next: CarnetParams, opts?: { debounce?: boolean }) => {
      setParams(next);
      if (timer.current) clearTimeout(timer.current);
      if (opts?.debounce) timer.current = setTimeout(() => navigate(next), DEBOUNCE_MS);
      else navigate(next);
    },
    [navigate],
  );

  // La barre de statut n'a de sens que sur mes propres recettes : elle
  // disparaît sur Favoris et Mes abonnements, ce sont les recettes des autres.
  const showStatusBar = params.scope !== 'fav' && params.scope !== 'sub';

  return (
    <div className="border-y border-outline-variant py-5">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex flex-wrap gap-2">
          {SCOPES.map((s) => {
            const active = params.scope === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => update({ ...params, scope: s, statut: s === 'fav' || s === 'sub' ? 'all' : params.statut })}
                className={`whitespace-nowrap rounded-pill px-4 py-1.5 font-label-md text-[12.5px] transition-all ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                }`}
              >
                {SCOPE_LABELS[s]} <span className="opacity-60">{counts[s] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="relative">
            <input
              type="text"
              value={params.q}
              onChange={(e) => update({ ...params, q: e.target.value }, { debounce: true })}
              placeholder="Chercher dans mon carnet…"
              className="w-52 rounded-pill border-none bg-surface-container-low py-2 pl-4 pr-10 text-[13px] outline-none focus:ring-1 focus:ring-primary md:w-64"
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">
              search
            </span>
          </div>
          <select
            value={params.tri}
            onChange={(e) => update({ ...params, tri: e.target.value as CarnetParams['tri'] })}
            className="cursor-pointer border-none bg-transparent text-[13px] font-semibold text-on-surface-variant focus:ring-0"
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {showStatusBar && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-variant/50 pt-4">
          <span className="mr-1 font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
            Statut
          </span>
          {STATUSES.map((s) => {
            const active = params.statut === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => update({ ...params, statut: s })}
                className={`whitespace-nowrap rounded-pill px-3 py-1 font-label-md text-[12px] transition-all ${
                  active ? 'bg-surface-container-high text-primary' : 'text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {STATUS_LABELS[s]}
                {s !== 'all' && <span className="opacity-60"> {statusCounts[s] ?? 0}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
