'use client';

// Liste du récapitulatif des ingrédients, commune à l'éditeur de recette
// (CreerForm) et à la relecture d'un import (RelectureEditor) — le calcul vit
// dans `lib/ingredients-recap.ts`, la présentation dans `IngredientTotalList`
// (la même que la fiche recette et la fournée). Un ingrédient présent sur
// plusieurs lignes (commentaires différents) s'ouvre sur son total (JEP-248).
import { IngredientTotalList } from '@/components/IngredientTotalList';
import { ingredientKey } from '@/lib/ingredient-name';
import { ingredientConversionText, resolveIngredientRefId, type ConversionRef, type IngredientRefOption, type UnitRef } from '@/lib/ingredient-conversions';
import type { RecapGroup } from '@/lib/ingredients-recap';

export function IngredientsRecapList({
  groups,
  conversions,
  units,
  ingredientRefIds,
  stepTitle,
  goToStep,
}: {
  groups: RecapGroup[];
  conversions: ConversionRef[];
  units: UnitRef[];
  ingredientRefIds: IngredientRefOption[];
  stepTitle: (stepIndex: number) => string;
  goToStep: (stepIndex: number) => void;
}) {
  const qtyNode = (name: string, unit: string, qty: string) => {
    const conv = ingredientConversionText(conversions, units, resolveIngredientRefId(name, ingredientRefIds), unit, qty);
    return (
      <span className="whitespace-nowrap">
        {[qty, unit].filter(Boolean).join(' ')}
        {conv && <span className="text-on-surface-variant font-body-md font-normal text-[12px]"> ({conv})</span>}
      </span>
    );
  };
  return (
    <IngredientTotalList
      groups={groups.map((g) => ({
        key: ingredientKey(g.name),
        name: g.name,
        total: g.subtotal ? qtyNode(g.name, g.subtotal.unit, g.subtotal.qty) : null,
        lines: g.lines.map((m) => ({
          key: m.note.toLowerCase(),
          qty: qtyNode(m.name, m.unit, m.qty),
          comment: m.note || null,
          links:
            m.stepIndices.length === 1 ? (
              <button type="button" onClick={() => goToStep(m.stepIndices[0])} className="inline-flex items-center gap-1 text-primary text-[12px] hover:underline">
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                1 étape — {stepTitle(m.stepIndices[0])}
              </button>
            ) : (
              <span className="text-on-surface-variant text-[12px]">{m.stepIndices.length} étapes</span>
            ),
        })),
      }))}
    />
  );
}
