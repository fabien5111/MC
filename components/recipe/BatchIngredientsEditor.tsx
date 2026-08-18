'use client';

// Ingrédients d'une fournée (porté de recette.html) : colonnes Coef. /
// Quantité ajustée / Quantité d'origine, lignes barrées (retirées) / ajoutées
// (vert), édition en ligne (crayon), ajout d'un ingrédient par étape. Écrit
// directement sur `batch_ingredients` (la fournée possède sa propre copie des
// ingrédients — voir CLAUDE.md « Fournées ») : chaque action est une écriture
// ciblée sur la ligne concernée, plus de blob JSON à réécrire.
//
// Écriture immédiatement reflétée partout (fiche et mode Cuisiner lisent la
// même ligne) : plus de session figée à proposer de supprimer après une
// modification, contrairement à l'ancien modèle plan + session séparés.
import { Fragment, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import type { Unit } from '@/lib/profile';
import { fmtNum, batchIngredientExpanded, batchStepIsExpansion, type BatchFull, type BatchIngredientRow } from '@/lib/recipe-plan';
import { ingredientConversionText, type ConversionRef } from '@/lib/ingredient-conversions';
import { IngredientExpandDialog } from '@/components/recipe/IngredientExpandDialog';

type EditKey = string | null; // `${stepId}:${rowId}` ou `add-${stepId}`

const numify = (v: string): number | null => {
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) ? null : n;
};
const round2 = (n: number): number => +n.toFixed(2);

