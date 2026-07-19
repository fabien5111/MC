// Helpers d'affichage d'une recette (porté de recette.html). Fonctions pures.
import type { RecipeFull } from '@/lib/recipes';

export const UNITS_LBL: Record<string, string> = { unite: 'unité(s)', kg: 'kg', g: 'g', l: 'l' };
const MOLDS_LBL: Record<string, string> = { cercle: 'cercle', manque: 'moule à manqué', cadre: 'cadre rectangulaire' };

export function moldLbl(rec: RecipeFull): string {
  return (rec && (rec.mold_types?.name || MOLDS_LBL[rec.yield_unit || ''] || rec.yield_unit)) || '';
}

// Rendement affiché (libellé + valeur), ou null si non renseigné.
export function yieldInfo(rec: RecipeFull): { label: string; value: string } | null {
  if (rec.measure_type === 'units' && rec.yield_qty) {
    const u = UNITS_LBL[rec.yield_unit || ''] || rec.yield_unit || '';
    return { label: 'Quantité produite', value: `${rec.yield_qty} ${u}`.trim() };
  }
  if (rec.measure_type === 'mold') {
    const v = [rec.yield_desc, moldLbl(rec)].filter(Boolean).join(' — ');
    return v ? { label: 'Quantité produite', value: v } : null;
  }
  if (rec.measure_type === 'dimensions' && rec.yield_desc) {
    return { label: 'Quantité produite', value: rec.yield_desc };
  }
  return null;
}

// Fusion des ingrédients identiques (nom + unité) pour la liste complète.
export type MergedIngredient = { name: string; qty: string; unit: string };
export function mergeIngredients(recipe: RecipeFull): MergedIngredient[] {
  const merged: (MergedIngredient & { key: string })[] = [];
  (recipe.ingredient_groups || []).forEach((g) =>
    (g.ingredients || []).forEach((it) => {
      if (!it.name) return;
      const unit = it.unit || '';
      const key = it.name.toLowerCase() + '|' + unit.toLowerCase();
      const ex = merged.find((m) => m.key === key);
      if (!ex) {
        merged.push({ key, name: it.name, qty: it.quantity || '', unit });
        return;
      }
      const a = parseFloat(String(ex.qty).replace(',', '.'));
      const b = parseFloat(String(it.quantity || '').replace(',', '.'));
      if (!isNaN(a) && !isNaN(b)) ex.qty = String(+(a + b).toFixed(2));
      else ex.qty = [ex.qty, it.quantity].filter(Boolean).join(' + ');
    }),
  );
  merged.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return merged.map(({ name, qty, unit }) => ({ name, qty, unit }));
}

// ── Moules : dimensions par forme + métriques (volume / surface) ──
export const MOLD_FORME_DIMS: Record<string, string[]> = {
  cylindre: ['diametre', 'hauteur'],
  rectangulaire: ['longueur', 'largeur', 'hauteur'],
  oblong: ['longueur', 'largeur', 'hauteur'],
  'demi-cylindre': ['longueur', 'largeur'],
};
export const DIM_LABELS: Record<string, string> = {
  diametre: 'Diamètre',
  hauteur: 'Hauteur',
  longueur: 'Longueur',
  largeur: 'Largeur',
};

// Volume de cavité et surface de fonçage d'un moule (porté de recette.html).
export function moldMetrics(
  forme: string | null | undefined,
  d: Record<string, number | string | null | undefined>,
): { volume: number | null; surface: number | null } {
  const n = (k: string): number | null => {
    const v = parseFloat(String(d?.[k]).replace(',', '.'));
    return isFinite(v) && v > 0 ? v : null;
  };
  if (forme === 'cylindre') {
    const dia = n('diametre');
    const h = n('hauteur');
    return {
      volume: dia && h ? Math.PI * (dia / 2) ** 2 * h : null,
      surface: dia ? Math.PI * ((dia + 2 * (h || 0)) / 2) ** 2 : null,
    };
  }
  if (forme === 'rectangulaire' || forme === 'oblong') {
    const L = n('longueur');
    const l = n('largeur');
    const h = n('hauteur');
    return {
      volume: L && l && h ? L * l * h : null,
      surface: L && l ? (L + 2 * (h || 0)) * (l + 2 * (h || 0)) : null,
    };
  }
  if (forme === 'demi-cylindre') {
    const L = n('longueur');
    const l = n('largeur');
    return {
      volume: L && l ? (Math.PI * (l / 2) ** 2 * L) / 2 : null,
      surface: L && l ? Math.PI * (l / 2) * L : null,
    };
  }
  return { volume: null, surface: null };
}

// Étape « Jour J − n » (hors contexte de planification).
export function dayLabel(offset: number | null | undefined): string {
  const o = offset || 0;
  return o > 0 ? `JOUR J − ${o}` : 'JOUR J';
}

// Regroupe les étapes par jour pour le planning de préparation.
export function planningDays(steps: RecipeFull['recipe_steps']): { offset: number; items: string[] }[] {
  const days: { offset: number; items: string[] }[] = [];
  [...steps]
    .sort((a, b) => (b.day_offset || 0) - (a.day_offset || 0) || (a.order_index || 0) - (b.order_index || 0))
    .concat([{ title: 'Dégustation', day_offset: 0 } as RecipeFull['recipe_steps'][number]])
    .forEach((s) => {
      const o = Math.max(0, s.day_offset || 0);
      let d = days.find((x) => x.offset === o);
      if (!d) {
        d = { offset: o, items: [] };
        days.push(d);
      }
      d.items.push(s.title || '');
    });
  return days;
}
