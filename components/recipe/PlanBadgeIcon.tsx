// Badge « Planifier cette recette » des cartes recette (RecipeCardLayout,
// SuggestionCard, carnet, Recette de la semaine).
//
// Ce n'est plus qu'un cadrage du picto partagé (`components/PlanningIcon.tsx`),
// gardé comme composant nommé parce qu'il fixe deux choses propres à cet
// emplacement : la couleur `primary` et le disque d'horloge assorti à la
// pastille blanche translucide qui l'accueille (`bg-white/90`).
import { PlanningIcon, DISC } from '@/components/PlanningIcon';

export function PlanBadgeIcon() {
  return <PlanningIcon discFill={DISC.surface} className="text-primary" />;
}
