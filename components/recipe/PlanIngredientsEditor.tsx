'use client';

// Ingrédients en mode planifié (porté de recette.html) : colonnes Coef. /
// Quantité ajustée / Quantité d'origine, lignes barrées (retirées) / ajoutées
// (vert), édition en ligne (crayon), ajout d'un ingrédient par étape. Écrit
// directement sur `plan_ingredients` (le plan possède sa propre copie des
// ingrédients — voir CLAUDE.md « Recettes planifiées ») : chaque action est
// une écriture ciblée sur la ligne concernée, plus de blob JSON à réécrire.
import { Fragment, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import type { Unit } from '@/lib/profile';
import { fmtNum, type PlanFull, type PlanIngredientRow, type PlanStepRow } from '@/lib/recipe-plan';

type EditKey = string | null; // `${stepId}:${rowId}` ou `add-${stepId}`

const numify = (v: string): number | null => {
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) ? null : n;
};
const round2 = (n: number): number => +n.toFixed(2);

export function PlanIngredientsEditor({ plan, units, unitTips }: { plan: PlanFull; units: Unit[]; unitTips: Record<string, string> }) {
  const { mutate, busy } = useMutation();
  const [editing, setEditing] = useState<EditKey>(null);
  const [addingStep, setAddingStep] = useState<number | null>(null);
  // `busy` repasse à false dès que l'écriture réseau aboutit, avant que
  // router.refresh() n'ait fini de resynchroniser `plan` — sans ce doublon
  // local, la case « Déjà fait » changeait d'état après la disparition du
  // spinner plutôt qu'en même temps (cf. CLAUDE.md « Suppression optimiste
  // dans une liste », même mécanisme appliqué ici à une case à cocher).
  const [steps, setSteps] = useState(plan.plan_steps);
  useEffect(() => setSteps(plan.plan_steps), [plan.plan_steps]);
  const [ingredients, setIngredients] = useState(plan.plan_ingredients);
  useEffect(() => setIngredients(plan.plan_ingredients), [plan.plan_ingredients]);

  // Chaque action est une écriture ciblée sur `plan_ingredients` (via
  // useMutation : spinner + confirm optionnel + resynchronisation du Server
  // Component parent — fiche recette, liste de courses, onglet Planning).
  function applyEdit(row: PlanIngredientRow, qtyStr: string, coefStr: string) {
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
    mutate(() => createClient().from('plan_ingredients').update(patch!).eq('id', row.id), { errorLabel: 'Modification non enregistrée' });
  }

  // « Déjà fait » : les ingrédients de l'étape sortent des courses, de la mise
  // en place et de l'exécution — sans toucher à `plan_ingredients.removed`,
  // pour ne pas écraser les suppressions faites ligne par ligne (décocher
  // l'étape doit les laisser telles quelles).
  //
  // Le cast couvre les deux colonnes tant que `lib/database.types.ts` n'a pas
  // été régénéré sur la base migrée (cf. lib/recipe-plan.ts).
  async function patchStep(step: PlanStepRow, patch: { already_done?: boolean; keep_cooking?: boolean }) {
    const ok = await mutate(
      () =>
        createClient()
          .from('plan_steps')
          .update(patch as never)
          .eq('id', step.id),
      { errorLabel: 'Modification non enregistrée' },
    );
    if (ok) setSteps((prev) => prev.map((s) => (s.id === step.id ? { ...s, ...patch } : s)));
  }

  function toggleDone(step: PlanStepRow) {
    // Repasser une étape « à faire » remet aussi la cuisson dans son état par
    // défaut : garder `keep_cooking` à vrai sur une étape active n'a pas de sens.
    patchStep(step, step.already_done ? { already_done: false, keep_cooking: false } : { already_done: true });
  }

  function toggleRemove(row: PlanIngredientRow) {
    mutate(() => createClient().from('plan_ingredients').update({ removed: !row.removed }).eq('id', row.id), { errorLabel: 'Modification non enregistrée' });
  }

  // Exception ligne par ligne à une étape « déjà réalisée » : par défaut tous
  // ses ingrédients sortent des courses / de la mise en place (case cochée),
  // mais certains restent utiles plus tard dans la même étape — l'œuf de
  // dorure d'une pâte déjà façonnée mais pas encore cuite. Décocher les garde
  // dans le parcours sans toucher à `removed` ni à l'état « déjà réalisé ».
  async function toggleExcludedWhenDone(row: PlanIngredientRow) {
    const next = !row.excluded_when_done;
    const ok = await mutate(
      () => createClient().from('plan_ingredients').update({ excluded_when_done: next } as never).eq('id', row.id),
      { errorLabel: 'Modification non enregistrée' },
    );
    if (ok) setIngredients((prev) => prev.map((r) => (r.id === row.id ? { ...r, excluded_when_done: next } : r)));
  }

  function removeAdded(row: PlanIngredientRow) {
    mutate(() => createClient().from('plan_ingredients').delete().eq('id', row.id), { errorLabel: 'Suppression impossible' });
  }

  function applyEditAdded(row: PlanIngredientRow, name: string, qtyStr: string, unit: string) {
    if (!name.trim()) {
      alert("Indiquez un nom d'ingrédient.");
      return;
    }
    const n = numify(qtyStr);
    setEditing(null);
    mutate(
      () =>
        createClient()
          .from('plan_ingredients')
          .update({ name: name.trim(), quantity: n, quantity_text: n == null && qtyStr.trim() ? qtyStr.trim() : null, unit: unit.trim() || null })
          .eq('id', row.id),
      { errorLabel: 'Modification non enregistrée' },
    );
  }

  async function addIng(stepId: number, name: string, qtyStr: string, unit: string) {
    if (!name.trim()) {
      alert("Indiquez un nom d'ingrédient.");
      return;
    }
    const n = numify(qtyStr);
    const stepRows = ingredients.filter((it) => it.step_id === stepId);
    const nextOrder = stepRows.length ? Math.max(...stepRows.map((r) => r.order_index)) + 1 : 0;
    setAddingStep(null);
    await mutate(
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
  }

  const LBL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant text-center';
  // Colonne de case à cocher en tête, uniquement pour les étapes déjà
  // réalisées (case « conserver cet ingrédient » — cf. toggleExcludedWhenDone).
  const gridStyle = (withCheckbox: boolean) =>
    ({ display: 'grid', gridTemplateColumns: `${withCheckbox ? 'max-content ' : ''}max-content max-content max-content max-content max-content`, columnGap: 32 }) as const;
  const rowStyle = { display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'center' } as const;

  const withUnit = (text: string, unit: string | null) => {
    const tip = unit ? unitTips[unit.toLowerCase().trim()] : undefined;
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
      </>
    );
  };

  const sortedSteps = [...steps].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="space-y-10">
      <LoadingOverlay visible={busy} label="Modification en cours…" />
      {sortedSteps.map((step) => {
        const rows = ingredients.filter((it) => it.step_id === step.id).sort((a, b) => a.order_index - b.order_index);
        if (!rows.length && addingStep !== step.id) return null;
        return (
          <div key={step.id}>
            <div className="border-b border-outline-variant pb-2 mb-4 flex items-center gap-3 flex-wrap">
              <h4 className={`font-label-md text-label-md flex-1 min-w-0 ${step.already_done ? 'text-on-surface-variant line-through' : 'text-secondary'}`}>
                {step.title || ''}
              </h4>
              {step.already_done && step.cook_time != null && step.cook_time > 0 && (
                <label className="no-print flex items-center gap-1.5 font-label-md text-[11px] text-on-surface-variant cursor-pointer">
                  <input
                    type="checkbox"
                    checked={step.keep_cooking}
                    onChange={() => patchStep(step, { keep_cooking: !step.keep_cooking })}
                    className="w-4 h-4 rounded border-outline accent-primary focus:ring-primary cursor-pointer"
                  />
                  La cuisson reste à faire
                </label>
              )}
              <button
                type="button"
                onClick={() => toggleDone(step)}
                title={
                  step.already_done
                    ? "Cette étape est à refaire : ses ingrédients reviennent dans les courses et la mise en place"
                    : "J'ai déjà réalisé cette étape : retirer ses ingrédients des courses et de la mise en place"
                }
                className={`no-print flex items-center gap-1 px-3 py-1 rounded-full font-label-md text-[11px] border transition-colors ${
                  step.already_done ? 'border-primary text-primary bg-primary/5' : 'border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{step.already_done ? 'task_alt' : 'radio_button_unchecked'}</span>
                Déjà réalisé
              </button>
            </div>
            {rows.length > 0 && (
              <ul style={gridStyle(step.already_done)}>
                <li className="pb-1" style={rowStyle}>
                  {step.already_done && <span />}
                  <span />
                  <span className={LBL}>Coef.</span>
                  <span className={`${LBL} text-primary`}>Quantité ajustée</span>
                  <span className={LBL}>Quantité d&apos;origine</span>
                  <span />
                </li>
                {rows.map((row) => {
                  const key = `${step.id}:${row.id}`;
                  const coef = row.base_quantity && row.quantity != null ? round2(row.quantity / row.base_quantity) : null;
                  // Étape déjà faite : ses ingrédients sortent du parcours,
                  // sauf ceux explicitement conservés (case décochée) — sans
                  // modifier leur propre état (retirée / ajoutée). `removed`
                  // prime toujours : une ligne retirée à la main reste barrée
                  // même si on la « conserve » malgré l'étape déjà faite.
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
                        {step.already_done && (
                          <span className="justify-self-center">
                            {!row.removed && (
                              <input
                                type="checkbox"
                                checked={row.excluded_when_done}
                                onChange={() => toggleExcludedWhenDone(row)}
                                title={
                                  row.excluded_when_done
                                    ? 'Déjà pris en compte — décocher pour le conserver quand même (ex. un ingrédient utile plus tard dans la même étape)'
                                    : 'Conservé malgré l’étape déjà réalisée'
                                }
                                className="no-print w-5 h-5 rounded border-outline accent-primary focus:ring-primary cursor-pointer"
                              />
                            )}
                          </span>
                        )}
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
                        <span className={`font-label-md text-label-md text-center ${tone || 'text-primary'}`}>{withUnit(adjText, row.unit)}</span>
                        <span className={`font-label-md text-label-md text-center ${tone || 'text-on-surface-variant'}`}>{row.added ? '—' : withUnit(origText, row.unit)}</span>
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