export function BatchIngredientsEditor({
  batch,
  units,
  unitTips,
  conversions,
}: {
  batch: BatchFull;
  units: Unit[];
  unitTips: Record<string, string>;
  conversions: ConversionRef[];
}) {
  const { mutate, busy, refresh } = useMutation();
  const dialog = useDialog();
  const [editing, setEditing] = useState<EditKey>(null);
  const [addingStep, setAddingStep] = useState<number | null>(null);
  // Ligne en cours de remplacement par une sous-recette (fenêtre ouverte).
  const [expanding, setExpanding] = useState<BatchIngredientRow | null>(null);

  // Remplacement inséré depuis la fenêtre modale : c'est ici qu'est déclenchée
  // la resynchronisation, et non dans la fenêtre — celle-ci se ferme aussitôt,
  // emportant sa transition et donc son spinner avant le retour du rendu
  // serveur.
  function onExpansionDone() {
    refresh();
  }

  // Chaque action est une écriture ciblée sur `batch_ingredients` (via
  // useMutation : spinner + confirm optionnel + resynchronisation du Server
  // Component parent — fiche recette, liste de courses, onglet fournées).
  async function applyEdit(row: BatchIngredientRow, qtyStr: string, coefStr: string) {
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
    await mutate(() => createClient().from('batch_ingredients').update(patch!).eq('id', row.id), { errorLabel: 'Modification non enregistrée' });
  }

  async function toggleRemove(row: BatchIngredientRow) {
    await mutate(() => createClient().from('batch_ingredients').update({ removed: !row.removed }).eq('id', row.id), { errorLabel: 'Modification non enregistrée' });
  }

  async function removeAdded(row: BatchIngredientRow) {
    await mutate(() => createClient().from('batch_ingredients').delete().eq('id', row.id), { errorLabel: 'Suppression impossible' });
  }

  // Défait un remplacement : les étapes insérées (et tout ce qu'elles
  // portent) sont retirées, puis la ligne d'ingrédient reprend sa place —
  // elle n'a jamais été modifiée entre-temps, seulement marquée.
  //
  // Les ustensiles venus de la sous-recette ne sont retirés que s'ils ne
  // servent plus : `batch_utensils` ne porte pas de lien vers la ligne
  // remplacée (une seule colonne `source_recipe_id`), donc un second
  // éclatement de la même recette ailleurs dans la fournée doit les
  // conserver. Et jamais quand la sous-recette est la recette de la fournée
  // elle-même : on supprimerait ses propres ustensiles.
  async function cancelExpansion(row: BatchIngredientRow) {
    const subRecipeId = row.expanded_into_recipe_id;
    const stepIds = batch.batch_steps.filter((s) => s.source_ingredient_id === row.id).map((s) => s.id);
    const stillUsed = batch.batch_ingredients.some((it) => it.id !== row.id && it.expanded_into_recipe_id === subRecipeId);
    const dropUtensils = !!subRecipeId && !stillUsed && subRecipeId !== batch.recipe_id;
    const supabase = createClient();
    await mutate(
      async () => {
        // Le contenu des étapes et les ustensiles ne dépendent pas les uns des
        // autres : une seule salve. Seule la suppression des étapes doit
        // attendre (leurs lignes filles d'abord), et le démarquage de
        // l'ingrédient vient en dernier — si une suppression échoue, la ligne
        // reste marquée « remplacée », donc cohérente avec ce qui subsiste
        // dans le déroulé, et l'annulation reste rejouable.
        if (stepIds.length || dropUtensils) {
          const results = await Promise.all([
            ...(stepIds.length
              ? [supabase.from('batch_ingredients').delete().in('batch_step_id', stepIds), supabase.from('batch_substeps').delete().in('batch_step_id', stepIds)]
              : []),
            ...(dropUtensils ? [supabase.from('batch_utensils').delete().eq('batch_id', batch.id).eq('source_recipe_id', subRecipeId)] : []),
          ]);
          const failed = results.find((r) => r.error);
          if (failed) return failed;
        }
        if (stepIds.length) {
          const steps = await supabase.from('batch_steps').delete().in('id', stepIds);
          if (steps.error) return steps;
        }
        return supabase.from('batch_ingredients').update({ expanded_into_recipe_id: null }).eq('id', row.id);
      },
      {
        confirm:
          `Annuler le remplacement de « ${row.name} » ?\n\n` +
          (stepIds.length ? `${stepIds.length} étape${stepIds.length > 1 ? 's' : ''} seront retirées du déroulé. ` : '') +
          "L'ingrédient revient dans la liste de courses et la mise en place.",
        errorLabel: 'Annulation impossible',
      },
    );
  }

  async function applyEditAdded(row: BatchIngredientRow, name: string, qtyStr: string, unit: string) {
    if (!name.trim()) {
      dialog.alert("Indiquez un nom d'ingrédient.");
      return;
    }
    const n = numify(qtyStr);
    setEditing(null);
    await mutate(
      () =>
        createClient()
          .from('batch_ingredients')
          .update({ name: name.trim(), quantity: n, quantity_text: n == null && qtyStr.trim() ? qtyStr.trim() : null, unit: unit.trim() || null })
          .eq('id', row.id),
      { errorLabel: 'Modification non enregistrée' },
    );
  }

  async function addIng(stepId: number, name: string, qtyStr: string, unit: string) {
    if (!name.trim()) {
      dialog.alert("Indiquez un nom d'ingrédient.");
      return;
    }
    const n = numify(qtyStr);
    const stepRows = batch.batch_ingredients.filter((it) => it.batch_step_id === stepId);
    const nextOrder = stepRows.length ? Math.max(...stepRows.map((r) => r.order_index)) + 1 : 0;
    setAddingStep(null);
    await mutate(
      () =>
        createClient()
          .from('batch_ingredients')
          .insert({
            batch_id: batch.id,
            batch_step_id: stepId,
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
  // En dessous de 640 px, la grille à 5 colonnes n'a pas la place d'accueillir
  // un nom d'ingrédient : les colonnes chiffrées (coef, deux quantités,
  // actions) occupaient déjà l'essentiel du viewport, et le nom — replié dans
  // le `minmax(0,1fr)` restant — cassait lettre par lettre. À partir de
  // `sm:`, la grille tabulaire d'origine reprend (nom qui prend la place
  // restante, colonnes chiffrées à leur largeur naturelle). En dessous, la
  // ligne devient une carte empilée : nom en pleine largeur, puis coef /
  // quantités / actions sur une ligne compacte en dessous.
  const GRID_CLASS =
    'flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(min-content,max-content)_minmax(min-content,max-content)_minmax(min-content,max-content)_max-content] sm:gap-x-8 print:grid print:grid-cols-[minmax(0,1fr)_minmax(min-content,max-content)_minmax(min-content,max-content)_minmax(min-content,max-content)_max-content] print:gap-x-8';
  // Ligne d'ingrédient : bloc empilé sur mobile, ligne de la subgrid à partir
  // de `sm:` (`col-span-full` = `grid-column: 1/-1`, la subgrid ne peut
  // s'écrire qu'en propriété arbitraire faute d'utilitaire Tailwind dédié).
  const ROW_CLASS =
    'flex flex-col gap-1 border-b border-outline-variant/30 py-2 sm:grid sm:[grid-template-columns:subgrid] sm:col-span-full sm:items-center sm:gap-0 sm:py-2';
  // Regroupe coef / quantités / actions : ligne compacte sur mobile
  // (`flex`), et sur `sm:` un `display: contents` qui efface ce wrapper pour
  // que ses enfants redeviennent des cellules directes de la subgrid.
  const META_CLASS = 'flex flex-wrap items-center gap-x-3 gap-y-1 sm:contents';
  const MOBILE_LBL = 'sm:hidden text-[10px] uppercase tracking-wide text-on-surface-variant/70 mr-1';

  const withUnit = (text: string, unit: string | null, refId?: number | null) => {
    const tip = unit ? unitTips[unit.toLowerCase().trim()] : undefined;
    const conv = ingredientConversionText(conversions, units, refId, unit, text);
    return (
      <>
        {/* Nombre et unité insécables : sur une colonne étroite, « 1650 » ne
            doit pas se retrouver sans son « ml ». La conversion reste en
            dehors pour laisser la colonne se réduire. */}
        <span className="whitespace-nowrap">
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
        </span>
        {conv && <span className="text-on-surface-variant font-body-md text-[12px]"> ({conv})</span>}
      </>
    );
  };

  const sortedSteps = [...batch.batch_steps].sort((a, b) => a.order_index - b.order_index);

  return (
    <div className="space-y-10">
      <LoadingOverlay visible={busy} label="Modification en cours…" />
      {expanding && (
        <IngredientExpandDialog
          batch={batch}
          row={expanding}
          onClose={() => setExpanding(null)}
          onDone={onExpansionDone}
        />
      )}
      {sortedSteps.map((step) => {
        const rows = batch.batch_ingredients.filter((it) => it.batch_step_id === step.id).sort((a, b) => a.order_index - b.order_index);
        if (!rows.length && addingStep !== step.id) return null;
        return (
          <div key={step.id}>
            {/* La case et l'exception par ingrédient vivent dans le déroulé
                de la recette (BatchStepDonePanel), pas ici — cette section ne
                fait plus qu'informer (titre barré, lignes grisées) de l'état
                déjà réglé là-bas. */}
            <h4
              className={`font-label-md text-label-md border-b border-outline-variant pb-2 mb-4 ${
                step.done ? 'text-on-surface-variant line-through' : batchStepIsExpansion(step) ? 'text-green-700' : 'text-secondary'
              }`}
            >
              {step.title || ''}
            </h4>
            {rows.length > 0 && (
              <ul className={GRID_CLASS}>
                <li className="hidden sm:grid sm:[grid-template-columns:subgrid] sm:col-span-full sm:items-center pb-1">
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
                  const excludedByStep = step.done && row.excluded_when_done;
                  // Ligne remplacée par une sous-recette : barrée en rouge,
                  // comme une suppression — elle ne s'achète plus, la mention
                  // verte en dessous dit où elle est fabriquée à la place.
                  const expanded = batchIngredientExpanded(row);
                  const tone = row.removed || expanded
                    ? 'text-error line-through'
                    : excludedByStep
                        ? 'text-on-surface-variant line-through opacity-60'
                        : row.added
                          ? 'text-green-700'
                          : '';
                  const adjText = row.quantity != null ? fmtNum(row.quantity) : row.quantity_text || '';
                  // Une ligne venue d'une sous-recette est `added` mais garde
                  // une quantité d'origine (celle de sa propre recette) : la
                  // montrer plutôt qu'un tiret, c'est ce qui rend son
                  // coefficient lisible.
                  const origText =
                    row.base_quantity != null ? fmtNum(row.base_quantity) : row.added ? '—' : row.quantity_text || '—';
                  return (
                    <Fragment key={row.id}>
                      <li className={ROW_CLASS}>
                        <span className={`font-body-md text-body-md break-words${tone ? ' ' + tone : ''}`}>
                          {row.url ? (
                            <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-secondary">
                              {row.name}
                            </a>
                          ) : (
                            row.name
                          )}
                          {row.comment && <span className="text-on-surface-variant text-sm italic"> — {row.comment}</span>}
                        </span>
                        <div className={META_CLASS}>
                          <span className={`font-label-md text-label-md text-center ${tone || 'text-on-surface-variant'}`}>
                            <span className={MOBILE_LBL}>Coef.</span>
                            {coef != null ? `× ${fmtNum(coef)}` : '—'}
                          </span>
                          <span className={`font-label-md text-label-md text-center ${tone || 'text-primary'}`}>{withUnit(adjText, row.unit, row.ref_id)}</span>
                          <span className={`font-label-md text-label-md text-center ${tone || 'text-on-surface-variant'}`}>
                            <span className={MOBILE_LBL}>Orig.</span>
                            {origText === '—' ? '—' : withUnit(origText, row.unit, row.ref_id)}
                          </span>
                          <span className="no-print flex items-center gap-1 ml-auto sm:ml-0 sm:justify-self-end">
                            {expanded ? (
                              // Une ligne remplacée ne se modifie plus : elle
                              // n'entre nulle part tant que le remplacement
                              // tient. Seul retour possible, l'annuler.
                              <button
                                type="button"
                                onClick={() => cancelExpansion(row)}
                                title="Annuler le remplacement et retirer les étapes ajoutées"
                                className="text-primary hover:opacity-70"
                              >
                                <span className="material-symbols-outlined text-[18px]">undo</span>
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditing(editing === key ? null : key)}
                                  title={row.added ? 'Modifier cet ajout' : 'Modifier la quantité ou le coefficient'}
                                  className="text-primary hover:opacity-70"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                                {!row.removed && (
                                  <button
                                    type="button"
                                    onClick={() => setExpanding(row)}
                                    title="Remplacer cet ingrédient par une recette (le fabriquer soi-même)"
                                    className="text-primary hover:opacity-70"
                                  >
                                    <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                                  </button>
                                )}
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
                              </>
                            )}
                          </span>
                        </div>
                      </li>
                      {expanded && (
                        <li className="pb-2 -mt-1" style={{ gridColumn: '1/-1' }}>
                          <span className="font-body-md text-[12px] text-green-700 flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                            Fabriqué à partir de{' '}
                            {row.expanded_recipe ? (
                              <Link href={`/recette/${row.expanded_recipe.id}`} className="underline underline-offset-2 hover:opacity-70">
                                {row.expanded_recipe.title}
                              </Link>
                            ) : (
                              <span className="italic">une recette qui n’est plus accessible</span>
                            )}
                            {' — étapes ajoutées au déroulé.'}
                          </span>
                        </li>
                      )}
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

function LineEditForm({ row, onApply, onCancel }: { row: BatchIngredientRow; onApply: (qty: string, coef: string) => void; onCancel: () => void }) {
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

function AddedEditForm({ row, units, onApply, onCancel }: { row: BatchIngredientRow; units: Unit[]; onApply: (name: string, qty: string, unit: string) => void; onCancel: () => void }) {
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
