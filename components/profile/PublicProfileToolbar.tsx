'use client';

// Barre de recherche et de tri de la vitrine publique d'un pâtissier —
// pendant de `CarnetToolbar`, réduit à ses deux contrôles utiles ici : les
// pastilles de provenance et de statut n'ont pas de sens sur des recettes
// toutes publiées par la même personne.
//
// L'URL est le seul état de l'écran (`lib/public-profile-params.ts`) : le
// Server Component re-rend, la grille reste rendue à un seul endroit.
//
// Contrairement au carnet, pas de provider de transition : là-bas l'overlay
// est rendu par la grille, cliente, alors qu'ici la grille est un Server
// Component (`RecipeCard` résout les allergènes côté serveur). L'overlay étant
// plein écran, la barre le porte elle-même — c'est elle qui déclenche la
// navigation, donc elle seule a besoin d'en connaître l'état.
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SORT_KEYS, SORT_LABELS } from '@/lib/recipe-sort';
import { publicProfileParamsToQueryString, type PublicProfileParams } from '@/lib/public-profile-params';
import { LoadingOverlay } from '@/components/LoadingOverlay';

const DEBOUNCE_MS = 300;
// Délai avant d'afficher le fouet : un rafraîchissement quasi instantané ne
// doit pas produire de clignotement — même délai que NavigationSpinner,
// SearchResults et CarnetContent.
const NAV_SHOW_DELAY_MS = 120;

export function PublicProfileToolbar({ params }: { params: PublicProfileParams }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Saisie : seul contrôle à garder un état local, parce qu'il doit réagir à
  // chaque frappe alors que la navigation, elle, est débouncée.
  const [q, setQ] = useState(params.q);
  useEffect(() => setQ(params.q), [params.q]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const [spinnerVisible, setSpinnerVisible] = useState(false);
  useEffect(() => {
    if (!pending) {
      setSpinnerVisible(false);
      return;
    }
    const t = setTimeout(() => setSpinnerVisible(true), NAV_SHOW_DELAY_MS);
    return () => clearTimeout(t);
  }, [pending]);

  const navigate = useCallback(
    (next: PublicProfileParams) => {
      const qs = publicProfileParamsToQueryString(next);
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [pathname, router],
  );

  return (
    <div className="mb-8 flex flex-wrap items-center justify-end gap-4 border-y border-outline-variant py-5">
      <LoadingOverlay visible={spinnerVisible} label="Chargement des recettes…" />
      <div className="relative">
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            if (timer.current) clearTimeout(timer.current);
            const value = e.target.value;
            timer.current = setTimeout(() => navigate({ ...params, q: value }), DEBOUNCE_MS);
          }}
          placeholder="Chercher une recette…"
          aria-label="Chercher une recette de ce pâtissier"
          className="w-52 rounded-pill border-none bg-surface-container-low py-2 pl-4 pr-10 text-[13px] outline-none focus:ring-1 focus:ring-primary md:w-64"
        />
        <span className="material-symbols-outlined pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">
          search
        </span>
      </div>
      <select
        value={params.tri}
        onChange={(e) => navigate({ ...params, tri: e.target.value as PublicProfileParams['tri'] })}
        aria-label="Trier les recettes"
        className="cursor-pointer border-none bg-transparent text-[13px] font-semibold text-on-surface-variant focus:ring-0"
      >
        {SORT_KEYS.map((k) => (
          <option key={k} value={k}>
            {SORT_LABELS[k]}
          </option>
        ))}
      </select>
    </div>
  );
}
