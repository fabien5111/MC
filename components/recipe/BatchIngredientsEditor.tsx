'use client';

// Ingrédients d'UNE étape de fournée (porté de recette.html), montés dans le
// bloc « Ingrédients de l'étape » du mode Préparer (BatchStepDonePanel) :
// colonnes Coef. / Quantité ajustée / Quantité d'origine, lignes barrées
// (retirées) / ajoutées (vert), édition en ligne (crayon), ajout d'un
// ingrédient, case « déjà pris en compte » d'une étape réalisée. Écrit
// directement sur `batch_ingredients` (la fournée possède sa propre copie des
// ingrédients — voir CLAUDE.md « Fournées ») : chaque action est une écriture
// ciblée sur la ligne concernée, plus de blob JSON à réécrire.
//
// Écriture immédiatement reflétée partout (fiche et mode Pâtisser lisent la
// même ligne) : plus de session figée à proposer de supprimer après une
// modification, contrairement à l'ancien modèle plan + session séparés.
import { NomIngredient } from '@/components/IngredientNomsProvider';
import { Fragment, useId, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import type { Unit } from '@/lib/profile';
import {
  fmtNum,
  batchIngredientExpanded,
  batchStepReplaced,
  expandableGroup,
  expandedGroup,
  type BatchFull,
  type BatchIngredientRow,
} from '@/lib/recipe-plan';
import { ingredientConversionText, resolveIngredientRefId, type ConversionRef, type IngredientRefOption } from '@/lib/ingredient-conversions';
import { fixOeufLigature } from '@/lib/text';
import { IngredientExpandDialog } from '@/components/recipe/IngredientExpandDialog';
import { LockedAction } from '@/components/LockedAction';

type EditKey = number | null; // id de la ligne en cours de modification
type StepRow = BatchFull['batch_steps'][number];

const numify = (v: string): number | null => {
  const n = parseFloat(v.replace(',', '.'));
  return isNaN(n) ? null : n;
};
const round2 = (n: number): number => +n.toFixed(2);

export function BatchStepIngredients({
  batch,
  step,
  units,
  unitTips,
  conversions,
  ingredientRefs = [],
  refAllergens = {},
  allergenNames = [],
  canReplaceIngredient = true,
}: {
  batch: BatchFull;
  step: StepRow;
  units: Unit[];
  unitTips: Record<string, string>;
  conversions: ConversionRef[];
  // Référentiel des ingrédients (suggestions du nom + rattachement `ref_id`),
  // allergènes par ingrédient (nom en minuscules → « a, b ») et libellés des
  // allergènes — pour la saisie d'un ingrédient ajouté à la main (JEP-368).
  ingredientRefs?: IngredientRefOption[];
  refAllergens?: Record<string, string>;
  allergenNames?: string[];
  // Droit d'abonnement (`remplacement_ingredient_par_recette`). Défaut à
  // `true` pour l'appelant qui ne le passe pas encore.
  canReplaceIngredient?: boolean;
}) {
  const { mutate, busy, refresh } = useMutation();
  const dialog = useDialog();
  const [editing, setEditing] = useState<EditKey>(null);
  const [adding, setAdding] = useState(false);
  const datalistId = useId();
  // Groupe en cours de remplacement par une sous-recette (fenêtre ouverte) —
  // toutes les occurrences du même ingrédient (nom + unité), pas seulement
  // celle cliquée (JEP-254).
  const [expanding, setExpanding] = useState<BatchIngredientRow[] | null>(null);

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
    // Toutes les occurrences du même remplacement (JEP-254) : annuler depuis
    // N'IMPORTE LAQUELLE retire les étapes insérées ET rétablit TOUTES les
    // occurrences d'un coup — sinon les autres resteraient marquées
    // « fabriquées » alors que les étapes qui les fabriquent auraient
    // disparu.
    const group = expandedGroup(batch, row);
    const groupIds = group.map((it) => it.id);
    const stepIds = batch.batch_steps.filter((s) => s.source_ingredient_id != null && groupIds.includes(s.source_ingredient_id)).map((s) => s.id);
    const stillUsed = batch.batch_ingredients.some((it) => !groupIds.includes(it.id) && it.expanded_into_recipe_id === subRecipeId);
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
        return supabase.from('batch_ingredients').update({ expanded_into_recipe_id: null }).in('id', groupIds);
      },
      {
        confirm:
          `Annuler le remplacement de « ${row.name} » ?\n\n` +
          (group.length > 1 ? `${group.length} étapes utilisent cet ingrédient, toutes seront rétablies. ` : '') +
          (stepIds.length ? `${stepIds.length} étape${stepIds.length > 1 ? 's' : ''} seront retirées du déroulé. ` : '') +
          "L'ingrédient revient dans la liste de courses et la mise en place.",
        errorLabel: 'Annulation impossible',
      },
    );
  }

  // Colonnes écrites pour un ingrédient ajouté à la main : « oeuf » → « œuf »
  // et rattachement au référentiel (`ref_id`, `resolveIngredientRefId`), pour
  // que conversions et fusion des courses s'appliquent (JEP-368).
  function addedColumns(v: AddedValues) {
    const name = fixOeufLigature(v.name.trim());
    const n = numify(v.qty);
    return {
      name,
      quantity: n,
      quantity_text: n == null && v.qty.trim() ? v.qty.trim() : null,
      unit: v.unit.trim() || null,
      comment: v.comment.trim() || null,
      allergen: v.allergen,
      ref_id: resolveIngredientRefId(name, ingredientRefs),
    };
  }

  async function applyEditAdded(row: BatchIngredientRow, v: AddedValues) {
    if (!v.name.trim()) {
      dialog.alert("Indiquez un nom d'ingrédient.");
      return;
    }
    setEditing(null);
    await mutate(
      () =>
        createClient()
          .from('batch_ingredients')
          .update(addedColumns(v))
          .eq('id', row.id),
      { errorLabel: 'Modification non enregistrée' },
    );
  }

  // Case « déjà pris en compte » d'une étape réalisée : exception ligne par
  // ligne (cf. CLAUDE.md « Étape déjà faite »), jamais en basculant `removed`.
  async function toggleExcluded(row: BatchIngredientRow) {
    await mutate(() => createClient().from('batch_ingredients').update({ excluded_when_done: !row.excluded_when_done } as never).eq('id', row.id), {
      errorLabel: 'Modification non enregistrée',
    });
  }

  async function addIng(v: AddedValues) {
    if (!v.name.trim()) {
      dialog.alert("Indiquez un nom d'ingrédient.");
      return;
    }
    const stepRows = batch.batch_ingredients.filter((it) => it.batch_step_id === step.id);
    const nextOrder = stepRows.length ? Math.max(...stepRows.map((r) => r.order_index)) + 1 : 0;
    setAdding(false);
    await mutate(
      () =>
        createClient()
          .from('batch_ingredients')
          .insert({
            batch_id: batch.id,
            batch_step_id: step.id,
            order_index: nextOrder,
            ...addedColumns(v),
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

  const rows = batch.batch_ingredients.filter((it) => it.batch_step_id === step.id).sort((a, b) => a.order_index - b.order_index);

  return (
    <div>
      <LoadingOverlay visible={busy} label="Modification en cours…" />
      {/* Suggestions du nom : montées seulement quand un formulaire est ouvert —
          chaque étape porte un éditeur, la liste du référentiel serait sinon
          recopiée dans le DOM autant de fois qu'il y a d'étapes. */}
      {(adding || editing != null) && ingredientRefs.length > 0 && (
        <datalist id={datalistId}>
          {ingredientRefs.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>
      )}
      {expanding && (
        <IngredientExpandDialog
          batch={batch}
          rows={expanding}
          onClose={() => setExpanding(null)}
          onDone={onExpansionDone}
        />
      )}
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
            const coef = row.base_quantity && row.quantity != null ? round2(row.quantity / row.base_quantity) : null;
            // `removed` prime toujours sur l'exclusion « déjà fait ». Une
            // étape remplacée (cf. BatchView) exclut aussi toutes ses
            // lignes, quel que soit `excluded_when_done` — même rendu
            // grisé que « déjà fait », l'exclusion n'étant pas propre à
            // la ligne mais à l'étape entière.
            const excludedByStep = (step.done && row.excluded_when_done) || batchStepReplaced(step);
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
                  <span className="flex items-start gap-3 min-w-0">
                    {/* Étape réalisée : la case « déjà pris en compte » vit ici,
                        à la ligne de l'ingrédient (décochée = gardé quand même
                        dans le parcours). Rien à cocher sur une ligne retirée ou
                        remplacée par une sous-recette : elle n'y entre plus. */}
                    {step.done && (
                      <span className="no-print w-5 shrink-0 pt-0.5">
                        {!expanded && !row.removed && (
                          <input
                            type="checkbox"
                            checked={row.excluded_when_done}
                            onChange={() => toggleExcluded(row)}
                            title={
                              row.excluded_when_done
                                ? 'Déjà pris en compte — décocher pour le conserver quand même (ex. un ingrédient utile plus tard dans la même étape)'
                                : 'Conservé malgré l’étape déjà réalisée'
                            }
                            className="w-5 h-5 rounded border-outline accent-primary focus:ring-primary cursor-pointer"
                          />
                        )}
                      </span>
                    )}
                  <span className={`font-body-md text-body-md break-words${tone ? ' ' + tone : ''}`}>
                    {row.url ? (
                      <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-secondary">
                        <NomIngredient nom={row.name} quantite={row.quantity ?? row.quantity_text} unite={row.unit} refId={row.ref_id} />
                      </a>
                    ) : (
                      <NomIngredient nom={row.name} quantite={row.quantity ?? row.quantity_text} unite={row.unit} refId={row.ref_id} />
                    )}
                    {row.comment && <span className="text-on-surface-variant text-sm italic"> — {row.comment}</span>}
                  </span>
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
                            onClick={() => setEditing(editing === row.id ? null : row.id)}
                            title={row.added ? 'Modifier cet ajout' : 'Modifier la quantité ou le coefficient'}
                            className="text-primary hover:opacity-70"
                          >
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          {/* Un remplacement déjà en place (cf. le bouton `undo`
                              ci-dessus) reste géré même sans le droit — seul en
                              DÉMARRER un nouveau est bridé (§7.4). */}
                          {!row.removed &&
                            !batchStepReplaced(step) &&
                            (canReplaceIngredient ? (
                              <button
                                type="button"
                                onClick={() => setExpanding(expandableGroup(batch, row.name, row.unit))}
                                title="Remplacer cet ingrédient par une recette (le fabriquer soi-même, y compris dans les autres étapes qui l’utilisent)"
                                className="text-primary hover:opacity-70"
                              >
                                <span className="material-symbols-outlined text-[18px]">swap_horiz</span>
                              </button>
                            ) : (
                              // JEP-130 : le picto n'apparaissait pas
                              // du tout — « je fabrique moi-même cet
                              // ingrédient » est pourtant l'une des
                              // fonctionnalités les plus
                              // distinctives du produit, et rien ne
                              // l'annonçait à qui n'y a pas droit.
                              <LockedAction
                                label="Remplacer cet ingrédient par une recette"
                                message="Remplacer un ingrédient par une recette (le fabriquer soi-même) n'est pas inclus dans votre formule."
                              />
                            ))}
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
                {editing === row.id &&
                  (row.added ? (
                    <li key={row.id + '-form'} style={{ gridColumn: '1/-1' }}>
                      <AddedIngredientForm
                        initial={row}
                        units={units}
                        datalistId={datalistId}
                        allergenNames={allergenNames}
                        refAllergens={refAllergens}
                        submitLabel="OK"
                        onSubmit={(v) => applyEditAdded(row, v)}
                        onCancel={() => setEditing(null)}
                      />
                    </li>
                  ) : (
                    <LineEditForm key={row.id + '-form'} row={row} onApply={(q, c) => applyEdit(row, q, c)} onCancel={() => setEditing(null)} />
                  ))}
              </Fragment>
            );
          })}
        </ul>
      )}
      {adding ? (
        <AddedIngredientForm
          units={units}
          datalistId={datalistId}
          allergenNames={allergenNames}
          refAllergens={refAllergens}
          submitLabel="Ajouter"
          autoFocus
          onSubmit={(v) => addIng(v)}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="no-print mt-3 flex items-center gap-1 text-primary font-label-md text-[12px] hover:underline">
          <span className="material-symbols-outlined text-[16px]">add_circle</span> Ajouter un ingrédient
        </button>
      )}
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

