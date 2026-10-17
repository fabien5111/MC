'use client';

// Réglages du carnet sous 1024 px (mobile et tablette) : rappel des réglages
// actifs sous le titre, bouton flottant et feuille remontante qui porte tout —
// partage, recherche, tri, portée, statut. Même motif que le tiroir de la
// recherche avancée (`SearchFiltersPanel`) et que le sommaire d'une recette
// (`RecipeToc`) : au-dessus de 1024 px, `CarnetToolbar` garde ses pastilles.
//
// **Brouillon local, appliqué à la validation seulement.** Les réglages
// alimentent un état propre à la feuille ; « Afficher les résultats » les pose
// d'un seul coup dans l'URL (une navigation, un voile). Fermer par le voile ou
// par Échap annule : la feuille se rouvre toujours sur ce qui est appliqué.
// Pas de compteur de résultats sur le bouton : les compteurs des portées et des
// statuts ne tiennent pas compte de la recherche libre, un chiffre affiché
// serait faux dès qu'un terme est saisi.
//
// **Le partage ne s'ouvre pas dans la feuille.** La fenêtre de
// `ShareBookButton` est un `fixed` : dans une feuille translatée, elle serait
// piégée dans son repère. La ligne de la feuille ferme donc la feuille et
// déclenche le bouton de `CarnetToolbar`, monté hors de la feuille (`onShare`).
import { useEffect, useId, useState } from 'react';
import { BottomSheet } from '@/components/BottomSheet';
import {
  SCOPE_LABELS,
  SORT_KEYS,
  SORT_LABELS,
  STATUSES,
  STATUS_LABELS,
  EMPTY_CARNET_PARAMS,
  type CarnetParams,
} from '@/lib/carnet-params';

// Portées sans barre de statut — même règle que `CarnetToolbar` et
// `parseCarnetParams`.
const SANS_STATUT: ReadonlyArray<CarnetParams['scope']> = ['fav', 'sub', 'proj'];

function reglagesActifs(p: CarnetParams) {
  return [
    p.scope !== EMPTY_CARNET_PARAMS.scope,
    p.statut !== EMPTY_CARNET_PARAMS.statut,
    p.q.trim() !== '',
    p.tri !== EMPTY_CARNET_PARAMS.tri,
  ].filter(Boolean).length;
}

const PASTILLE =
  'whitespace-nowrap rounded-pill px-4 py-2 font-label-md text-[13px] transition-all';

