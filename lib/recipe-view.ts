// Helpers d'affichage d'une recette (porté de recette.html). Fonctions pures
// — pas d'accès Supabase, utilisables aussi bien côté serveur que dans les
// Client Components (ex. RecipeCard rendu dans une grille avec pagination).
import type { AllergenRef, RecipeCard, RecipeFull } from '@/lib/recipes';
import { convertQty, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';

// Noms d'allergènes (texte libre des ingrédients) présents dans une carte,
// dédoublonnés (insensible à la casse). Le rapprochement avec les pictos se
// fait à l'affichage (composant AllergenPictos).
export function cardAllergenNames(recipe: Pick<RecipeCard, 'ingredient_groups'>): string[] {
  const seen = new Map<string, string>();
  for (const g of recipe.ingredient_groups || []) {
    for (const it of g.ingredients || []) {
      if (!it.allergen) continue;
      for (const part of it.allergen.split(/[,;/]/)) {
        const name = part.trim();
        if (!name) continue;
        const k = name.toLowerCase();
        if (!seen.has(k)) seen.set(k, name);
      }
    }
  }
  return [...seen.values()];
}

// Rapproche des noms d'allergènes (texte libre) avec la table de référence
// (picto + libellé canonique), insensible à la casse et aux accents. Pure —
// la table de référence est chargée en amont côté serveur (getAllergensWithPicto)
// puis réutilisée ici, aussi bien côté serveur (AllergenPictos) que côté
// client (cartes rendues après pagination, avec pictos déjà résolus).
export type AllergenPictoItem = { key: string; name: string; picto: string | null };
const normAllergen = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
export function matchAllergenPictos(names: string[], refs: AllergenRef[]): AllergenPictoItem[] {
  const byName = new Map(refs.map((a) => [normAllergen(a.name), a]));
  return names.map((n) => {
    const ref = byName.get(normAllergen(n));
    return { key: normAllergen(n) || n, name: ref?.name ?? n, picto: ref?.picto ?? null };
  });
}

export const UNITS_LBL: Record<string, string> = { unite: 'unité(s)', pers: 'pers.', kg: 'kg', g: 'g', l: 'l' };
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

// Fusion des ingrédients identiques (nom) pour la liste complète. `ref_id`
// (rapprochement conversions d'ingrédients) est celui du premier ingrédient
// fusionné : deux lignes de même nom référencent en pratique toujours le même
// ingrédient du référentiel.
//
// Deux lignes du même ingrédient saisies dans des unités différentes (300 g
// d'œufs dans une étape, 1 unité dans une autre) sont converties vers l'unité
// de la première rencontrée via la table de référence (`convertQty`) plutôt
// que de rester sur deux lignes séparées de la liste. Sans conversion connue
// entre les deux unités, la quantité de la ligne minoritaire est ajoutée en
// toutes lettres plutôt que perdue.
export type MergedIngredient = {
  name: string;
  qty: string;
  unit: string;
  comment: string | null;
  ref_id: number | null;
  url: string | null;
  allergen: string | null;
};
export function mergeIngredients(recipe: RecipeFull, conversions: ConversionRef[], units: UnitRef[]): MergedIngredient[] {
  const merged: (MergedIngredient & { key: string })[] = [];
  (recipe.ingredient_groups || []).forEach((g) =>
    (g.ingredients || []).forEach((it) => {
      if (!it.name) return;
      const unit = it.unit || '';
      const key = it.name.toLowerCase();
      const url = it.ingredient_refs?.url || it.url || null;
      const allergen = it.ingredient_refs?.allergens?.name || it.allergen || null;
      const ex = merged.find((m) => m.key === key);
      if (!ex) {
        merged.push({ key, name: it.name, qty: it.quantity || '', unit, comment: it.comment || null, ref_id: it.ref_id ?? null, url, allergen });
        return;
      }
      const a = parseFloat(String(ex.qty).replace(',', '.'));
      const b = parseFloat(String(it.quantity || '').replace(',', '.'));
      if (isNaN(a) || isNaN(b)) {
        ex.qty = [ex.qty, it.quantity].filter(Boolean).join(' + ');
      } else if (ex.unit.toLowerCase() === unit.toLowerCase()) {
        ex.qty = String(+(a + b).toFixed(2));
      } else {
        const converted = convertQty(conversions, units, ex.ref_id ?? it.ref_id, unit, b, ex.unit);
        if (converted != null) {
          ex.qty = String(+(a + converted).toFixed(2));
        } else {
          ex.qty = `${ex.qty} ${ex.unit} + ${it.quantity} ${unit}`.trim();
          ex.unit = '';
        }
      }
      if (it.comment && it.comment !== ex.comment) ex.comment = ex.comment ? ex.comment + ' ; ' + it.comment : it.comment;
      if (!ex.url && url) ex.url = url;
      if (allergen && allergen !== ex.allergen) ex.allergen = ex.allergen ? ex.allergen + ', ' + allergen : allergen;
    }),
  );
  merged.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return merged.map(({ name, qty, unit, comment, ref_id, url, allergen }) => ({ name, qty, unit, comment, ref_id, url, allergen }));
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

// Temps globaux effectifs d'une recette : le temps saisi manuellement prime ;
// s'il est vide, on retombe sur la somme des temps des étapes correspondantes
// (durée totale = somme prép + cuisson + attente de toutes les étapes).
export type RecipeTimes = { prep: number | null; cook: number | null; wait: number | null; total: number | null };
export function effectiveTimes(
  recipe: Pick<RecipeFull, 'prep_time' | 'cook_time' | 'wait_time' | 'total_time'> & {
    recipe_steps: Pick<RecipeFull['recipe_steps'][number], 'prep_time' | 'cook_time' | 'wait_time'>[];
  },
): RecipeTimes {
  const steps = recipe.recipe_steps || [];
  const sum = (k: 'prep_time' | 'cook_time' | 'wait_time') => steps.reduce((n, s) => n + (s[k] || 0), 0);
  const prepSum = sum('prep_time');
  const cookSum = sum('cook_time');
  const waitSum = sum('wait_time');
  return {
    prep: recipe.prep_time ?? (prepSum || null),
    cook: recipe.cook_time ?? (cookSum || null),
    wait: recipe.wait_time ?? (waitSum || null),
    total: recipe.total_time ?? (prepSum + cookSum + waitSum || null),
  };
}

// Étape « Jour J − n » (hors contexte de planification).
export function dayLabel(offset: number | null | undefined): string {
  const o = offset || 0;
  return o > 0 ? `JOUR J − ${o}` : 'JOUR J';
}

// Regroupe les étapes par jour pour le planning de préparation. `fully_done`
// et `added` (mode planifié seulement, cf. lib/recipe-plan.ts) reprennent la
// convention de couleurs de la fiche : intitulé barré quand l'étape est
// entièrement traitée, vert quand elle vient du remplacement d'un ingrédient
// par une sous-recette. Absents sur une recette, jamais vrais pour la
// « Dégustation » de synthèse.
type PlanningStep = Pick<RecipeFull['recipe_steps'][number], 'title' | 'day_offset' | 'order_index'> & {
  fully_done?: boolean;
  added?: boolean;
};
export type PlanningDayItem = { title: string; fully_done: boolean; added: boolean };

export function planningDays(steps: PlanningStep[]): { offset: number; items: PlanningDayItem[] }[] {
  const days: { offset: number; items: PlanningDayItem[] }[] = [];
  [...steps]
    .sort((a, b) => (b.day_offset || 0) - (a.day_offset || 0) || (a.order_index || 0) - (b.order_index || 0))
    .concat([{ title: 'Dégustation', day_offset: 0, order_index: 0 }])
    .forEach((s) => {
      const o = Math.max(0, s.day_offset || 0);
      let d = days.find((x) => x.offset === o);
      if (!d) {
        d = { offset: o, items: [] };
        days.push(d);
      }
      d.items.push({ title: s.title || '', fully_done: s.fully_done ?? false, added: s.added ?? false });
    });
  return days;
}
