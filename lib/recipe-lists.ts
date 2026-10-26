// Listes de recettes (JEP-376) — logique pure, importable côté client.
//
// Modèle « playlist » : le membre range lui-même une recette dans une liste.
// Lot 1 : la seule liste réelle est la liste système « CAP » (droit
// `carnet_cap`), qui remplace l'ancienne rubrique déduite des tags « [CAP] … ».
// « Favoris » restera une liste virtuelle adossée à `favorites` (lot 2), les
// listes personnelles arrivent au lot 3.
//
// Tables `recipe_lists` / `recipe_list_items` : lecture par le propriétaire
// (RLS), AUCUNE policy d'écriture — seule la route `/api/listes/cap` écrit,
// avec la clé service_role, après avoir vérifié le droit (la RLS ne connaît pas
// les formules).

export const LISTE_KIND_CAP = 'cap';
export const LISTE_KIND_PERSO = 'perso';
export type ListeKind = typeof LISTE_KIND_CAP | typeof LISTE_KIND_PERSO;

export const NOM_LISTE_CAP = 'CAP';

// Plafond technique d'une liste : celui de l'ancienne rubrique, la grille du
// carnet étant entièrement chargée côté serveur.
export const LISTE_MAX_RECETTES = 300;

/**
 * Recettes de la liste que la lecture n'a pas rendues : supprimées, dépubliées,
 * rendues privées, auteur désactivé — la RLS les masque, la ligne de liste
 * reste (elle réapparaît si la recette redevient lisible).
 */
export function nombreIndisponibles(idsListe: string[], idsLus: Iterable<string>): number {
  const lus = new Set(idsLus);
  return idsListe.filter((id) => !lus.has(id)).length;
}
