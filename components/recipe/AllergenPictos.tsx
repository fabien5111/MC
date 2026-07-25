// Ligne « Allergènes : » + pictos, réutilisable sur les cartes et la fiche
// recette. Server Component : charge la table de référence (mémoïsée par
// requête) et rapproche chaque nom d'allergène de son picto (insensible à la
// casse et aux accents). Sans correspondance de picto, l'allergène s'affiche en
// texte. Chaque picto porte le libellé de l'allergène en infobulle (title).
import { getAllergensWithPicto } from '@/lib/recipes';
import { matchAllergenPictos } from '@/lib/recipe-view';
import { AllergenPictosView } from '@/components/recipe/AllergenPictosView';

export async function AllergenPictos({
  names,
  className = '',
  iconClassName = 'w-6 h-6',
}: {
  names: string[];
  className?: string;
  iconClassName?: string;
}) {
  if (!names.length) return null;
  const refs = await getAllergensWithPicto();
  const items = matchAllergenPictos(names, refs);
  return <AllergenPictosView items={items} className={className} iconClassName={iconClassName} />;
}
