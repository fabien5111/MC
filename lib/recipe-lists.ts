// Listes de recettes (JEP-376) — logique pure, importable côté client.
//
// Modèle « playlist » : le membre range lui-même une recette dans une liste.
// Trois sortes de listes :
//  - « Favoris » : liste VIRTUELLE adossée à la table `favorites`, inchangée
//    (cœur, notification nominative à l'auteur, portée du carnet). Elle n'a
//    aucune ligne dans `recipe_lists` ;
//  - « CAP » : liste système (une par membre, créée au premier ajout), droit
//    `carnet_cap` (plan Pro). Elle alimente la rubrique « Carnet CAP » ;
//  - listes personnelles : créées, renommées, réordonnées, supprimées par le
//    membre, droit `listes_recettes` (plan Plus et au-dessus, plafond de la
//    grille).
//
// Tables `recipe_lists` / `recipe_list_items` : lecture par le propriétaire
// (RLS), AUCUNE policy d'écriture — seules les routes `/api/listes/*` écrivent,
// avec la clé service_role, après avoir vérifié le droit (la RLS ne connaît pas
// les formules).
//
// Rétrogradation : rien n'est supprimé. Sans le droit, on peut encore RETIRER
// une recette d'une liste et supprimer une liste personnelle ; ajouter, créer
// et renommer sont refusés.

export const LISTE_KIND_CAP = 'cap';
export const LISTE_KIND_PERSO = 'perso';
export type ListeKind = typeof LISTE_KIND_CAP | typeof LISTE_KIND_PERSO;

export const NOM_LISTE_CAP = 'CAP';
export const NOM_LISTE_MAX = 40;

// Droits de la grille d'abonnement.
export const DROIT_LISTE_CAP = 'carnet_cap';
export const DROIT_LISTES_PERSO = 'listes_recettes';

// Plafond technique d'une liste : celui de l'ancienne rubrique CAP, la grille
// du carnet étant entièrement chargée côté serveur.
export const LISTE_MAX_RECETTES = 300;

export type ListeResume = {
  id: string;
  nom: string;
  kind: ListeKind;
  position: number;
  nombre: number;
};

/**
 * Recettes de la liste que la lecture n'a pas rendues : supprimées, dépubliées,
 * rendues privées, auteur désactivé — la RLS les masque, la ligne de liste
 * reste (elle réapparaît si la recette redevient lisible).
 */
export function nombreIndisponibles(idsListe: string[], idsLus: Iterable<string>): number {
  const lus = new Set(idsLus);
  return idsListe.filter((id) => !lus.has(id)).length;
}

/** Nom saisi, espaces resserrés ; `null` s'il est vide ou trop long. */
export function nomListeValide(brut: unknown): string | null {
  if (typeof brut !== 'string') return null;
  const nom = brut.replace(/\s+/g, ' ').trim();
  if (!nom || nom.length > NOM_LISTE_MAX) return null;
  return nom;
}

/** Message d'erreur du nom saisi, `null` s'il est valable. */
export function erreurNomListe(brut: string): string | null {
  const nom = brut.replace(/\s+/g, ' ').trim();
  if (!nom) return 'Donnez un nom à la liste.';
  if (nom.length > NOM_LISTE_MAX) return `Le nom ne doit pas dépasser ${NOM_LISTE_MAX} caractères.`;
  return null;
}

/** Droit à vérifier pour AJOUTER une recette à une liste de cette sorte. */
export function droitDeListe(kind: ListeKind): string {
  return kind === LISTE_KIND_CAP ? DROIT_LISTE_CAP : DROIT_LISTES_PERSO;
}

/**
 * Ordre d'affichage : la liste CAP d'abord, puis les listes perso par ordre
 * alphabétique (arbitrage du 26/10/2026), sans tenir compte de la casse ni des
 * accents (« À tester » avant « Noël »), nombres dans l'ordre naturel
 * (« Liste 2 » avant « Liste 10 »). La position ne départage que deux noms
 * identiques.
 */
export function trierListes<T extends { kind: ListeKind; position: number; nom: string }>(listes: T[]): T[] {
  return [...listes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === LISTE_KIND_CAP ? -1 : 1;
    return a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base', numeric: true }) || a.position - b.position;
  });
}

/**
 * Nouvelles positions après le déplacement d'une liste personnelle d'un cran
 * vers le haut ou le bas : renumérotation 0..n-1 de toutes les listes perso,
 * pour qu'un ordre abîmé (positions égales) se répare au premier déplacement.
 * `null` si le déplacement est impossible (déjà en tête ou en fin, liste inconnue).
 */
export function deplacerListe(
  listes: { id: string; position: number; nom: string }[],
  id: string,
  sens: 'haut' | 'bas',
): { id: string; position: number }[] | null {
  const ordre = [...listes].sort((a, b) => a.position - b.position || a.nom.localeCompare(b.nom, 'fr'));
  const i = ordre.findIndex((l) => l.id === id);
  const j = sens === 'haut' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ordre.length) return null;
  [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
  return ordre.map((l, k) => ({ id: l.id, position: k }));
}

/** Plafond de listes perso atteint ? `limite` `null` = illimité. */
export function plafondListesAtteint(nombre: number, limite: number | null): boolean {
  return limite != null && nombre >= limite;
}
