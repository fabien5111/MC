// Les quatre destinations du produit — source unique des deux chromes
// (`components/Header.tsx` au bureau, `components/MobileNav.tsx` sur mobile).
//
// Une seule table, parce que les deux barres doivent proposer exactement les
// mêmes destinations : c'est le sens de la refonte de navigation. Les écrire
// deux fois, c'est se garantir qu'un jour l'une aura une entrée que l'autre
// n'a pas.
//
// Ce qui n'est **pas** une destination :
//  - « Créer » est une **action** (bouton plein dans l'en-tête, jamais une
//    fente de menu) ;
//  - « Compte » est un tiroir (avatar au bureau, cinquième fente mobile).

// Point de bascule entre les deux chromes. Au-dessus, l'en-tête porte les
// destinations ; en dessous, c'est la barre basse. Écrit ici sous ses deux
// formes (classe Tailwind et media query) pour que rien ne diverge — même
// principe que `BREAKPOINTS` dans components/BottomSheet.tsx, et même valeur
// que le tiroir de la recherche avancée : un seul seuil « bureau » dans tout
// le produit.
export const CHROME = {
  // Masque l'élément en dessous du seuil (barre basse : `lg:hidden`).
  desktopOnly: 'hidden lg:flex',
  mobileOnly: 'lg:hidden',
  query: '(min-width: 1024px)',
} as const;

export type NavKey = 'accueil' | 'explorer' | 'carnet' | 'cuisine';

export type Destination = {
  key: NavKey;
  href: string;
  // Libellé de l'en-tête bureau.
  label: string;
  // Libellé de la barre basse : « Mon carnet » n'y tient pas à cinq fentes.
  shortLabel: string;
  // Picto Material Symbols, ou `null` pour « En cuisine » qui utilise le
  // glyphe calendrier-horloge maison (cf. components/PlanningIcon.tsx).
  icon: string | null;
};

export const DESTINATIONS: readonly Destination[] = [
  { key: 'accueil', href: '/', label: 'Accueil', shortLabel: 'Accueil', icon: 'home' },
  { key: 'explorer', href: '/recherche', label: 'Explorer', shortLabel: 'Explorer', icon: 'travel_explore' },
  { key: 'carnet', href: '/carnet', label: 'Mon carnet', shortLabel: 'Carnet', icon: 'menu_book' },
  { key: 'cuisine', href: '/en-cuisine', label: 'En cuisine', shortLabel: 'En cuisine', icon: null },
];

// Destination à marquer comme courante pour un chemin donné.
//
// Sert de repli aux pages qui ne passent pas `current` explicitement, et
// rattache les écrans satellites à la destination dont ils dépendent : une
// liste de courses appartient à « En cuisine », une relecture d'import au
// « Carnet ». Les écrans sans destination (fiche recette, éditeur, réglages)
// renvoient `undefined` — aucune entrée n'est alors soulignée, ce qui est la
// bonne réponse : ils ne sont dans aucune des quatre.
export function navKeyForPath(pathname: string): NavKey | undefined {
  if (pathname === '/') return 'accueil';
  if (pathname.startsWith('/recherche')) return 'explorer';
  if (pathname.startsWith('/carnet') || pathname.startsWith('/importer') || pathname.startsWith('/relecture'))
    return 'carnet';
  if (
    pathname.startsWith('/en-cuisine') ||
    pathname.startsWith('/courses') ||
    pathname.startsWith('/execution')
  )
    return 'cuisine';
  return undefined;
}
