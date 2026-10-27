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
import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SCOPES,
  SCOPE_LABELS,
  SCOPE_VERROU,
  STATUSES,
  STATUS_LABELS,
  SORT_KEYS,
  SORT_LABELS,
  carnetParamsToQueryString,
  type CarnetParams,
} from '@/lib/carnet-params';
import { useCarnetTransition } from '@/components/carnet/CarnetProvider';
import { CarnetFiltersSheet } from '@/components/carnet/CarnetFiltersSheet';
import { LockedAction } from '@/components/LockedAction';
import { ListesMenu } from '@/components/listes/ListesMenu';
import type { ListeResume } from '@/lib/recipe-lists';

const DEBOUNCE_MS = 300;

export function CarnetToolbar({
  params,
  counts,
  statusCounts,
  shareButton,
  verrouilles = [],
  listes,
}: {
  params: CarnetParams;
  counts: Record<string, number>;
  statusCounts: Record<string, number>;
  // Même instance de ShareBookButton que la ligne de titre (app/carnet/page.tsx),
  // simplement rejouée ici pour la ligne mobile « Partager + recherche » —
  // évite de faire remonter ownerId/bookSharesGiven jusqu'à ce composant.
  shareButton?: ReactNode;
  // Portées dont le droit manque à la formule (`carnet_cap` pour « Carnet CAP »,
  // `listes_recettes` pour « Mes listes ») : pastille affichée mais verrouillée.
  verrouilles?: CarnetParams['scope'][];
  // Pastille « Mes listes » (JEP-376) : liste déroulante des listes
  // personnelles (choisir, créer, renommer, supprimer), cf. ListesMenu.
  listes?: { liste: ListeResume[]; selectionId: string | null; peut: boolean; max: number | null };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { startTransition } = useCarnetTransition();
  // Transition dédiée à la recherche, jamais celle de CarnetProvider : sans
  // `startTransition`, la navigation devient une mise à jour urgente et le
  // re-rendu de la grille (et la resynchronisation de `q` ci-dessous)
  // secoue visiblement le champ pendant la frappe (JEP-54, retour terrain).
  // Une transition à soi garde la saisie fluide sans jamais faire passer
  // `navPending` du contexte partagé à `true` — donc sans réafficher le
  // fouet que JEP-54 voulait justement retirer.
  const [searchPending, startSearchTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Saisie : seul contrôle à garder un état local, parce qu'il doit réagir à
  // chaque frappe alors que la navigation, elle, est débouncée.
  const [q, setQ] = useState(params.q);

  // Dernière valeur tapée, et « une navigation de saisie est partie sans que
  // l'URL l'ait encore rattrapée ». Sans ces deux repères, la resynchro
  // ci-dessous réécrivait le champ avec l'écho de sa PROPRE navigation, en
  // retard du debounce plus du rendu serveur : les lettres tapées entre-temps
  // étaient perdues et le curseur sautait en fin de champ (mesuré sur vidéo :
  // « préli » redevenu « pr » en 100 ms). Le défaut est antérieur à JEP-54 —
  // le fouet plein écran le masquait en couvrant l'écran pendant toute la
  // navigation, donc personne ne tapait pendant la resynchro.
  const derniereSaisie = useRef(params.q);
  const saisieEnVol = useRef(false);

  useEffect(() => {
    // L'URL a rattrapé la frappe : la saisie n'est plus en vol.
    if (params.q === derniereSaisie.current) {
      saisieEnVol.current = false;
      return;
    }
    // Écho en retard de notre propre navigation : la frappe fait foi.
    if (saisieEnVol.current) return;
    // Changement venu d'ailleurs — retour arrière du navigateur, lien
    // partagé, pastille de filtre : c'est ce que cette resynchro protège,
    // et elle doit continuer de s'appliquer.
    derniereSaisie.current = params.q;
    setQ(params.q);
  }, [params.q]);

  // Fin de la navigation de saisie, que l'URL ait changé ou non : taper puis
  // tout effacer renvoie à l'URL courante, `params.q` ne bouge alors jamais
  // et l'effet ci-dessus ne se rejoue pas — sans ce filet, le drapeau
  // resterait levé et une resynchro légitime serait ignorée pour toujours.
  useEffect(() => {
    if (!searchPending) saisieEnVol.current = false;
  }, [searchPending]);

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

  // Recherche (JEP-54) : sa propre transition (ci-dessus), jamais celle
  // partagée avec CarnetContent — `navPending` ne passe donc jamais à
  // `true` pour cette navigation et le fouet plein écran ne s'affiche pas
  // pendant la frappe, une saisie étant bien plus fréquente qu'un
  // changement de tri/scope/statut pour justifier ce voile (même doctrine
  // que VoteButton sur la boîte à idées).
  const navigateSearch = useCallback(
    (next: CarnetParams) => {
      startSearchTransition(() => router.replace(hrefFor(next), { scroll: false }));
    },
    [hrefFor, router],
  );

  // Un seul point d'entrée pour les deux champs (desktop et mobile), montés
  // en même temps et pilotés par le même état : dupliquer ce geste, c'était
  // deux endroits où oublier un des deux repères ci-dessus.
  function saisir(valeur: string) {
    derniereSaisie.current = valeur;
    saisieEnVol.current = true;
    setQ(valeur);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => navigateSearch({ ...params, q: valeur }), DEBOUNCE_MS);
  }

  // Validation de la feuille mobile : la saisie de la feuille remplace celle du
  // champ du bureau, et le debounce éventuellement armé ne doit plus la
  // réécrire.
  const shareRef = useRef<HTMLDivElement>(null);
  function appliquerDepuisFeuille(next: CarnetParams) {
    if (timer.current) clearTimeout(timer.current);
    derniereSaisie.current = next.q;
    saisieEnVol.current = false;
    setQ(next.q);
    navigate(next);
  }

  // La barre de statut est affichée sur toutes les portées (JEP-6, homogénéité).
  // Ses compteurs sont ceux de la portée courante (`statusCounts`, calculés par
  // app/carnet/page.tsx) ; sur « Tout » et « Mes recettes » ils portent, comme
  // avant, sur mes recettes.

  // « Projets » n'apparaît que s'il y a quelque chose à y voir : une pastille
  // vide en permanence coûterait de la place à tous les carnets pour une
  // portée que la plupart n'utiliseront jamais. Elle reste affichée si elle
  // est la portée active, sinon on ne pourrait plus en sortir depuis le
  // sélecteur mobile.
  // « Carnet CAP » est visible toujours, même à 0 : c'est un point d'entrée
  // (impression), pas un tiroir qu'on remplit soi-même. Sans le droit, la
  // pastille reste affichée mais verrouillée (`LockedAction`, JEP-130) : une
  // fonction qui n'apparaît pas ne s'explique pas.
  const scopes = SCOPES.filter((s) => (s === 'proj' ? params.scope === 'proj' || (counts.proj ?? 0) > 0 : true));

  // Recherche + tri du bureau, à droite de la ligne des statuts — qui reste
  // affichée sur les portées sans statut (Favoris, Abonnements, Projets) pour
  // que la recherche ne change pas de place d'une portée à l'autre.
  const rechercheTri = (
    <>
      <div className="relative">
        <input
          type="text"
          value={q}
          onChange={(e) => saisir(e.target.value)}
          placeholder="Chercher dans mon carnet…"
          className="w-52 rounded-pill border border-outline-variant bg-white py-2 pl-4 pr-10 text-[13px] outline-none focus:ring-1 focus:ring-primary rail:w-64"
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
    </>
  );

  return (
    <div className="border-y border-outline-variant py-5">
      {/* Desktop (>= lg) : pastilles cliquables. En dessous, tout passe par la
          feuille de CarnetFiltersSheet. */}
      <div className="hidden lg:block">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex flex-wrap gap-2">
            {scopes.map((s) => {
              const active = params.scope === s;
              if (verrouilles.includes(s)) {
                return (
                  <LockedAction
                    key={s}
                    label={SCOPE_LABELS[s]}
                    message={SCOPE_VERROU[s] ?? ''}
                    className="whitespace-nowrap rounded-pill border border-outline-variant px-4 py-1.5 font-label-md text-[12.5px]"
                  >
                    {SCOPE_LABELS[s]}
                  </LockedAction>
                );
              }
              if (s === 'listes' && listes) {
                return (
                  <ListesMenu
                    key={s}
                    params={params}
                    listes={listes.liste}
                    selectionId={listes.selectionId}
                    peutListes={listes.peut}
                    max={listes.max}
                  />
                );
              }
              return (
                <Link
                  key={s}
                  href={hrefFor({
                    ...params,
                    scope: s,
                    statut: params.statut,
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

        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-outline-variant/50 pt-4">
          <>
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
          </>
          <div className="ml-auto flex items-center gap-4">{rechercheTri}</div>
        </div>
      </div>

      {/* Mobile et tablette (< lg) : rappel des réglages, bouton flottant et
          feuille remontante. Le bouton de partage est monté ici, hors de la
          feuille, et déclenché par sa ligne : cf. CarnetFiltersSheet. */}
      <div className="lg:hidden">
        <CarnetFiltersSheet
          params={params}
          scopes={scopes}
          verrouilles={verrouilles}
          counts={counts}
          statusCounts={statusCounts}
          onApply={appliquerDepuisFeuille}
          onShare={shareButton ? () => shareRef.current?.querySelector('button')?.click() : undefined}
        />
        {/* Sous 1024 px, la feuille choisit la portée ; sur « Mes listes », la
            liste déroulante (choix et gestion des listes) reste à portée de doigt. */}
        {params.scope === 'listes' && listes && (
          <ListesMenu
            className="mt-4 inline-block"
            params={params}
            listes={listes.liste}
            selectionId={listes.selectionId}
            peutListes={listes.peut}
            max={listes.max}
          />
        )}
        {shareButton && (
          <div ref={shareRef} className="[&>button]:hidden">
            {shareButton}
          </div>
        )}
      </div>
    </div>
  );
}
