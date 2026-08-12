// Colonne latérale « recherche + Recettes suggérées + pub », partagée entre
// la fiche recette (consultation) et l'éditeur (création/modification) —
// porté de l'aside en dur de app/recette/[id]/page.tsx.
import { SuggestionCard } from '@/components/recipe/SuggestionCard';
import { PartnerSlot } from '@/components/PartnerSlot';
import type { AdsBySlot } from '@/lib/ads-config';
import type { RecipeCard as RecipeCardData } from '@/lib/recipes';

export function SuggestionsSidebar({
  suggestions,
  favIds,
  ads,
  showPlan = true,
}: {
  suggestions: RecipeCardData[];
  favIds: Set<string>;
  ads: AdsBySlot;
  showPlan?: boolean;
}) {
  return (
    <aside className="no-print lg:col-span-4 flex flex-col gap-12">
      <div className="relative">
        <input
          className="w-full border-0 border-b border-outline py-4 px-0 bg-transparent focus:ring-0 focus:border-primary font-body-md text-body-md placeholder:text-outline/60"
          placeholder="Rechercher une recette, un ingrédient..."
          type="text"
        />
        <span className="material-symbols-outlined absolute right-0 top-4 text-outline">search</span>
      </div>
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-8">
          <h3 className="font-label-md text-label-md uppercase tracking-widest text-secondary">Recettes suggérées</h3>
          <SuggestionCard recipe={suggestions[0]} isFav={favIds.has(suggestions[0].id)} showPlan={showPlan} />
          <PartnerSlot slot="sidebar" ads={ads} />
          {suggestions[1] && (
            <SuggestionCard recipe={suggestions[1]} isFav={favIds.has(suggestions[1].id)} showPlan={showPlan} />
          )}
        </div>
      )}
    </aside>
  );
}
