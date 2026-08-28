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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { useCarnetTransition } from '@/components/carnet/CarnetProvider';

const DEBOUNCE_MS = 300;

export function CarnetToolbar({
  params,
  counts,
  statusCounts,
  shareButton,
}: {
  params: CarnetParams;
  counts: Record<string, number>;
  statusCounts: Record<string, number>;
  // Même instance de ShareBookButton que la ligne de titre (app/carnet/page.tsx),
  // simplement rejouée ici pour la ligne mobile « Partager + recherche » —
  // évite de faire remonter ownerId/bookSharesGiven jusqu'à ce composant.
  shareButton?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { startTransition } = useCarnetTransition();
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

  // La barre de statut disparaît sur Favoris et Mes abonnements : ces
  // recettes des autres sont toujours déjà publiées et publiques, leur statut
  // ne varie jamais. Elle reste affichée sur Partagées avec moi : une recette
  // partagée peut être un brouillon (portée « brouillons compris » du partage
  // de carnet, ou partage direct sans restriction de statut) — ses
  // compteurs viennent alors de `sharedStatusCounts`, pas de `statusCounts`
  // (cf. app/carnet/page.tsx).
  const showStatusBar = params.scope !== 'fav' && params.scope !== 'sub' && params.scope !== 'proj';

  // « Projets » n'apparaît que s'il y a quelque chose à y voir : une pastille
  // vide en permanence coûterait de la place à tous les carnets pour une
  // portée que la plupart n'utiliseront jamais. Elle reste affichée si elle
  // est la portée active, sinon on ne pourrait plus en sortir depuis le
  // sélecteur mobile.
  const scopes = SCOPES.filter((s) => s !== 'proj' || params.scope === 'proj' || (counts.proj ?? 0) > 0);

  const selectClassName =
    'cursor-pointer rounded-pill border border-outline-variant bg-surface-container-low px-3 py-2 text-[13px] font-semibold text-on-surface-variant outline-none focus:ring-1 focus:ring-primary';

  return (
    <div className="border-y border-outline-variant py-5">
      {/* Desktop (>= md) : pastilles cliquables inchangées. */}
      <div className="hidden md:block">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex flex-wrap gap-2">
            {scopes.map((s) => {
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
                    statut: s === 'fav' || s === 'sub' || s === 'proj' ? 'all' : params.statut,
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

      {/* Mobile (< md) : Partager + recherche sur une ligne, portée et statut
          en listes déroulantes sur l'autre — tout centré (les pastilles
          prennent trop de place sur cette largeur). */}
      <div className="flex flex-col items-center gap-4 md:hidden">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {shareButton}
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
              className="w-52 rounded-pill border-none bg-surface-container-low py-2 pl-4 pr-10 text-[13px] outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">
              search
            </span>
          </div>
          <select
            value={params.tri}
            onChange={(e) => navigate({ ...params, tri: e.target.value as CarnetParams['tri'] })}
            className={selectClassName}
          >
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <select
            value={params.scope}
            onChange={(e) => {
              const scope = e.target.value as CarnetParams['scope'];
              navigate({
                ...params,
                scope,
                statut: scope === 'fav' || scope === 'sub' || scope === 'proj' ? 'all' : params.statut,
              });
            }}
            className={selectClassName}
          >
            {scopes.map((s) => (
              <option key={s} value={s}>
                {SCOPE_LABELS[s]} ({counts[s] ?? 0})
              </option>
            ))}
          </select>

          {showStatusBar && (
            <select
              value={params.statut}
              onChange={(e) => navigate({ ...params, statut: e.target.value as CarnetParams['statut'] })}
              className={selectClassName}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                  {s !== 'all' ? ` (${statusCounts[s] ?? 0})` : ''}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  );
}
