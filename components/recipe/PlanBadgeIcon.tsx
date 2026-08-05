// Picto « Planifier » composite : calendrier + pastille horloge, pour
// rappeler le côté temporel de la planification. Utilisé dans le badge rond
// (w-9 h-9, position relative) des cartes recette — RecipeCardLayout,
// SuggestionCard, ProfileTabs.
export function PlanBadgeIcon() {
  return (
    <>
      <span className="material-symbols-outlined text-[20px] text-primary">calendar_today</span>
      <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary ring-2 ring-white flex items-center justify-center">
        <span className="material-symbols-outlined text-white text-[10px] leading-none">schedule</span>
      </span>
    </>
  );
}
