'use client';

// Liste du récapitulatif des ingrédients, commune à l'éditeur de recette
// (CreerForm) et à la relecture d'un import (RelectureEditor) — le calcul vit
// dans `lib/ingredients-recap.ts`. Un ingrédient présent sur plusieurs lignes
// (commentaires différents) est suivi d'une ligne de sous-total (JEP-248).
import { Fragment } from 'react';
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
  const convText = (name: string, unit: string, qty: string) =>
    ingredientConversionText(conversions, units, resolveIngredientRefId(name, ingredientRefIds), unit, qty);
  return (
    // Nom en `minmax(0,1fr)` : une colonne `max-content` ne peut pas
    // rétrécir, un nom long débordait donc de l'écran sur mobile.
    <div className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-4 sm:gap-x-10">
      {groups.map((g) => (
        <Fragment key={g.name.toLowerCase()}>
          {g.lines.map((m) => {
            const conv = convText(m.name, m.unit, m.qty);
            return (
              <div key={m.note.toLowerCase()} className="border-b border-outline-variant/30 py-1.5" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                <span className="font-body-md text-body-md text-on-surface break-words">
                  {m.name}
                  {m.note && <span className="block text-on-surface-variant text-[12px] italic">{m.note}</span>}
                  {m.stepIndices.length === 1 ? (
                    <button
                      type="button"
                      onClick={() => goToStep(m.stepIndices[0])}
                      className="flex items-center gap-1 text-primary text-[12px] hover:underline mt-0.5"
                    >
                      <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                      1 étape — {stepTitle(m.stepIndices[0])}
                    </button>
                  ) : (
                    <span className="block text-on-surface-variant text-[12px]">{m.stepIndices.length} étapes</span>
                  )}
                </span>
                <span className="font-label-md text-label-md text-primary whitespace-nowrap text-center">
                  {[m.qty, m.unit].filter(Boolean).join(' ')}
                  {conv && <span className="text-on-surface-variant font-body-md text-[12px]"> ({conv})</span>}
                </span>
              </div>
            );
          })}
          {g.subtotal && (() => {
            const conv = convText(g.name, g.subtotal.unit, g.subtotal.qty);
            return (
              <div className="border-b border-outline-variant py-1.5 bg-surface-container-low" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                <span className="font-body-md text-body-md text-on-surface font-semibold break-words pl-2">
                  Total — {g.name}
                </span>
                <span className="font-label-md text-label-md text-primary font-bold whitespace-nowrap text-center">
                  {[g.subtotal.qty, g.subtotal.unit].filter(Boolean).join(' ')}
                  {conv && <span className="text-on-surface-variant font-body-md font-normal text-[12px]"> ({conv})</span>}
                </span>
              </div>
            );
          })()}
        </Fragment>
      ))}
    </div>
  );
}
