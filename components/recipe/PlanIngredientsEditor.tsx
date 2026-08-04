'use client';

// Ingrédients en mode planifié (porté de recette.html) : colonnes Coef. /
// Quantité ajustée / Quantité d'origine, lignes barrées (retirées) / ajoutées
// (vert), édition en ligne (crayon), ajout d'un ingrédient par étape. Écrit
// directement sur `plan_ingredients` (le plan possède sa propre copie des
// ingrédients — voir CLAUDE.md « Recettes planifiées ») : chaque action est
// une écriture ciblée sur la ligne concernée, plus de blob JSON à réécrire.
import { Fragment, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import type { Unit } from '@/lib/profile';
import { fmtNum, type PlanFull, type PlanIngredientRow } from '@/lib/recipe-plan';
import { ingredientConversionText, type ConversionRef } from '@/lib/ingredient-conversions';

type EditKey = string | null; // `${stepId}:${rowId}` ou `add-${stepId}`

const numify = (v: string): number | null => {
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) ? null : n;
};
const round2 = (n: number): number => +n.toFixed(2);

export function PlanIngredientsEditor({
  plan,
  units,
  unitTips,
  conversions,
  runningExecutionIds,
}: {
  plan: PlanFull;
  units: Unit[];
  unitTips: Record<string, string>;
  conversions: ConversionRef[];
  // Sessions `en_cours` du plan, tous pas confondus (calculé par la page) :
  // une session figée à son démarrage ne reflète aucune de ces modifications
  // (cf. CLAUDE.md « Recettes planifiées ») — proposée à la suppression après
  // chaque écriture aboutie, plutôt qu'un avertissement qui se contredirait
  // silencieusement au fil des modifications suivantes.
  runningExecutionIds: number[];
}) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
  const [editing, setEditing] = useState<EditKey>(null);
  const [addingStep, setAddingStep] = useState<number | null>(null);

  async function proposeDeleteRunningSessions() {
    if (!runningExecutionIds.length) return;
    const plural = runningExecutionIds.length > 1;
    await mutate(() => createClient().from('executions').delete().in('id', runningExecutionIds), {
      confirm: `${plural ? 'Des sessions' : 'Une session'} de préparation en cours ${plural ? 'ont' : 'a'} été figée${plural ? 's' : ''} avant cette modification et ne la reflète${plural ? 'nt' : ''} pas.\n\n${plural ? 'Les supprimer' : 'La supprimer'} ?`,
      errorLabel: 'Suppression impossible',
    });
  }

  // Chaque action est une écriture ciblée sur `plan_ingredients` (via
  // useMutation : spinner + confirm optionnel + resynchronisation du Server
  // Component parent — fiche recette, liste de courses, onglet Planning).
  async function applyEdit(row: PlanIngredientRow, qtyStr: string, coefStr: string) {
    const qv = qtyStr.trim() === '' ? null : numify(qtyStr);
    const cv = coefStr.trim() === '' ? null : numify(coefStr);
    let patch: { quantity: number | null; quantity_text: string | null } | null = null;
    if (qv != null && !isNaN(qv)) {
      patch = { quantity: qv, quantity_text: null };
    } else if (cv != null && !isNaN(cv) && cv > 0 && row.base_quantity != null) {
      patch = { quantity: round2(row.base_quantity * cv), quantity_text: null };
    }
    setEditing(null);
    if (!patch) return;
    const ok = await mutate(() => createClient().from('plan_ingredients').update(patch!).eq('id', row.id), { errorLabel: 'Modification non enregistrée' });
    if (ok) await proposeDeleteRunningSessions();
  }

  async function toggleRemove(row: PlanIngredientRow) {
    const ok = await mutate(() => createClient().from('plan_ingredients').update({ removed: !row.removed }).eq('id', row.id), { errorLabel: 'Modification non enregistrée' });
    if (ok) await proposeDeleteRunningSessions();
  }

  async function removeAdded(row: PlanIngredientRow) {
    const ok = await mutate(() => createClient().from('plan_ingredients').delete().eq('id', row.id), { errorLabel: 'Suppression impossible' });
    if (ok) await proposeDeleteRunningSessions();
  }

  async function applyEditAdded(row: PlanIngredientRow, name: string, qtyStr: string, unit: string) {
    if (!name.trim()) {
      dialog.alert("Indiquez un nom d'ingrédient.");
      return;
    }
    const n = numify(qtyStr);
    setEditing(null);
    const ok = await mutate(
      () =>
        createClient()
          .from('plan_ingredients')
          .update({ name: name.trim(), quantity: n, quantity_text: n == null && qtyStr.trim() ? qtyStr.trim() : null, unit: unit.trim() || null })
          .eq('id', row.id),
      { errorLabel: 'Modification non enregistrée' },
    );
    if (ok) await proposeDeleteRunningSessions();
  }

  async function addIng(stepId: number, name: string, qtyStr: string, unit: string) {
    if (!name.trim()) {
      dialog.alert("Indiquez un nom d'ingrédient.");
      return;
    }
    const n = numify(qtyStr);
    const stepRows = plan.plan_ingredients.filter((it) => it.step_id === stepId);
    const nextOrder = stepRows.length ? Math.max(...stepRows.map((r) => r.order_index)) + 1 : 0;
    setAddingStep(null);
    const ok = await mutate(
      () =>
        createClient()
          .from('plan_ingredients')
          .insert({
            planning_id: plan.id,
            step_id: stepId,
            order_index: nextOrder,
            name: name.trim(),
            quantity: n,
            quantity_text: n == null && qtyStr.trim() ? qtyStr.trim() : null,
            unit: unit.trim() || null,
            added: true,
          }),
      { errorLabel: 'Ajout impossible' },
    );
    if (ok) await proposeDeleteRunningSessions();
  }

  const LBL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant text-center';
  const gridStyle = { display: 'grid', gridTemplateColumns: 'max-content max-content max-content max-content max-content', columnGap: 32 } as const;
  const rowStyle = { display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'center' } as const;

  const withUnit = (text: string, unit: string | null, refId?: number | null) => {
    const tip = unit ? unitTips[unit.toLowerCase().trim()] : undefined;
    const conv = ingredientConversionText(conversions, units, refId, unit, text);
    return (
      <>
        {text}
        {text && unit ? ' ' : ''}
        {unit ? (
          tip ? (
            <span className="unit-tip" title={tip}>
              {unit}
            </span>
          ) : (
            unit
          )
        ) : null}
        {conv && <span className="text-on-surface-variant font-body-md text-[12px]"> ({conv})</span>}
      </>
    );
  };

  const sortedSteps = [...plan.plan_steps].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="space-y-10">
      <LoadingOverlay visible={busy} label="Modification en cours…" />
      {sortedSteps.map((step) => {
        const rows = plan.plan_ingredients.filter((it) => it.step_id === step.id).sort((a, b) => a.order_index - b.order_index);
        if (!rows.length && addingStep !== step.id) return null;
        return (
          <div key={step.id}>
            {/* La case « Déjà réalisé » et l'exception par ingrédient vivent
                dans le déroulé de la recette (PlanStepDonePanel), pas ici —
                cette section ne fait plus qu'informer (titre barré, lignes
                grisées) de l'état déjà réglé là-bas. */}
            <h4 className={`font-label-md text-label-md border-b border-outline-variant pb-2 mb-4 ${step.already_done ? 'text-on-surface-variant line-through' : 'text-secondary'}`}>
              {step.title || ''}
            </h4>
            {rows.length > 0 && (
              <ul style={gridStyle}>
                <li className="pb-1" style={rowStyle}>
                  <span />
                  <span className={LBL}>Coef.</span>
                  <span className={`${LBL} text-primary`}>Quantité ajustée</span>
                  <span className={LBL}>Quantité d&apos;origine</span>
                  <span />
                </li>
                {rows.map((row) => {
                  const key = `${step.id}:${row.id}`;
                  const coef = row.base_quantity && row.quantity != null ? round2(row.quantity / row.base_quantity) : null;
                  // `removed` prime toujours sur l'exclusion « déjà fait ».
                  const excludedByStep = step.already_done && row.excluded_when_done;
                  const tone = row.removed
                    ? 'text-error line-through'
                    : excludedByStep
                      ? 'text-on-surface-variant line-through opacity-60'
                      : row.added
                        ? 'text-green-700'
                        : '';
                  const adjText = row.quantity != null ? fmtNum(row.quantity) : row.quantity_text || '';
                  const origText = row.added ? '—' : row.base_quantity != null ? fmtNum(row.base_quantity) : row.quantity_text || '—';
                  return (
                    <Fragment key={row.id}>
                      <li className="border-b border-outline-variant/30 py-2" style={rowStyle}>
                        <span className={`font-body-md text-body-md${tone ? ' ' + tone : ''}`}>
                          {row.url ? (
                            <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-secondary">
                              {row.name}
                            </a>
                          ) : (
                            row.name
                          )}
                          {row.comment && <span className="text-on-surface-variant text-sm italic"> — {row.comment}</span>}
                        </span>
                        <span className={`font-label-md text-label-md text-center ${tone || 'text-on-surface-variant'}`}>{coef != null ? `× ${fmtNum(coef)}` : '—'}</span>
                        <span className={`font-label-md text-label-md text-center ${tone || 'text-primary'}`}>{withUnit(adjText, row.unit, row.ref_id)}</span>
                        <span className={`font-label-md text-label-md text-center ${tone || 'text-on-surface-variant'}`}>{row.added ? '—' : withUnit(origText, row.unit, row.ref_id)}</span>
                        <span className="no-print flex items-center gap-1 justify-self-center">
                          <button
                            type="button"
                            onClick={() => setEditing(editing === key ? null : key)}
                            title={row.added ? 'Modifier cet ajout' : 'Modifier la quantité ou le coefficient'}
                            className="text-primary hover:opacity-70"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          {row.added ? (
                            <button type="button" onClick={() => removeAdded(row)} title="Retirer cet ajout" className="text-error hover:opacity-70">
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleRemove(row)}
                              title={row.removed ? "Rétablir l'ingrédient" : "Supprimer (barrer) l'ingrédient"}
                              className={row.removed ? 'text-primary hover:opacity-70' : 'text-error hover:opacity-70'}
                            >
                              <span className="material-symbols-outlined text-[18px]">{row.removed ? 'undo' : 'delete'}</span>
                            </button>
                          )}
                        </span>
                      </li>
                      {editing === key &&
                        (row.added ? (
                          <AddedEditForm key={key + '-form'} row={row} units={units} onApply={(n, q, u) => applyEditAdded(row, n, q, u)} onCancel={() => setEditing(null)} />
                        ) : (
                          <LineEditForm key={key + '-form'} row={row} onApply={(q, c) => applyEdit(row, q, c)} onCancel={() => setEditing(null)} />
                        ))}
                    </Fragment>
                  );
                })}
              </ul>
            )}
            {addingStep === step.id ? (
              <AddForm units={units} onAdd={(n, q, u) => addIng(step.id, n, q, u)} onCancel={() => setAddingStep(null)} />
            ) : (
              <button type="button" onClick={() => setAddingStep(step.id)} className="no-print mt-3 flex items-center gap-1 text-primary font-label-md text-[12px] hover:underline">
                <span className="material-symbols-outlined text-[16px]">add_circle</span> Ajouter un ingrédient
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

const FIELD = 'border border-outline-variant rounded px-3 py-1.5 font-body-md text-sm';

function LineEditForm({ row, onApply, onCancel }: { row: PlanIngredientRow; onApply: (qty: string, coef: string) => void; onCancel: () => void }) {
  const coef = row.base_quantity && row.quantity != null ? +(row.quantity / row.base_quantity).toFixed(2) : null;
  const [coefStr, setCoefStr] = useState(coef != null ? fmtNum(coef) : '');
  const [qty, setQty] = useState(row.quantity != null ? fmtNum(row.quantity) : '');
  return (
    <li style={{ gridColumn: '1/-1' }} className="py-3">
      <div className="flex flex-wrap items-end gap-3">
        <span className="font-body-md text-sm text-on-surface-variant pb-2">{row.name} :</span>
        <label className="flex flex-col gap-1">
          <span className="font-label-md text-[10px] uppercase text-on-surface-variant">Coefficient</span>
          <input type="number" min={0} step="any" value={coefStr} onChange={(e) => setCoefStr(e.target.value)} disabled={row.base_quantity == null} className={FIELD} style={{ width: '6rem' }} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-label-md text-[10px] uppercase text-on-surface-variant">ou quantité ajustée{row.unit ? ` (${row.unit})` : ''}</span>
          <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={FIELD} style={{ width: '7rem' }} />
        </label>
        <button type="button" onClick={() => onApply(qty, coefStr)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px]">
          OK
        </button>
        <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
          Annuler
        </button>
      </div>
    </li>
  );
}

function AddedEditForm({ row, units, onApply, onCancel }: { row: PlanIngredientRow; units: Unit[]; onApply: (name: string, qty: string, unit: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(row.name);
  const [qty, setQty] = useState(row.quantity != null ? fmtNum(row.quantity) : row.quantity_text || '');
  const [unit, setUnit] = useState(row.unit || '');
  return (
    <li style={{ gridColumn: '1/-1' }} className="py-3">
      <div className="flex flex-wrap items-end gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ingrédient" className={FIELD} style={{ width: '12rem' }} />
        <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantité" type="number" min={0} step="any" className={FIELD} style={{ width: '6rem' }} />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${FIELD} bg-white`} style={{ width: '8rem' }}>
          <option value="">— Unité —</option>
          {units.map((u) => (
            <option key={u.id} value={u.name}>
              {u.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => onApply(name, qty, unit)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px]">
          OK
        </button>
        <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
          Annuler
        </button>
      </div>
    </li>
  );
}

function AddForm({ units, onAdd, onCancel }: { units: Unit[]; onAdd: (name: string, qty: string, unit: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');
  const [unit, setUnit] = useState('');
  return (
    <div className="flex flex-wrap items-end gap-3 mt-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ingrédient" className={FIELD} style={{ width: '12rem' }} autoFocus />
      <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Quantité" type="number" min={0} step="any" className={FIELD} style={{ width: '6rem' }} />
      <select value={unit} onChange={(e) => setUnit(e.target.value)} className={`${FIELD} bg-white`} style={{ width: '8rem' }}>
        <option value="">— Unité —</option>
        {units.map((u) => (
          <option key={u.id} value={u.name}>
            {u.name}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => onAdd(name, qty, unit)} className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px]">
        Ajouter
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant"
      >
        Annuler
      </button>
    </div>
  );
}
