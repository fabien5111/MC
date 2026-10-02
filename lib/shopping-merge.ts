// Regroupement d'un article dans une liste de courses (JEP-249) — fonctions
// pures, partagées par la saisie manuelle (ShoppingItems) et la fusion de deux
// listes (CuisineContent). Un article rejoint une ligne existante quand son
// nom désigne le MÊME ingrédient (`ingredientKey` : « jaune d'œuf » = « Jaunes
// d'oeufs ») ET que son unité est identique — additionner des grammes et des
// unités n'aurait pas de sens, une unité différente reste donc une ligne à part.
import { ingredientKey } from '@/lib/ingredient-name';

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
