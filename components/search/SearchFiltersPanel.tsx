'use client';

// Critères de recherche — colonne persistante au-dessus de 1024 px, tiroir
// remontant en dessous.
//
// La bascule à 1024 px (`lg` du thème) est une décision de design, pas une
// valeur indicative : une tablette en portrait n'a pas la place pour une
// colonne de 318 px à côté d'une grille de cartes.
//
// Deux comportements distincts, volontairement :
//  - colonne (desktop) : chaque réglage s'applique immédiatement, les
//    résultats se rafraîchissent à côté ;
//  - tiroir (mobile) : les réglages alimentent un brouillon local et ne
//    s'appliquent qu'à la validation. Fermer par le voile ou par Échap
//    annule les modifications non validées — sans quoi l'utilisateur n'aurait
//    aucun moyen de revenir en arrière. Seul le compteur du bouton de pied
//    est mis à jour en direct, via un appel « compte seul ».
import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/BottomSheet';
import { SearchFacets, type FacetRefs } from '@/components/search/SearchFacets';
import { useSearch } from '@/components/search/SearchProvider';
import {
  countActiveCriteria,
  criteriaToQueryString,
  resetFacets,
  type SearchCriteria,
} from '@/lib/search-params';

const COUNT_DEBOUNCE_MS = 300;

export function SearchFiltersPanel({ refs }: { refs: FacetRefs }) {
  const { criteria, update, panelOpen, setPanelOpen } = useSearch();

  // Brouillon du tiroir : initialisé depuis les critères appliqués, et
  // resynchronisé à chaque ouverture.
  const [draft, setDraft] = useState<SearchCriteria>(criteria);
  const [draftCounts, setDraftCounts] = useState<{ total: number; authorTotal: number } | null>(null);
  // `panelOpen` peut être vrai sur desktop (arrivée par `?panel=1` depuis
  // l'en-tête), où aucun tiroir n'est visible. <BottomSheet> se referme de
  // lui-même au-dessus de son point de bascule — c'est là qu'est gardé le
  // verrou de défilement, il ne doit pas rester posé sur une page sans tiroir.
  // On ne suit ici que ce dont dépend le brouillon.
  const [wide, setWide] = useState(false);
  const drawerOpen = panelOpen && !wide;

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (drawerOpen) setDraft(criteria);
    // On ne resynchronise qu'à l'ouverture : pendant l'édition, le brouillon
    // ne doit pas être écrasé par les critères appliqués.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerOpen]);

  // Compteur du bouton de pied : requête « compte seul », dernière réponse
  // seule appliquée (la précédente est annulée).
  const draftKey = criteriaToQueryString(draft);
  useEffect(() => {
    if (!drawerOpen) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/recherche/compte?${draftKey}`, { signal: controller.signal });
        if (!res.ok) return;
        const counts = (await res.json()) as { total: number; authorTotal: number };
        setDraftCounts(counts);
      } catch {
        // Requête annulée ou réseau indisponible : le bouton garde son
        // libellé générique plutôt qu'un nombre faux.
        setDraftCounts(null);
      }
    }, COUNT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [draftKey, drawerOpen]);

  const appliedCount = countActiveCriteria(criteria);
  const draftCount = countActiveCriteria(draft);

  return (
    <>
      {/* ── Colonne persistante (≥ 1024 px) ── */}
      <aside className="search-facets-column hidden lg:block w-[318px] shrink-0 border-r border-outline-variant/50 bg-surface-container-low/40">
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant/50">
          <span className="flex items-center gap-2 text-primary font-semibold text-[14px]">
            <span className="material-symbols-outlined text-[19px]">tune</span>
            Critères
            <CountBadge value={appliedCount} />
          </span>
          <button
            type="button"
            onClick={() => update(resetFacets(criteria))}
            disabled={appliedCount === 0}
            className="font-label-md text-[12px] uppercase tracking-wider text-secondary hover:text-primary transition-colors disabled:opacity-40"
          >
            Réinitialiser
          </button>
        </div>
        <SearchFacets value={criteria} onChange={update} refs={refs} layout="column" />
      </aside>

      {/* ── Tiroir (< 1024 px) ──
          Voile, translation, verrou de défilement, Échap et piège à focus sont
          portés par <BottomSheet>, commun avec le sommaire de la fiche
          recette. */}
      <BottomSheet
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        breakpoint="lg"
        label="Critères de recherche"
        sheetClassName="h-[88%]"
      >
          <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/60 shrink-0">
            <h2 className="font-headline-md text-[19px] text-primary">
              Filtres
              {draftCount > 0 && <CountBadge value={draftCount} className="ml-2" />}
            </h2>
            <button
              type="button"
              onClick={() => setDraft(resetFacets(draft))}
              disabled={draftCount === 0}
              className="font-label-md text-[11.5px] uppercase tracking-wider text-secondary disabled:opacity-40"
            >
              Réinitialiser
            </button>
          </div>

          <div className="flex-1 overflow-y-auto hide-sb px-5">
            <SearchFacets value={draft} onChange={(next) => setDraft(next)} refs={refs} layout="sheet" />
            <div className="h-4" />
          </div>

          {/* Pied fixe. La marge basse dégage la barre de navigation mobile
              (hauteur déclarée une fois, cf. `--mobile-nav-h`). */}
          <div className="px-5 py-4 pb-[calc(1rem+var(--mobile-nav-h))] border-t border-outline-variant/60 bg-surface-container-low shrink-0">
            <button
              type="button"
              onClick={() => {
                update(draft);
                setPanelOpen(false);
              }}
              className="w-full bg-primary text-on-primary py-3.5 rounded-full font-label-md text-[12.5px] uppercase tracking-[0.18em] active:scale-[0.98] transition-transform"
            >
              {resultsButtonLabel(draftCounts, draft)}
            </button>
          </div>
      </BottomSheet>
    </>
  );
}

// Libellé du bouton de validation — reflète la portée choisie dans le
// brouillon (Recettes / Pâtissiers / les deux), pas seulement les recettes.
function resultsButtonLabel(
  counts: { total: number; authorTotal: number } | null,
  draft: SearchCriteria,
): string {
  if (counts === null) return 'Voir les résultats';
  const { total, authorTotal } = counts;
  if (draft.includeRecipes && draft.includeAuthors) {
    const sum = total + authorTotal;
    return sum === 0 ? 'Voir les résultats' : `Voir les ${sum} résultat${sum > 1 ? 's' : ''}`;
  }
  if (draft.includeAuthors) {
    return authorTotal === 0
      ? 'Voir les résultats'
      : `Voir les ${authorTotal} pâtissier${authorTotal > 1 ? 's' : ''}`;
  }
  return total === 0 ? 'Voir les résultats' : `Voir les ${total} recette${total > 1 ? 's' : ''}`;
}

function CountBadge({ value, className = '' }: { value: number; className?: string }) {
  // Masquée à zéro : on n'affiche jamais « 0 ».
  if (value <= 0) return null;
  return (
    <span
      className={`min-w-[19px] h-[19px] px-1 rounded-full bg-primary text-on-primary text-[10.5px] font-bold inline-flex items-center justify-center ${className}`}
    >
      {value}
    </span>
  );
}
