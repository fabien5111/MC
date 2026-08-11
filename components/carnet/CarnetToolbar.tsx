'use client';

// Barre de filtres du carnet.
//
// L'URL est le seul état de l'écran (`lib/carnet-params.ts`), comme sur la
// recherche avancée : rechargement, partage de lien et retour arrière
// restituent le même filtrage.
//
// Les pastilles sont de **vrais liens** (`<Link>`), pas des boutons pilotés
// par `router.replace()`. Trois tentatives successives de faire commiter la
// navigation par `router.replace()` depuis un `onClick` ont échoué sur ce
// composant (la requête RSC partait bien avec les bons paramètres, répondait
// 200, mais le routeur n'appliquait jamais le résultat : l'URL ne changeait
// pas et la grille restait figée). Un lien n'a pas ce problème — c'est le
// primitif de navigation du framework — et il rend en prime le clic-milieu,
// l'ouverture dans un nouvel onglet et le survol/prefetch gratuits. Filtrer,
// ici, *est* une navigation : autant l'écrire comme telle.
//
// Restent en `router.replace()` les deux contrôles qui ne peuvent pas être des
// liens : la saisie libre (débouncée, une frappe n'est pas un clic) et le
// menu de tri.
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
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
  params,
  counts,
  statusCounts,
}: {
  params: CarnetParams;
  counts: Record<string, number>;
  statusCounts: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Saisie : seul contrôle à garder un état local, parce qu'il doit réagir à
  // chaque frappe alors que la navigation, elle, est débouncée.
  const [q, setQ] = useState(params.q);
  useEffect(() => setQ(params.q), [params.q]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const hrefFor = useCallback(
    (next: CarnetParams) => {
      const qs = carnetParamsToQueryString(next);
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname],
  );

  const navigate = useCallback(
    (next: CarnetParams) => {
      startTransition(() => router.replace(hrefFor(next), { scroll: false }));
    },
    [hrefFor, router],
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
              <Link
                key={s}
                href={hrefFor({
                  ...params,
                  scope: s,
                  // Le statut n'existe pas sur les recettes des autres : on le
                  // remet à « Tous » en y entrant, sinon un filtre invisible
                  // resterait actif (même règle que `parseCarnetParams`).
                  statut: s === 'fav' || s === 'sub' ? 'all' : params.statut,
                })}
                scroll={false}
                aria-current={active ? 'true' : undefined}
                className={`whitespace-nowrap rounded-pill px-4 py-1.5 font-label-md text-[12.5px] transition-all ${
                  active
                    ? 'bg-primary text-on-primary'
                    : 'border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                }`}
              >
                {SCOPE_LABELS[s]} <span className="opacity-60">{counts[s] ?? 0}</span>
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-4">
          <div className="relative">
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => navigate({ ...params, q: e.target.value }), DEBOUNCE_MS);
              }}
              placeholder="Chercher dans mon carnet…"
              className="w-52 rounded-pill border-none bg-surface-container-low py-2 pl-4 pr-10 text-[13px] outline-none focus:ring-1 focus:ring-primary md:w-64"
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">
              search
            </span>
          </div>
          <select
            value={params.tri}
            onChange={(e) => navigate({ ...params, tri: e.target.value as CarnetParams['tri'] })}
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
              <Link
                key={s}
                href={hrefFor({ ...params, statut: s })}
                scroll={false}
                aria-current={active ? 'true' : undefined}
                className={`whitespace-nowrap rounded-pill px-3 py-1 font-label-md text-[12px] transition-all ${
                  active ? 'bg-surface-container-high text-primary' : 'text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {STATUS_LABELS[s]}
                {s !== 'all' && <span className="opacity-60"> {statusCounts[s] ?? 0}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
