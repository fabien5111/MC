// Colonne latérale « recherche + Recettes suggérées + pub », partagée entre
// la fiche recette (consultation) et l'éditeur (création/modification) —
// porté de l'aside en dur de app/recette/[id]/page.tsx.
import { SuggestionCard } from '@/components/recipe/SuggestionCard';
import type { RecipeCard as RecipeCardData } from '@/lib/recipes';

export function SuggestionsSidebar({
  suggestions,
  favIds,
}: {
  suggestions: RecipeCardData[];
  favIds: Set<string>;
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
          <SuggestionCard recipe={suggestions[0]} isFav={favIds.has(suggestions[0].id)} />
          <div className="bg-surface-container-highest p-8 text-center border border-outline-variant py-20 flex flex-col items-center justify-center gap-4">
            <span className="font-label-md text-[10px] tracking-widest text-outline">PUBLICITÉ</span>
            <p className="font-headline-md text-headline-md text-primary">Masterclass : L&apos;art du chocolat</p>
            <button className="mt-4 border border-primary px-6 py-2 font-label-md text-label-md text-primary hover:bg-primary hover:text-white transition-all">
              Découvrir
            </button>
          </div>
          {suggestions[1] && <SuggestionCard recipe={suggestions[1]} isFav={favIds.has(suggestions[1].id)} />}
        </div>
      )}
    </aside>
  );
}
