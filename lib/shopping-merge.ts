// Regroupement d'un article dans une liste de courses (JEP-249) — fonctions
// pures, partagées par la saisie manuelle (ShoppingItems) et la fusion de deux
// listes (CuisineContent). Un article rejoint une ligne existante quand son
// nom désigne le MÊME ingrédient (`ingredientKey` : « jaune d'œuf » = « Jaunes
// d'oeufs ») ET que son unité est identique — additionner des grammes et des
// unités n'aurait pas de sens, une unité différente reste donc une ligne à part.
import { ingredientKey } from '@/lib/ingredient-name';
import { convertQty, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';

type Ligne = { name: string | null; unit: string | null };

const unitKey = (u: string | null | undefined) => (u || '').trim().toLowerCase();

// Clé de regroupement d'un article : ingrédient + unité.
export function shoppingKey(name: string | null | undefined, unit: string | null | undefined): string {
  return ingredientKey(name) + '|' + unitKey(unit);
}

// Première ligne de la liste qui est le même ingrédient dans la même unité.
export function findSameItem<T extends Ligne>(items: T[], name: string, unit: string | null): T | undefined {
  const key = shoppingKey(name, unit);
  if (key.startsWith('|')) return undefined; // nom sans contenu : rien à regrouper
  return items.find((i) => shoppingKey(i.name, i.unit) === key);
}

// Somme de deux quantités saisies en texte : numériques → additionnées (virgule
// ou point décimal), sinon réunies par « + » plutôt que de perdre l'une d'elles.
export function sumQuantities(a: string | null, b: string | null): string | null {
  const x = parseFloat(String(a || '').replace(',', '.'));
  const y = parseFloat(String(b || '').replace(',', '.'));
  if (!isNaN(x) && !isNaN(y)) return String(+(x + y).toFixed(2));
  return [a, b].filter(Boolean).join(' + ') || null;
}

// Commentaires réunis par « ; », sans répéter le même.
export function joinComments(a: string | null, b: string | null): string | null {
  if (!b || b === a) return a;
  return a ? a + ' ; ' + b : b;
}

// ── Fusion manuelle de deux lignes (picto « fusionner ») ─────────────────────
// Deux lignes se fusionnent quand elles sont dans la MÊME unité (comportement
// d'origine, au choix de l'utilisateur), ou quand c'est le MÊME ingrédient dans
// des unités que la table de conversions relie — « 5 unité(s) » de jaune d'œuf
// et « 100 g » du même jaune (1 jaune = 20 g). La ligne cliquée garde son
// unité, l'autre y est convertie. Jamais d'automatisme : c'est un geste explicite,
// et une conversion est une équivalence moyenne, montrée avant validation.
type LigneFusion = { name: string | null; unit: string | null; quantity: string | null; ref_id: number | null };

const parseNum = (q: string | null | undefined): number | null => {
  const n = parseFloat(String(q ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const fmt = (n: number) => String(+n.toFixed(2));

// Quantité de `source` exprimée dans l'unité de `target` — `null` si ce n'est
// pas le même ingrédient, si une quantité n'est pas un nombre, ou si aucune
// conversion ne relie les deux unités.
function convertedQuantity(target: LigneFusion, source: LigneFusion, conversions: ConversionRef[], units: UnitRef[]): number | null {
  if (!target.unit || !source.unit) return null;
  const sameRef = target.ref_id != null && target.ref_id === source.ref_id;
  if (!sameRef && ingredientKey(target.name) !== ingredientKey(source.name)) return null;
  const b = parseNum(source.quantity);
  if (b == null || parseNum(target.quantity) == null) return null;
  return convertQty(conversions, units, target.ref_id ?? source.ref_id, source.unit, b, target.unit);
}

// Lignes proposées à la fusion avec `target`.
export function mergeCandidates<T extends LigneFusion & { id: number }>(
  items: T[],
  target: T,
  conversions: ConversionRef[],
  units: UnitRef[],
): T[] {
  return items.filter(
    (o) =>
      o.id !== target.id &&
      (unitKey(o.unit) === unitKey(target.unit) || convertedQuantity(target, o, conversions, units) != null),
  );
}

// Résultat de la fusion de `source` dans `target`. `converted` est la quantité
// de `source` dans l'unité de `target` quand les unités diffèrent (sert à
// l'aperçu), `null` sinon.
export function mergeResult(
  target: LigneFusion,
  source: LigneFusion,
  conversions: ConversionRef[],
  units: UnitRef[],
): { quantity: string | null; converted: number | null } {
  if (unitKey(target.unit) !== unitKey(source.unit)) {
    const converted = convertedQuantity(target, source, conversions, units);
    const a = parseNum(target.quantity);
    if (converted != null && a != null) return { quantity: fmt(a + converted), converted };
  }
  return { quantity: sumQuantities(target.quantity, source.quantity), converted: null };
}

// Ligne d'aperçu pour l'utilisateur, ou `null` quand les unités sont les mêmes.
export function mergePreview(
  target: LigneFusion,
  source: LigneFusion,
  conversions: ConversionRef[],
  units: UnitRef[],
): string | null {
  const { quantity, converted } = mergeResult(target, source, conversions, units);
  if (converted == null) return null;
  return `${target.quantity} ${target.unit} + ${source.quantity} ${source.unit} (≈ ${fmt(converted)} ${target.unit}) = ${quantity} ${target.unit}`;
}
