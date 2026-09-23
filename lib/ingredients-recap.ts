// Récapitulatif des ingrédients de l'éditeur de recette (CreerForm) et de la
// relecture d'un import (RelectureEditor) — fonctions pures, partagées par les
// deux écrans, qui en portaient chacun une copie.
//
// Deux niveaux de regroupement, à ne pas confondre :
// - la LIGNE fusionne les saisies identiques (nom + commentaire) de toutes les
//   étapes : le commentaire fait partie de la clé, sinon « crème liquide,
//   chaude » et « crème liquide, froide » (ou « chocolat noir 66 % » /
//   « chocolat noir 54 % » porté par le commentaire plutôt que le nom)
//   fusionneraient en une ligne sans usage réel dans la recette ;
// - le GROUPE réunit les lignes d'un même nom, commentaires ignorés, et porte
//   leur sous-total (JEP-248) — c'est la quantité à sortir du placard, qui
//   elle ne dépend pas de l'usage.
//
// Deux quantités d'un même ingrédient saisies dans des unités différentes
// (300 g d'œufs sur une étape, 1 unité sur une autre) sont converties vers
// l'unité de la première rencontrée grâce à la table de référence
// (`convertQty`). Sans conversion connue, la quantité minoritaire est ajoutée
// en toutes lettres plutôt que perdue — jamais cumulée dans un total inventé.
import { convertQty, resolveIngredientRefId, type ConversionRef, type IngredientRefOption, type UnitRef } from '@/lib/ingredient-conversions';

// Une saisie d'ingrédient d'une étape, quel que soit l'écran d'origine.
export type RecapInput = { name: string; qty: string; unit: string; note: string; stepIndex: number };

export type RecapLine = { name: string; qty: string; unit: string; note: string; stepIndices: number[] };

// `subtotal` n'est posé que pour un groupe d'au moins deux lignes : pour une
// ligne seule, il répéterait la même quantité.
export type RecapGroup = { name: string; lines: RecapLine[]; subtotal: { qty: string; unit: string } | null };

const parseNum = (s: string): number => {
  const t = s.trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};

// Fusion des lignes identiques (nom + commentaire), triées par nom puis par
// commentaire. Logique reprise telle quelle des deux anciennes copies.
function mergeLines(
  inputs: RecapInput[],
  conversions: ConversionRef[],
  units: UnitRef[],
  ingredientRefIds: IngredientRefOption[],
): RecapLine[] {
  const merged: { key: string; name: string; qty: string; unit: string; note: string; steps: Set<number> }[] = [];
  for (const i of inputs) {
    const name = i.name.trim();
    if (!name) continue;
    const note = i.note.trim();
    const qty = i.qty.trim();
    const mkey = name.toLowerCase() + '|' + note.toLowerCase();
    const ex = merged.find((m) => m.key === mkey);
    if (!ex) {
      merged.push({ key: mkey, name, qty, unit: i.unit, note, steps: new Set([i.stepIndex]) });
      continue;
    }
    ex.steps.add(i.stepIndex);
    const a = parseFloat(String(ex.qty).replace(',', '.'));
    const b = parseFloat(qty.replace(',', '.'));
    if (isNaN(a) || isNaN(b)) {
      ex.qty = [ex.qty, qty].filter(Boolean).join(' + ');
      continue;
    }
    if (ex.unit.trim().toLowerCase() === i.unit.trim().toLowerCase()) {
      ex.qty = String(+(a + b).toFixed(2));
      continue;
    }
    const refId = resolveIngredientRefId(name, ingredientRefIds);
    const converted = convertQty(conversions, units, refId, i.unit, b, ex.unit);
    if (converted != null) {
      ex.qty = String(+(a + converted).toFixed(2));
    } else {
      ex.qty = `${ex.qty} ${ex.unit} + ${qty} ${i.unit}`.trim();
      ex.unit = '';
    }
  }
  // Nom comparé sans la casse : « beurre doux » et « Beurre doux » forment un
  // même groupe, dont les lignes doivent se suivre dans l'ordre des
  // commentaires plutôt que selon la casse de leur saisie.
  merged.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'accent' }) || a.note.localeCompare(b.note, 'fr'));
  return merged.map(({ name, qty, unit, note, steps }) => ({
    name,
    qty,
    unit,
    note,
    stepIndices: Array.from(steps).sort((a, b) => a - b),
  }));
}

// Sous-total d'un groupe. Les quantités sont rangées par unité (convertie vers
// une unité déjà rencontrée quand la table le permet) ; ce qui n'est pas un
// nombre — « QS », ou une ligne déjà écrite en toutes lettres par la fusion —
// est repris tel quel. Plusieurs parts restantes s'affichent jointes par « + ».
function subtotalOf(
  lines: RecapLine[],
  conversions: ConversionRef[],
  units: UnitRef[],
  refId: number | null,
): { qty: string; unit: string } {
  const parts: ({ n: number; unit: string } | { text: string })[] = [];
  for (const l of lines) {
    const n = parseNum(l.qty);
    if (isNaN(n)) {
      const text = [l.qty, l.unit].filter((s) => s.trim()).join(' ').trim();
      if (text) parts.push({ text });
      continue;
    }
    const unitKey = l.unit.trim().toLowerCase();
    let added = false;
    for (const p of parts) {
      if (!('n' in p)) continue;
      if (p.unit.trim().toLowerCase() === unitKey) {
        p.n += n;
        added = true;
        break;
      }
      const converted = convertQty(conversions, units, refId, l.unit, n, p.unit);
      if (converted != null) {
        p.n += converted;
        added = true;
        break;
      }
    }
    if (!added) parts.push({ n, unit: l.unit });
  }
  const fmt = (n: number) => String(+n.toFixed(2));
  // Une seule part numérique : quantité et unité restent séparées, comme sur
  // une ligne ordinaire (l'écran y accroche la conversion d'unité).
  if (parts.length === 1 && 'n' in parts[0]) return { qty: fmt(parts[0].n), unit: parts[0].unit };
  const text = parts.map((p) => ('n' in p ? [fmt(p.n), p.unit].filter((s) => s.trim()).join(' ') : p.text)).join(' + ');
  return { qty: text, unit: '' };
}

export function buildIngredientsRecap(
  inputs: RecapInput[],
  conversions: ConversionRef[],
  units: UnitRef[],
  ingredientRefIds: IngredientRefOption[],
): RecapGroup[] {
  const lines = mergeLines(inputs, conversions, units, ingredientRefIds);
  // Regroupement explicite par nom (insensible à la casse) plutôt que par
  // adjacence dans le tri : l'ordre alphabétique ne garantit pas à lui seul
  // que « Beurre » et « beurre » se suivent.
  const groups = new Map<string, RecapLine[]>();
  for (const l of lines) {
    const key = l.name.toLowerCase();
    const g = groups.get(key);
    if (g) g.push(l);
    else groups.set(key, [l]);
  }
  return Array.from(groups.values()).map((g) => ({
    name: g[0].name,
    lines: g,
    subtotal:
      g.length < 2
        ? null
        : subtotalOf(g, conversions, units, resolveIngredientRefId(g[0].name, ingredientRefIds)),
  }));
}
