// Conversion d'unité d'un ingrédient référencé (ex. 1 œuf = 50 g), à partir de
// la table de référence `ingredient_conversions` (gérée dans Admin → Listes →
// « Conversions d'ingrédients »). Fonction pure — le chargement de la table
// est fait une fois par requête serveur (cf. lib/recipes.ts
// `getIngredientConversions`) puis réutilisé pour tous les ingrédients de
// l'écran, aussi bien côté serveur que dans les Client Components qui
// affichent des listes d'ingrédients (exécution, courses, éditeurs…).
import { fmtNum } from '@/lib/recipe-plan';

export type ConversionRef = {
  ingredient_ref_id: number;
  from_quantity: number;
  from_unit_id: number;
  to_quantity: number;
  to_unit_id: number;
};
export type UnitRef = { id: number; name: string };
export type IngredientRefOption = { id: number; name: string };

// Rapproche un nom d'ingrédient saisi à la main (liste de courses, éditeur de
// recette) de la table de référence par correspondance exacte de libellé
// (insensible à la casse) — pour retrouver un `ref_id` là où l'ingrédient n'en
// porte pas déjà un.
export function resolveIngredientRefId(name: string, refs: IngredientRefOption[]): number | null {
  const key = name.trim().toLowerCase();
  return refs.find((r) => r.name.trim().toLowerCase() === key)?.id ?? null;
}

const normUnit = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Quantité d'une ligne d'ingrédient, en nombre : accepte un texte fusionné
// non purement numérique (ex. « 1 + 2 », « 1 pincée ») en le rejetant plutôt
// qu'en n'en lisant que le premier nombre, ce qui donnerait une conversion
// silencieusement fausse.
function parseQty(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = v.trim();
  if (!/^\d+([.,]\d+)?$/.test(s)) return null;
  return parseFloat(s.replace(',', '.'));
}

// Texte de conversion à afficher à côté d'une ligne d'ingrédient (ex.
// « ≈ 100 g »), ou null si l'ingrédient n'est pas référencé, si son unité ne
// correspond à aucune conversion enregistrée pour cet ingrédient, ou si la
// quantité n'est pas un nombre exploitable.
export function ingredientConversionText(
  conversions: ConversionRef[],
  units: UnitRef[],
  refId: number | null | undefined,
  unitText: string | null | undefined,
  quantity: string | number | null | undefined,
): string | null {
  const qty = parseQty(quantity);
  if (!refId || !unitText || qty == null || qty <= 0) return null;
  const fromKey = normUnit(unitText);
  const fromUnit = units.find((u) => normUnit(u.name) === fromKey);
  if (!fromUnit) return null;
  const conv = conversions.find((c) => c.ingredient_ref_id === refId && c.from_unit_id === fromUnit.id);
  if (!conv || !conv.from_quantity) return null;
  const toUnit = units.find((u) => u.id === conv.to_unit_id);
  if (!toUnit) return null;
  const value = (qty * conv.to_quantity) / conv.from_quantity;
  if (!isFinite(value) || value <= 0) return null;
  return `≈ ${fmtNum(value)} ${toUnit.name}`;
}