// Valeurs saisies pour un ingrédient ajouté à la main (ajout ou modification).
type AddedValues = { name: string; qty: string; unit: string; comment: string; allergen: string | null };

// Découpe la valeur stockée (« a, b ») en liste d'allergènes (max 3) — même
// règle que `parseAllergens` de CreerForm.
const MAX_ALLERGENS = 3;
const parseAllergens = (raw: string | null | undefined): string[] =>
  (raw || '')
    .split(/[,;/]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, MAX_ALLERGENS);
const joinAllergens = (l: string[]): string | null => (l.length ? l.join(', ') : null);

// Commentaire qui grandit avec son texte — même geste que `autoGrow` de CreerForm.
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  // `scrollHeight` ne compte pas la bordure : sans elle le champ restait 2 px
  // trop court, donc désaligné de ses voisins.
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}

// Saisie d'un ingrédient ajouté à la main (JEP-368) : nom proposé depuis le
// référentiel (datalist), quantité, unité, commentaire et allergènes — les
// mêmes champs que l'éditeur de recette. Choisir un ingrédient du référentiel
// pré-remplit ses allergènes, comme dans `/creer`.
function AddedIngredientForm({
  initial,
  units,
  datalistId,
  allergenNames,
  refAllergens,
  submitLabel,
  autoFocus,
  onSubmit,
  onCancel,
}: {
  initial?: BatchIngredientRow;
  units: Unit[];
  datalistId?: string;
  allergenNames: string[];
  refAllergens: Record<string, string>;
  submitLabel: string;
  autoFocus?: boolean;
  onSubmit: (v: AddedValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [qty, setQty] = useState(initial ? (initial.quantity != null ? fmtNum(initial.quantity) : initial.quantity_text || '') : '');
  const [unit, setUnit] = useState(initial?.unit || '');
  const [comment, setComment] = useState(initial?.comment || '');
  const [allergens, setAllergens] = useState<string[]>(parseAllergens(initial?.allergen));
  const onName = (v: string) => {
    setName(v);
    const key = v.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(refAllergens, key)) setAllergens(parseAllergens(refAllergens[key]));
  };
  const free = allergenNames.filter((a) => !allergens.includes(a));
  // Le « + » des allergènes déplie une liste (comme le premier choix) — la
  // fenêtre à pastilles de `/creer` serait de trop pour une ligne isolée.
  const [moreAllergen, setMoreAllergen] = useState(false);
  const addAllergen = (v: string) => {
    if (v && !allergens.includes(v) && allergens.length < MAX_ALLERGENS) setAllergens([...allergens, v]);
    setMoreAllergen(false);
  };
  const allergenSelect = (
    <select
      value=""
      onChange={(e) => addAllergen(e.target.value)}
      className="editorial-input text-on-surface cursor-pointer italic h-[42px] max-md:h-[38px] w-auto xl:w-full"
      title="Ajouter un allergène (table de référence)"
    >
      <option value="">Allergène (optionnel)</option>
      {free.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </select>
  );
  // Même ligne que l'éditeur de recette (`CreerForm`) : nom, quantité, unité,
  // allergènes, commentaire — empilés sous `xl`, sur une ligne au-delà.
  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap xl:flex-nowrap items-center xl:items-start gap-x-4 gap-y-1.5">
        <div className="relative flex-[2] min-w-0">
          <input
            value={name}
            onChange={(e) => onName(e.target.value)}
            list={datalistId}
            autoComplete="off"
            placeholder="Ingrédient"
            className="editorial-input text-on-surface w-full"
            type="text"
            autoFocus={autoFocus}
          />
        </div>
        <input value={qty} onChange={(e) => setQty(e.target.value)} className="w-16 xl:w-20 editorial-input text-on-surface" type="text" inputMode="decimal" placeholder="Qté" />
        <select value={unit} onChange={(e) => setUnit(e.target.value)} className="editorial-input text-on-surface cursor-pointer h-[42px] max-md:h-[38px]" style={{ width: 'auto' }}>
          <option value=""></option>
          {units.map((u) => (
            <option key={u.id} value={u.name}>
              {u.name}
            </option>
          ))}
          {unit && !units.some((u) => u.name === unit) && <option value={unit}>{unit}</option>}
        </select>
        <div className="basis-full xl:hidden" />
        <div className="flex-[3] min-w-0 order-1 xl:order-2">
          <textarea
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              autoGrow(e.target);
            }}
            ref={autoGrow}
            className="editorial-input text-on-surface w-full resize-none overflow-hidden block"
            rows={1}
            placeholder="Commentaire (optionnel)"
          />
        </div>
        <div className="basis-full xl:hidden order-2" />
        <div className="flex-1 min-w-0 order-3 xl:order-1 xl:flex-none xl:w-56 xl:min-h-[42px] xl:flex xl:items-center">
          <span className="xl:hidden block font-label-md text-[10px] uppercase tracking-widest text-outline mb-1">Allergènes</span>
          <div className="flex flex-wrap items-center gap-1 xl:w-full">
            {allergens.map((a) => (
              <span key={a} className="inline-flex items-center gap-0.5 bg-secondary-fixed text-on-secondary-fixed rounded-full pl-2 pr-0.5 py-0.5 text-[12px]">
                {a}
                <button type="button" title="Retirer" onClick={() => setAllergens(allergens.filter((x) => x !== a))} className="hover:text-error transition-colors">
                  <span className="material-symbols-outlined text-[14px] align-middle">close</span>
                </button>
              </span>
            ))}
            {allergens.length === 0
              ? allergenSelect
              : allergens.length < MAX_ALLERGENS &&
                free.length > 0 &&
                (moreAllergen ? (
                  allergenSelect
                ) : (
                  <button
                    type="button"
                    title="Ajouter un allergène"
                    onClick={() => setMoreAllergen(true)}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-outline-variant text-primary hover:bg-primary-container transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                  </button>
                ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onSubmit({ name, qty, unit, comment, allergen: joinAllergens(allergens) })}
          className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px]"
        >
          {submitLabel}
        </button>
        <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
          Annuler
        </button>
      </div>
    </div>
  );
}