export function CarnetFiltersSheet({
  params,
  scopes,
  counts,
  statusCounts,
  onApply,
  onShare,
}: {
  params: CarnetParams;
  scopes: CarnetParams['scope'][];
  counts: Record<string, number>;
  statusCounts: Record<string, number>;
  onApply: (next: CarnetParams) => void;
  // Absent en session « en tant que » lecture seule : pas de ligne de partage.
  onShare?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CarnetParams>(params);
  const sheetId = useId();

  // Brouillon resynchronisé à chaque ouverture : une navigation venue d'ailleurs
  // (retour arrière) ou des réglages abandonnés ne doivent pas y survivre.
  useEffect(() => {
    if (open) setDraft(params);
  }, [open, params]);

  const actifs = reglagesActifs(params);
  const resume = [
    SCOPE_LABELS[params.scope],
    params.statut !== 'all' ? STATUS_LABELS[params.statut] : null,
    params.q.trim() ? `« ${params.q.trim()} »` : null,
    params.tri !== 'recent' ? SORT_LABELS[params.tri] : null,
  ].filter(Boolean);

  const avecStatut = !SANS_STATUT.includes(draft.scope);
  // Les compteurs de statut sont ceux de la portée appliquée : ils ne valent
  // pas pour une autre portée choisie dans le brouillon.
  const statutsChiffres = draft.scope === params.scope;

  function appliquer() {
    onApply({ ...draft, q: draft.q.trim() });
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-controls={sheetId}
        className="flex w-full items-center justify-center gap-2 rounded-pill border border-outline-variant bg-white px-4 py-2.5 text-[13px] font-semibold text-on-surface-variant"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden>
          tune
        </span>
        <span className="truncate">{resume.join(' · ')}</span>
      </button>

      <button
        type="button"
        className="recipe-toc-fab lg:hidden"
        data-inset="nav"
        data-hidden={open}
        aria-label={actifs > 0 ? `Réglages du carnet, ${actifs} actif${actifs > 1 ? 's' : ''}` : 'Réglages du carnet'}
        aria-expanded={open}
        aria-controls={sheetId}
        onClick={() => setOpen(true)}
      >
        <span className="material-symbols-outlined" aria-hidden>
          tune
        </span>
        {actifs > 0 && (
          <span
            aria-hidden
            className="absolute -right-1 -top-1 flex h-[20px] min-w-[20px] items-center justify-center rounded-pill bg-white px-1 text-[11px] font-bold text-primary ring-2 ring-primary"
          >
            {actifs}
          </span>
        )}
      </button>

      <BottomSheet
        id={sheetId}
        open={open}
        onClose={() => setOpen(false)}
        breakpoint="lg"
        label="Réglages du carnet"
        sheetClassName="max-h-[85vh] overflow-y-auto"
      >
        <div className="flex flex-col gap-5 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5">
          {onShare && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onShare();
              }}
              className="flex items-center gap-3 rounded-xl border border-outline-variant px-4 py-3 text-left text-[14px] font-semibold text-primary"
            >
              <span className="material-symbols-outlined text-[20px]" aria-hidden>
                share
              </span>
              Partager mon carnet
            </button>
          )}

          <div className="relative">
            <input
              type="search"
              value={draft.q}
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') appliquer();
              }}
              placeholder="Chercher dans mon carnet…"
              aria-label="Chercher dans mon carnet"
              enterKeyHint="search"
              className="w-full rounded-pill border border-outline-variant bg-white py-3 pl-4 pr-11 text-[14px] outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="material-symbols-outlined pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[20px] text-outline" aria-hidden>
              search
            </span>
          </div>

          <label className="flex flex-col gap-2">
            <span className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">Trier par</span>
            <select
              value={draft.tri}
              onChange={(e) => setDraft({ ...draft, tri: e.target.value as CarnetParams['tri'] })}
              className="cursor-pointer rounded-pill border border-outline-variant bg-white px-4 py-3 text-[14px] font-semibold text-on-surface-variant outline-none focus:ring-1 focus:ring-primary"
            >
              {SORT_KEYS.map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">Afficher</legend>
            <div className="flex flex-wrap gap-2">
              {scopes.map((s) => {
                const actif = draft.scope === s;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={actif}
                    onClick={() =>
                      setDraft({ ...draft, scope: s, statut: SANS_STATUT.includes(s) ? 'all' : draft.statut })
                    }
                    className={`${PASTILLE} ${
                      actif ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {SCOPE_LABELS[s]} <span className="opacity-60">{counts[s] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {avecStatut && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">Statut</legend>
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => {
                  const actif = draft.statut === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={actif}
                      onClick={() => setDraft({ ...draft, statut: s })}
                      className={`${PASTILLE} ${
                        actif ? 'bg-surface-container-high text-primary' : 'border border-outline-variant text-on-surface-variant'
                      }`}
                    >
                      {STATUS_LABELS[s]}
                      {s !== 'all' && statutsChiffres && <span className="opacity-60"> {statusCounts[s] ?? 0}</span>}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <div className="flex items-center gap-3 border-t border-outline-variant pt-4">
            <button
              type="button"
              onClick={() => setDraft(EMPTY_CARNET_PARAMS)}
              disabled={reglagesActifs(draft) === 0}
              className="px-2 py-3 text-[13px] font-semibold text-on-surface-variant underline disabled:opacity-40"
            >
              Réinitialiser
            </button>
            <button
              type="button"
              onClick={appliquer}
              className="flex-1 rounded-pill bg-primary px-4 py-3 text-[14px] font-semibold text-on-primary active:scale-95"
            >
              Afficher les résultats
            </button>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
