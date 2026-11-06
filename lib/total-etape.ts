// Total d'une étape de fournée, en MASSE (grammes) — pur et testé.
// Même estimation que partout ailleurs (`estimateWeightGrams` : conversions
// propres à l'ingrédient, masse volumique, jamais « 1 ml = 1 g ») : une ligne
// sans conversion connue sort du total et est NOMMÉE, jamais passée sous
// silence. Les lignes retirées et celles remplacées par une recette ne comptent
// pas (on ne les pèse plus).
import { estimateWeightGrams, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';

export type LigneTotalEtape = {
  name: string;
  quantity: number | null;
  base_quantity: number | null;
  unit: string | null;
  ref_id: number | null;
  removed: boolean;
  expanded_into_recipe_id: string | number | null;
};

export type TotalEtape = {
  // Total des quantités ajustées / d'origine (g, arrondi au gramme).
  ajuste: number;
  origine: number;
  // Lignes laissées hors du total (aucune conversion vers une masse).
  horsTotal: string[];
  // Nombre de lignes comptées dans l'étape.
  lignes: number;
};

export function totalEtape(
  rows: LigneTotalEtape[],
  conversions: ConversionRef[],
  units: UnitRef[],
  densities: { name: string; density_g_per_ml: number }[] = [],
): TotalEtape {
  const actives = rows.filter((r) => !r.removed && r.expanded_into_recipe_id == null);
  const ajuste = estimateWeightGrams(
    actives.map((r) => ({ name: r.name, quantity: r.quantity, unit: r.unit, ref_id: r.ref_id })),
    conversions,
    units,
    densities,
  );
  const origine = estimateWeightGrams(
    actives.map((r) => ({ name: r.name, quantity: r.base_quantity ?? r.quantity, unit: r.unit, ref_id: r.ref_id })),
    conversions,
    units,
    densities,
  );
  const hors = new Set([...ajuste.unconverted, ...origine.unconverted].map((u) => u.name));
  return { ajuste: ajuste.grams, origine: origine.grams, horsTotal: [...hors], lignes: actives.length };
}

// « 272 g », « 1,25 kg » (dès 1 kg, deux décimales au plus).
export function formatMasse(grammes: number): string {
  if (grammes >= 1000) return `${(Math.round(grammes / 10) / 100).toLocaleString('fr-FR')} kg`;
  return `${grammes.toLocaleString('fr-FR')} g`;
}
