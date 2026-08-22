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

// Abrège « unité(s) » en « un » pour l'affichage (texte de conversion,
// unité affichée en mode Cuisiner…) — un raccourci d'affichage uniquement :
// n'affecte ni l'unité stockée en base, ni les listes déroulantes qui
// utilisent le même nom complet ailleurs dans l'application.
export const shortUnitLbl = (name: string): string => (name === 'unité(s)' ? 'un' : name);

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
//
// Une ligne « 1 pièce = 50 g » sert dans les deux sens : une recette qui
// saisit l'ingrédient en pièces affiche l'équivalent en grammes, et une
// recette qui le saisit déjà en grammes affiche l'équivalent en pièces —
// sans ça, la conversion resterait invisible dès que l'auteur a choisi
// l'unité qui est la cible (et non le départ) de la ligne de référence.
export function ingredientConversionText(
  conversions: ConversionRef[],
  units: UnitRef[],
  refId: number | null | undefined,
  unitText: string | null | undefined,
  quantity: string | number | null | undefined,
): string | null {
  const qty = parseQty(quantity);
  if (!refId || !unitText || qty == null || qty <= 0) return null;
  const key = normUnit(unitText);
  const unit = units.find((u) => normUnit(u.name) === key);
  if (!unit) return null;

  const forward = conversions.find((c) => c.ingredient_ref_id === refId && c.from_unit_id === unit.id);
  if (forward && forward.from_quantity) {
    const toUnit = units.find((u) => u.id === forward.to_unit_id);
    const value = toUnit ? (qty * forward.to_quantity) / forward.from_quantity : null;
    if (toUnit && value != null && isFinite(value) && value > 0) return `≈ ${fmtNum(value)} ${shortUnitLbl(toUnit.name)}`;
  }

  const reverse = conversions.find((c) => c.ingredient_ref_id === refId && c.to_unit_id === unit.id);
  if (reverse && reverse.to_quantity) {
    const fromUnit = units.find((u) => u.id === reverse.from_unit_id);
    const value = fromUnit ? (qty * reverse.from_quantity) / reverse.to_quantity : null;
    if (fromUnit && value != null && isFinite(value) && value > 0) return `≈ ${fmtNum(value)} ${shortUnitLbl(fromUnit.name)}`;
  }

  return null;
}

// Convertit une quantité d'une unité vers une autre pour un ingrédient
// référencé — même table que `ingredientConversionText`, mais entre deux
// unités précises (celles des deux lignes à fusionner) plutôt que « la
// première conversion disponible pour l'affichage ». `null` si l'ingrédient
// n'est pas référencé ou si aucune conversion ne relie ces deux unités —
// deux lignes qu'on ne peut pas convertir l'une vers l'autre ne doivent
// jamais se retrouver cumulées dans un total inventé.
export function convertQty(
  conversions: ConversionRef[],
  units: UnitRef[],
  refId: number | null | undefined,
  fromUnitText: string | null | undefined,
  qty: number,
  toUnitText: string | null | undefined,
): number | null {
  if (!refId || !fromUnitText || !toUnitText || !isFinite(qty)) return null;
  if (normUnit(fromUnitText) === normUnit(toUnitText)) return qty;
  const fromUnit = units.find((u) => normUnit(u.name) === normUnit(fromUnitText));
  const toUnit = units.find((u) => normUnit(u.name) === normUnit(toUnitText));
  if (!fromUnit || !toUnit) return null;

  const forward = conversions.find((c) => c.ingredient_ref_id === refId && c.from_unit_id === fromUnit.id && c.to_unit_id === toUnit.id);
  if (forward && forward.from_quantity) return (qty * forward.to_quantity) / forward.from_quantity;

  const reverse = conversions.find((c) => c.ingredient_ref_id === refId && c.to_unit_id === fromUnit.id && c.from_unit_id === toUnit.id);
  if (reverse && reverse.to_quantity) return (qty * reverse.from_quantity) / reverse.to_quantity;

  return null;
}
