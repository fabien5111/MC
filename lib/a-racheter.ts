// Liste de courses « À racheter » (JEP-379) — logique pure.
//
// Une liste système, une par membre (`shopping_lists.kind = 'a_racheter'`),
// alimentée depuis le mode Pâtisser d'une fournée : « je finis mon paquet de
// pépites, il faut en racheter ». Nom seul, sans quantité (arbitrage du
// 28/10/2026) : on rachète un paquet, pas les 40 g de la recette.
//
// Module sans accès base : importé par l'écran des courses (client) comme par
// la route d'ajout (serveur). Données : `lib/a-racheter-data.ts`.
import { ingredientKey } from '@/lib/ingredient-name';

/** Clé du droit d'abonnement (plans Plus et Pro). Absente de la grille = refus. */
export const DROIT_A_RACHETER = 'liste_a_racheter';

/** Valeur de `shopping_lists.kind` qui marque la liste « À racheter ». */
export const KIND_A_RACHETER = 'a_racheter';

/** Nom affiché de la liste (fixe : elle ne se renomme pas). */
export const NOM_A_RACHETER = 'À racheter';

/** Longueur maximale d'un nom d'article envoyé à la route. */
export const A_RACHETER_NOM_MAX = 120;

/**
 * Vrai pour la liste « À racheter ». Lu sur une ligne lue en `select('*')` :
 * avant la migration, `kind` n'existe pas et aucune liste n'est la liste
 * système — tout se comporte comme avant.
 */
export function estListeARacheter(l: { kind?: string | null } | null | undefined): boolean {
  return l?.kind === KIND_A_RACHETER;
}

/**
 * Article déjà présent dans la liste pour ce nom : même ingrédient au sens de
 * `ingredientKey` (singulier/pluriel, casse, accents, ligatures), ou même
 * entrée du référentiel. Le premier non barré l'emporte sur un barré.
 */
export function articleExistant<T extends { name: string; ref_id: number | null; checked: boolean }>(
  items: T[],
  nom: string,
  refId: number | null,
): T | null {
  const cle = ingredientKey(nom);
  const memes = items.filter((i) => (refId != null && i.ref_id === refId) || (cle !== '' && ingredientKey(i.name) === cle));
  return memes.find((i) => !i.checked) ?? memes[0] ?? null;
}

/** Ce que l'ajout d'un ingrédient doit faire, d'après le contenu actuel. */
export type DecisionAjout =
  | { action: 'creer' }
  // Déjà à racheter (non barré) : rien à écrire, un message le dit.
  | { action: 'deja'; id: number }
  // Présent mais barré (déjà racheté) : on le remet à racheter plutôt que
  // d'ouvrir une seconde ligne du même ingrédient.
  | { action: 'decocher'; id: number };

export function decisionAjout(
  items: { id: number; name: string; ref_id: number | null; checked: boolean }[],
  nom: string,
  refId: number | null,
): DecisionAjout {
  const hit = articleExistant(items, nom, refId);
  if (!hit) return { action: 'creer' };
  return hit.checked ? { action: 'decocher', id: hit.id } : { action: 'deja', id: hit.id };
}

/** Message rendu au membre après l'ajout. */
export function messageAjout(action: DecisionAjout['action'], nom: string): string {
  if (action === 'deja') return `« ${nom} » est déjà dans la liste « ${NOM_A_RACHETER} ».`;
  if (action === 'decocher') return `« ${nom} » est de nouveau à racheter.`;
  return `« ${nom} » ajouté à la liste « ${NOM_A_RACHETER} ».`;
}

/**
 * Ordre d'affichage d'une liste « À racheter » : articles non barrés en tête,
 * puis par nom. Les autres listes gardent leur ordre alphabétique seul.
 */
export function trierARacheter<T extends { name: string | null; checked: boolean }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => Number(a.checked) - Number(b.checked) || (a.name || '').localeCompare(b.name || '', 'fr'),
  );
}

/**
 * Listes de courses telles que l'écran les présente : « À racheter » en tête,
 * seulement si elle contient au moins un article, et jamais archivée (une
 * liste dont tout est barré y reste : on n'en supprime pas les articles sans
 * l'avoir demandé). Les autres gardent leur ordre et leur archivage.
 */
export function rangerListes<L extends { kind?: string | null; shopping_list_items?: { checked: boolean }[] | null }>(
  listes: L[],
): { aRacheter: L | null; actives: L[]; archivees: L[] } {
  const systeme = listes.find(estListeARacheter) ?? null;
  const autres = listes.filter((l) => !estListeARacheter(l));
  const actives = autres.filter((l) => {
    const items = l.shopping_list_items || [];
    return items.length === 0 || items.some((i) => !i.checked);
  });
  const archivees = autres.filter((l) => {
    const items = l.shopping_list_items || [];
    return items.length > 0 && items.every((i) => i.checked);
  });
  const aRacheter = systeme && (systeme.shopping_list_items || []).length > 0 ? systeme : null;
  return { aRacheter, actives, archivees };
}
