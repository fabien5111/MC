// État vide de la recherche avancée (Server Component).
//
// Constater l'échec ne suffit pas : l'écran propose de relâcher un critère
// précis, avec le gain chiffré. Les recomptes sont faits côté serveur, en
// « compte seul », et uniquement lorsque le total est nul (cf.
// `relaxationSuggestions`) — jamais sur le chemin nominal.
//
// Si aucun recompte n'aboutit (aucun critère assouplissable, ou tous les
// assouplissements laissent zéro), l'écran se dégrade proprement : le message
// et le lien de réinitialisation restent, les suggestions disparaissent.
import Link from 'next/link';
import type { Relaxation } from '@/lib/search';
import { criteriaToQueryString, resetFacets, type SearchCriteria } from '@/lib/search-params';

export function SearchEmptyState({
  criteria,
  relaxations,
}: {
  criteria: SearchCriteria;
  relaxations: Relaxation[];
}) {
  const resetQs = criteriaToQueryString(resetFacets(criteria));

  return (
    <div className="max-w-[480px] mx-auto py-12 flex flex-col items-center text-center">
      <span className="material-symbols-outlined text-[56px] text-outline-variant mb-5">search_off</span>
      <h2 className="font-headline-md text-[22px] text-primary mb-2.5 leading-snug">
        Aucune recette ne réunit tous ces critères
      </h2>
      <p className="text-[13.5px] text-on-surface-variant leading-relaxed mb-7">
        {relaxations.length
          ? 'Vos filtres sont peut-être un peu stricts. Essayez d’en assouplir un :'
          : 'Essayez un autre terme, ou retirez quelques critères.'}
      </p>

      {relaxations.length > 0 && (
        <div className="flex flex-col gap-2.5 w-full">
          {relaxations.map((r) => (
            <Link
              key={r.id}
              href={r.params ? `/recherche?${r.params}` : '/recherche'}
              className="flex items-center justify-between gap-3 w-full bg-surface-container-low border border-outline-variant rounded-lg px-4 py-3 text-left hover:border-primary transition-colors"
            >
              <span className="text-[13px]">
                {r.action}{' '}
                <span
                  className={
                    r.targetKind === 'inc'
                      ? 'inline-flex items-center border rounded-full bg-ingredient-include text-ingredient-include-text border-ingredient-include-border text-[11.5px] px-2 py-0.5'
                      : r.targetKind === 'exc'
                        ? 'inline-flex items-center border rounded-full bg-ingredient-exclude text-ingredient-exclude-text border-ingredient-exclude-border line-through decoration-[1.5px] text-[11.5px] px-2 py-0.5'
                        : 'font-semibold'
                  }
                >
                  {r.target}
                </span>
              </span>
              <span className="text-[12px] font-semibold text-secondary shrink-0">+{r.gain}</span>
            </Link>
          ))}
        </div>
      )}

      <Link
        href={resetQs ? `/recherche?${resetQs}` : '/recherche'}
        className="mt-7 font-label-md text-[12px] uppercase tracking-wider text-primary border-b border-primary pb-0.5"
      >
        Tout réinitialiser
      </Link>
    </div>
  );
}
