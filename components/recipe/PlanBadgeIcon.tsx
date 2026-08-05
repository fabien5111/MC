// Picto « Planifier cette recette » (variante M2c) : calendrier + cadran
// d'horloge en un seul glyphe SVG, pour rappeler le côté temporel de la
// planification. Remplace calendar_today/event_available. Utilisé dans le
// badge rond (w-9 h-9, position relative) des cartes recette —
// RecipeCardLayout, SuggestionCard, ProfileTabs, app/page.tsx (Recette du Mois).
export function PlanBadgeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      className="text-primary"
    >
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="8" y1="2.5" x2="8" y2="5.5" />
      <line x1="16" y1="2.5" x2="16" y2="5.5" />
      <circle cx="16" cy="16" r="5" fill="#fff8f7" strokeWidth="2.1" />
      <path d="M16 13.3v2.7l1.8 1.1" />
    </svg>
  );
}
