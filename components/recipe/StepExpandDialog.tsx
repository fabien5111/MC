'use client';

// « Remplacer une étape par une recette » — sur la fiche d'une fournée : la
// pâte sucrée de la recette devient une pâte sucrée fabriquée à partir d'une
// autre recette de l'application, dont les étapes viennent s'insérer dans le
// déroulé de la fournée. Même principe que le remplacement d'un ingrédient
// (IngredientExpandDialog), transposé à une étape entière — cf. CLAUDE.md
// « Fournées » § « Étape remplacée par une recette ».
//
// Différence avec le remplacement d'un ingrédient : une étape ne porte pas de
// quantité cible (contrairement à un ingrédient, qui a une quantité + une
// unité qui permettent de déduire un coefficient). On estime donc un poids
// pour l'étape remplacée (`estimateWeightGrams`, somme des lignes déjà en
// g/kg et de celles convertibles via le référentiel — jamais une densité
// générique pour un liquide) et, si la recette de remplacement annonce un
// rendement en g/kg, on en déduit un coefficient proposé, comme pour un
// ingrédient. Sinon (rendement moule/dimensions, ou rien à estimer), le
// coefficient se saisit à la main, initialisé au facteur d'ajustement déjà
// appliqué à la fournée.
//
// Le parcours et l'écriture (recherche → positionnement → insertion
// séquentielle annulée en bloc au moindre échec) reprennent exactement le
// motif d'IngredientExpandDialog.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { formatTime } from '@/lib/format';
import { UNITS_LBL, dayLabel, effectiveTimes } from '@/lib/recipe-view';
import { estimateWeightGrams, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';
import {
  batchFactor,
  computeInsertOrderIndexes,
  fmtNum,
  materializeBatch,
  batchDayLabel,
  suggestedExpansionDay,
  RECIPE_SOURCE_SELECT,
  type BatchFull,
  type BatchStepRow,
  type RecipeSource,
} from '@/lib/recipe-plan';

type PickerItem = {
  id: string;
  title: string;
  status: string | null;
  is_public: boolean | null;
  author_id: string;
  measure_type: string | null;
  yield_qty: string | null;
  yield_unit: string | null;
  yield_desc: string | null;
  prep_time: number | null;
  cook_time: number | null;
  wait_time: number | null;
  total_time: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  profiles: { full_name: string | null } | null;
  recipe_types: { name: string } | null;
  difficulties: { name: string; level: number } | null;
  recipe_steps: { prep_time: number | null; cook_time: number | null; wait_time: number | null }[];
};

type Scope = 'mine' | 'fav' | 'all';
const SCOPE_LABELS: Record<Scope, string> = { mine: 'Mes recettes', fav: 'Mes favoris', all: 'Toutes les recettes' };

type Placement = { anchor: number | null; day: number; suggested: number };

const num = (v: string | number | null | undefined): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

const INPUT = 'border border-outline-variant rounded px-3 py-2 bg-white font-body-md text-sm text-on-surface focus:outline-none focus:border-primary';
const LBL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

export function StepExpandDialog({
  batch,
  step,
  conversions,
  units,
  ingredientDensities,
  onClose,
  onDone,
}: {
  batch: BatchFull;
  // Étape à remplacer (jamais déjà remplacée, jamais déjà `done` : le
  // déclencheur disparaît dans ces cas, cf. BatchView).
  step: BatchStepRow;
  // Référentiel de conversions d'unités, pour estimer le poids de l'étape
  // remplacée (cf. `estimateWeightGrams`).
  conversions: ConversionRef[];
  units: UnitRef[];
  // Masse volumique par nom d'ingrédient (lib/recipes.ts
  // `getIngredientDensities`) — repli quand la ligne d'ingrédient de la
  // fournée n'a pas de `ref_id` propre (cf. `estimateWeightGrams`).
  ingredientDensities: { name: string; density_g_per_ml: number }[];
  onClose: () => void;
  // Écriture aboutie — le parent resynchronise la fiche.
  onDone: () => void | Promise<void>;
}) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();

  const [stage, setStage] = useState<'search' | 'setup'>('search');
  const [loading, setLoading] = useState(false);

  // ── Étape 1 : recherche ────────────────────────────────────────────────
  const [term, setTerm] = useState('');
  const [scopes, setScopes] = useState<Set<Scope>>(new Set<Scope>(['mine', 'fav']));
  const [items, setItems] = useState<PickerItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [hasSearchedOnce, setHasSearchedOnce] = useState(false);
  const hasSearchedOnceRef = useRef(false);

  useEffect(() => {
    if (stage !== 'search') return;
    const params = new URLSearchParams({ scopes: [...scopes].join(','), q: term.trim() });
    const controller = new AbortController();
    const t = setTimeout(
      async () => {
        setSearching(true);
        setSearchError(null);
        try {
          const resp = await fetch(`/api/recipes/picker?${params.toString()}`, { signal: controller.signal });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.erreur || `Erreur ${resp.status}`);
          setItems(data.items as PickerItem[]);
          setSearching(false);
          hasSearchedOnceRef.current = true;
          setHasSearchedOnce(true);
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          setItems([]);
          setSearchError((e as Error).message);
          setSearching(false);
          hasSearchedOnceRef.current = true;
          setHasSearchedOnce(true);
        }
      },
      hasSearchedOnceRef.current ? 300 : 0,
    );
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [term, scopes, stage]);

  function toggleScope(s: Scope) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  // ── Étape 2 : coefficient + positionnement ─────────────────────────────
  const [source, setSource] = useState<RecipeSource | null>(null);
  const [coefStr, setCoefStr] = useState('1');
  const [placements, setPlacements] = useState<Placement[]>([]);

  const sortedBatchSteps = useMemo(() => [...batch.batch_steps].sort((a, b) => a.order_index - b.order_index), [batch.batch_steps]);
  const batchOrders = useMemo(() => sortedBatchSteps.map((s) => s.order_index), [sortedBatchSteps]);
  const replacedIndex = sortedBatchSteps.findIndex((s) => s.id === step.id);

  const dayOptions = useMemo(() => {
    const used = batch.batch_steps.flatMap((s) => [Math.max(0, s.day_offset || 0), Math.max(0, s.base_day_offset ?? 0)]);
    const max = Math.max(0, ...used) + 2;
    return Array.from({ length: max + 1 }, (_, i) => i);
  }, [batch.batch_steps]);

  const dayText = (offset: number) => (batch.planned_date ? batchDayLabel(offset, batch.planned_date) : dayLabel(offset));

  // Poids estimé de l'étape remplacée (cf. `estimateWeightGrams`) : sert de
  // repère pour choisir le coefficient, faute de quantité cible propre à une
  // étape (contrairement à un ingrédient). Ne dépend pas de la recette
  // choisie — calculé une fois pour toute la fenêtre.
  const stepIngredients = useMemo(() => batch.batch_ingredients.filter((it) => it.batch_step_id === step.id), [batch.batch_ingredients, step.id]);
  const weightEstimate = useMemo(
    () => estimateWeightGrams(stepIngredients, conversions, units, ingredientDensities),
    [stepIngredients, conversions, units, ingredientDensities],
  );

  // Rendement de la recette choisie exprimé en grammes, s'il est annoncé en
  // g ou kg (codes de `recipes.yield_unit`, cf. lib/recipe-view.ts
  // UNITS_LBL) — seul cas où le poids estimé de l'étape permet de déduire un
  // coefficient par défaut, comme pour un ingrédient remplacé. Le champ reste
  // un coefficient ordinaire, modifiable dans tous les cas : ceci ne sert
  // qu'à proposer une valeur de départ.
  function recipeYieldGrams(rec: Pick<RecipeSource, 'measure_type' | 'yield_qty' | 'yield_unit'>): number | null {
    if (rec.measure_type !== 'units') return null;
    const qty = num(rec.yield_qty);
    if (qty == null || qty <= 0) return null;
    if (rec.yield_unit === 'g') return qty;
    if (rec.yield_unit === 'kg') return qty * 1000;
    return null;
  }

  // Charge le contenu de la recette choisie et prépare les valeurs par
  // défaut : étapes posées juste avant l'étape remplacée (qui reste ensuite
  // affichée barrée, à sa place), dans leur ordre. Coefficient proposé à
  // partir du poids estimé de l'étape si la recette annonce un rendement en
  // g/kg, sinon initialisé au facteur d'ajustement déjà appliqué à la
  // fournée — dans tous les cas, une valeur de départ modifiable.
  async function selectRecipe(item: PickerItem) {
    setLoading(true);
    const { data, error } = await createClient().from('recipes').select(RECIPE_SOURCE_SELECT).eq('id', item.id).maybeSingle();
    setLoading(false);
    if (error || !data) {
      dialog.alert('Recette illisible : ' + (error?.message || 'contenu introuvable'));
      return;
    }
    const rec = data as unknown as RecipeSource;
    if (!(rec.recipe_steps || []).length) {
      dialog.alert(`« ${rec.title} » n'a aucune étape : il n'y a rien à insérer dans le déroulé.`);
      return;
    }
    const steps = [...rec.recipe_steps].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const defaultAnchor = replacedIndex > 0 ? sortedBatchSteps[replacedIndex - 1].order_index : null;
    const yieldGrams = recipeYieldGrams(rec);
    const defaultCoef = weightEstimate.grams > 0 && yieldGrams ? Math.round((weightEstimate.grams / yieldGrams) * 1000) / 1000 : batchFactor(batch);
    setSource(rec);
    setCoefStr(fmtNum(defaultCoef));
    setPlacements(
      steps.map((s) => {
        const suggested = suggestedExpansionDay(step.day_offset ?? 0, s.day_offset || 0);
        return { anchor: defaultAnchor, day: suggested, suggested };
      }),
    );
    setStage('setup');
  }

  const factor = useMemo(() => {
    const c = num(coefStr);
    return c && c > 0 ? Math.round(c * 1000) / 1000 : 0;
  }, [coefStr]);

  const mat = useMemo(() => (source && factor > 0 ? materializeBatch(source, { factor }) : null), [source, factor]);

  const utensilsToAdd = useMemo(() => {
    if (!mat) return [];
    const known = new Set(batch.batch_utensils.map((u) => u.name.toLowerCase().trim()));
    return mat.utensils.filter((u) => u.name && !known.has(u.name.toLowerCase().trim()));
  }, [mat, batch.batch_utensils]);

  const addedTime = mat ? mat.steps.reduce((n, s) => n + (s.prep_time || 0) + (s.wait_time || 0) + (s.cook_time || 0), 0) : 0;
  const addedIngredients = mat ? mat.steps.reduce((n, s) => n + s.ingredients.length, 0) : 0;

  function setPlacement(i: number, patch: Partial<Placement>) {
    setPlacements((prev) => prev.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  }

  // ── Écriture ───────────────────────────────────────────────────────────
  async function insert() {
    if (!source || !mat) return;
    if (step.done || step.replaced_by_recipe_id != null) {
      dialog.alert('Cette étape ne peut plus être remplacée.');
      return;
    }
    if (factor <= 0) {
      dialog.alert('Indiquez un coefficient valide.');
      return;
    }
    const orders = computeInsertOrderIndexes(batchOrders, placements.map((p) => p.anchor));
    const supabase = createClient();
    const createdSteps: number[] = [];
    const createdUtensils: number[] = [];

    const ok = await mutate(
      async () => {
        try {
          // `source_replaced_step_id` (au lieu de `source_ingredient_id`)
          // absente de lib/database.types.ts tant que la migration n'a pas
          // été régénérée (npm run gen:types) — cast `as any`, même motif que
          // `review_dismissed` (cf. CLAUDE.md).
          const { data: stepRows, error: stepErr } = await (supabase as any)
            .from('batch_steps')
            .insert(
              mat.steps.map((st, i) => ({
                batch_id: batch.id,
                order_index: orders[i],
                day_offset: placements[i].day,
                base_day_offset: placements[i].suggested,
                title: st.title,
                description: st.description,
                tips: st.tips,
                video_url: st.video_url,
                prep_time: st.prep_time,
                cook_time: st.cook_time,
                wait_time: st.wait_time,
                cook_temp: st.cook_temp,
                scaling_mode: st.scaling_mode,
                source_recipe_id: source.id,
                source_step_id: st.source_step_id,
                source_replaced_step_id: step.id,
              })),
            )
            .select('id, source_step_id');
          if (stepErr || !stepRows) throw stepErr || new Error('Étapes non créées');
          stepRows.forEach((s: { id: number }) => createdSteps.push(s.id));

          const idBySourceStep = new Map(stepRows.map((s: { id: number; source_step_id: number }) => [s.source_step_id, s.id]));
          const stepIdOf = (sourceStepId: number): number => {
            const id = idBySourceStep.get(sourceStepId);
            if (id == null) throw new Error('Étape insérée introuvable');
            return id as number;
          };

          const substeps = mat.steps.flatMap((st) =>
            st.substeps.map((texte, k) => ({ batch_step_id: stepIdOf(st.source_step_id), order_index: k, texte })),
          );
          if (substeps.length) {
            const { error } = await supabase.from('batch_substeps').insert(substeps);
            if (error) throw error;
          }

          const ingredients = mat.steps.flatMap((st) =>
            st.ingredients.map((it) => ({
              batch_id: batch.id,
              batch_step_id: stepIdOf(st.source_step_id),
              order_index: it.order_index,
              ref_id: it.ref_id,
              name: it.name,
              base_quantity: it.base_quantity,
              quantity: it.quantity,
              quantity_text: it.quantity_text,
              unit: it.unit,
              comment: it.comment,
              url: it.url,
              allergen: it.allergen,
              source_recipe_id: source.id,
              added: true,
            })),
          );
          if (ingredients.length) {
            const { error } = await supabase.from('batch_ingredients').insert(ingredients);
            if (error) throw error;
          }

          if (utensilsToAdd.length) {
            const { data, error } = await supabase
              .from('batch_utensils')
              .insert(
                utensilsToAdd.map((u) => ({
                  batch_id: batch.id,
                  order_index: u.order_index,
                  name: u.name,
                  comment: u.comment,
                  url: u.url,
                  source_recipe_id: source.id,
                })),
              )
              .select('id');
            if (error) throw error;
            (data ?? []).forEach((u) => createdUtensils.push(u.id));
          }

          // En dernier : tant que l'étape n'est pas marquée, le remplacement
          // n'a pas eu lieu du point de vue de la fiche — un échec en amont se
          // rattrape donc par la seule suppression de ce qui a été inséré.
          const { error } = await (supabase as any).from('batch_steps').update({ replaced_by_recipe_id: source.id }).eq('id', step.id);
          if (error) throw error;
          return { error: null };
        } catch (e) {
          await rollback(supabase, createdSteps, createdUtensils);
          return { error: { message: (e as Error).message || 'insertion impossible' } };
        }
      },
      // Resynchronisation portée par le parent (fenêtre fermée dans la
      // foulée) — même motif qu'IngredientExpandDialog.
      { errorLabel: 'Remplacement impossible', refresh: false },
    );

    if (ok) {
      void onDone();
      onClose();
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Remplacer une étape par une recette"
      className="fixed inset-0 z-[95] flex items-start justify-center bg-background/60 backdrop-blur-[2px] p-4 overflow-y-auto"
      onClick={onClose}
    >
      <LoadingOverlay visible={(searching && !hasSearchedOnce) || loading || busy} label={busy ? 'Insertion des étapes…' : 'Chargement…'} />
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl my-8 bg-surface-container-low border border-outline-variant rounded-xl shadow-lg flex flex-col"
      >
        <div className="flex items-start justify-between gap-4 p-6 border-b border-outline-variant">
          <div className="flex flex-col gap-1">
            <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-3">
              <span className="material-symbols-outlined">swap_horiz</span>
              Remplacer par une recette
            </h3>
            <p className="font-body-md text-sm text-on-surface-variant">
              L&apos;étape <span className="font-semibold text-on-surface">{step.title || 'sans titre'}</span> — à fabriquer à
              partir d&apos;une recette de l&apos;application.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {stage === 'search' ? (
          <div className="p-6 flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <label className={LBL} htmlFor="step-expand-search">
                Chercher une recette
              </label>
              <input
                id="step-expand-search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                autoFocus
                placeholder="ex : pâte sucrée"
                className={INPUT}
              />
              <div className="flex flex-wrap gap-4">
                {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
                  <label key={s} className="flex items-center gap-2 cursor-pointer font-body-md text-sm">
                    <input
                      type="checkbox"
                      checked={scopes.has(s)}
                      onChange={() => toggleScope(s)}
                      className="w-5 h-5 rounded border-outline accent-primary cursor-pointer"
                    />
                    {SCOPE_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>

            {searchError && <p className="font-body-md text-sm text-error">Recherche impossible : {searchError}</p>}
            {!searchError && !scopes.size && (
              <p className="font-body-md text-sm text-on-surface-variant italic">Cochez au moins une portée de recherche.</p>
            )}
            {!searchError && scopes.size > 0 && !items.length && !searching && hasSearchedOnce && (
              <p className="font-body-md text-sm text-on-surface-variant italic">Aucune recette ne correspond.</p>
            )}

            <ul className="flex flex-col divide-y divide-outline-variant/40 max-h-[45vh] overflow-y-auto">
              {items.map((it) => (
                <li key={it.id}>
                  <button type="button" onClick={() => selectRecipe(it)} className="w-full text-left py-3 px-2 hover:bg-surface-container transition-colors flex flex-col gap-1">
                    <span className="flex items-center gap-3 flex-wrap">
                      <span className="font-body-lg text-body-lg text-primary">{it.title}</span>
                      <StatusBadge item={it} />
                    </span>
                    <span className="font-body-md text-[12px] text-on-surface-variant flex items-center gap-3 flex-wrap">
                      <span>Par {it.profiles?.full_name || 'Auteur'}</span>
                      {it.recipe_types?.name && <span>· {it.recipe_types.name}</span>}
                      {it.difficulties?.name && <span>· {it.difficulties.name}</span>}
                      <span>· {formatTime(totalTime(it))}</span>
                      {yieldText(it) && <span>· {yieldText(it)}</span>}
                      {(it.rating_count || 0) > 0 && (
                        <span>
                          · {Number(it.rating_avg || 0).toFixed(1)}/5 ({it.rating_count})
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : source ? (
          <div className="p-6 flex flex-col gap-6">
            {/* Phrase unique : quelle étape, quelle quantité (ou quel
                coefficient, faute de rendement chiffré), par quelle recette
                — le rendement de la recette entre parenthèses est le seul
                repère pour juger si la quantité saisie est plausible. */}
            <div className="flex flex-col gap-2">
              <p className="font-body-lg text-body-lg text-on-surface leading-relaxed">
                Remplacer l&apos;étape : <span className="font-semibold text-primary">{step.title || 'sans titre'}</span>
                {weightEstimate.grams > 0 ? (
                  <>
                    {' '}(poids estimé : <span className="font-semibold">≈ {weightEstimate.grams} g</span>
                    {weightEstimate.unconverted.length > 0 ? ', estimation partielle' : ''})
                  </>
                ) : weightEstimate.unconverted.length > 0 ? (
                  <> (poids non estimable)</>
                ) : null}
                .
              </p>
              <p className="font-body-lg text-body-lg text-on-surface leading-relaxed">
                par la recette : <span className="font-semibold text-primary">{source.title}</span> — coefficient :{' '}
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={coefStr}
                  onChange={(e) => setCoefStr(e.target.value)}
                  className={INPUT}
                  style={{ width: '5rem', display: 'inline-block' }}
                />{' '}
                (
                {source.yield_desc
                  ? `la recette fournit ${source.yield_desc} de base`
                  : source.yield_qty
                    ? `la recette fournit ${source.yield_qty} ${UNITS_LBL[source.yield_unit || ''] || source.yield_unit || ''} de base`.trim()
                    : 'rendement non précisé'}
                ).
              </p>
              <button
                type="button"
                onClick={() => {
                  setSource(null);
                  setStage('search');
                }}
                className="self-start font-label-md text-[12px] text-primary hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>Changer de recette
              </button>
            </div>

            {/* Ingrédients en cause quand l'estimation est incomplète ou
                impossible, avec leur quantité dans l'étape, pour que
                l'utilisateur puisse les prendre en compte à la main en
                choisissant son coefficient. Toujours qualifiée d'estimation
                (cf. estimateWeightGrams). */}
            {weightEstimate.unconverted.length > 0 && (
              <div className="border border-outline-variant rounded-lg p-4 flex flex-col gap-2 bg-surface-container">
                <p className="font-body-md text-sm text-on-surface-variant italic">
                  {weightEstimate.grams > 0
                    ? 'Ingrédients non pris en compte dans cette estimation (poids inconnu) :'
                    : 'Poids non estimable pour cette étape — ingrédients dont le poids est inconnu :'}
                </p>
                <ul className="font-body-md text-sm text-on-surface list-disc pl-5">
                  {weightEstimate.unconverted.map((u, i) => (
                    <li key={i}>
                      {u.name}
                      {u.quantity != null || u.unit ? (
                        <>
                          {' '}
                          — {u.quantity != null ? fmtNum(u.quantity) : ''} {u.unit || ''}
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Positionnement de chaque étape */}
            <div className="flex flex-col gap-3">
              <span className={LBL}>Où insérer les étapes</span>
              <p className="font-body-md text-[12px] text-on-surface-variant">
                Par défaut, elles se posent juste avant l’étape remplacée, au jour qu’impose la recette (une nuit de repos
                recule d’un jour).
              </p>
              <ul className="flex flex-col gap-3">
                {mat?.steps.map((st, i) => (
                  <li key={i} className="border border-outline-variant rounded-lg p-3 flex flex-col gap-3 bg-white">
                    <span className="font-body-md text-body-md text-on-surface">
                      <span className="text-green-700 font-semibold">{i + 1}. {st.title || `Étape ${i + 1}`}</span>
                      {(st.prep_time || st.wait_time || st.cook_time) && (
                        <span className="text-on-surface-variant text-[12px]">
                          {' '}
                          — {formatTime((st.prep_time || 0) + (st.wait_time || 0) + (st.cook_time || 0))}
                        </span>
                      )}
                    </span>
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex flex-col gap-1">
                        <span className={LBL}>Position</span>
                        <select
                          value={placements[i]?.anchor ?? ''}
                          onChange={(e) => setPlacement(i, { anchor: e.target.value === '' ? null : Number(e.target.value) })}
                          className={INPUT}
                          style={{ minWidth: '16rem' }}
                        >
                          <option value="">Tout au début du déroulé</option>
                          {sortedBatchSteps.map((s, k) => (
                            <option key={s.id} value={s.order_index}>
                              Après {k + 1}. {s.title || `Étape ${k + 1}`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className={LBL}>Jour</span>
                        <select
                          value={placements[i]?.day ?? 0}
                          onChange={(e) => setPlacement(i, { day: Number(e.target.value) })}
                          className={INPUT}
                        >
                          {dayOptions.map((o) => (
                            <option key={o} value={o}>
                              {dayText(o)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Résumé de ce qui sera ajouté */}
            {mat && (
              <p className="font-body-md text-sm text-on-surface bg-surface-container rounded-lg p-4">
                <span className="text-green-700 font-semibold">{mat.steps.length}</span> étape{mat.steps.length > 1 ? 's' : ''},{' '}
                <span className="text-green-700 font-semibold">{addedIngredients}</span> ingrédient{addedIngredients > 1 ? 's' : ''}
                {utensilsToAdd.length > 0 && (
                  <>
                    {' '}et <span className="text-green-700 font-semibold">{utensilsToAdd.length}</span> ustensile
                    {utensilsToAdd.length > 1 ? 's' : ''}
                  </>
                )}{' '}
                s’ajouteront à la fournée{addedTime > 0 ? `, soit ${formatTime(addedTime)} de plus` : ''}. « {step.title || 'Cette étape'} »
                sortira des courses et de la mise en place.
              </p>
            )}

            <div className="flex items-center gap-4 flex-wrap">
              <button
                type="button"
                onClick={insert}
                disabled={busy || factor <= 0}
                className="bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md uppercase tracking-[0.15em] hover:shadow-xl active:scale-95 transition-all disabled:opacity-60"
              >
                Insérer les étapes
              </button>
              <button
                type="button"
                onClick={onClose}
                className="border border-outline px-6 py-3 rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Suppression de tout ce qui vient d'être inséré, dans l'ordre inverse des
// dépendances — même motif qu'IngredientExpandDialog.
async function rollback(supabase: ReturnType<typeof createClient>, stepIds: number[], utensilIds: number[]) {
  try {
    if (stepIds.length) {
      await supabase.from('batch_ingredients').delete().in('batch_step_id', stepIds);
      await supabase.from('batch_substeps').delete().in('batch_step_id', stepIds);
      await supabase.from('batch_steps').delete().in('id', stepIds);
    }
    if (utensilIds.length) await supabase.from('batch_utensils').delete().in('id', utensilIds);
  } catch {
    // Le message d'erreur d'origine reste le plus utile : un échec du
    // nettoyage ne doit pas le masquer.
  }
}

function StatusBadge({ item }: { item: PickerItem }) {
  const cls = 'px-2 py-0.5 font-label-md text-[10px] uppercase tracking-widest';
  if (item.status === 'draft') return <span className={`${cls} bg-secondary text-white`}>Brouillon</span>;
  if (item.status === 'pending') return <span className={`${cls} bg-secondary text-white`}>En attente</span>;
  if (item.status === 'rejected') return <span className={`${cls} bg-error text-white`}>Refusée</span>;
  if (item.is_public === false) return <span className={`${cls} bg-surface-container-highest text-primary`}>Privée</span>;
  return <span className={`${cls} bg-green-700 text-white`}>Publiée</span>;
}

function totalTime(it: PickerItem): number | null {
  return effectiveTimes({
    prep_time: it.prep_time,
    cook_time: it.cook_time,
    wait_time: it.wait_time,
    total_time: it.total_time,
    recipe_steps: it.recipe_steps,
  }).total;
}

function yieldText(it: PickerItem): string {
  if (it.measure_type === 'units' && it.yield_qty) {
    return `${it.yield_qty} ${UNITS_LBL[it.yield_unit || ''] || it.yield_unit || ''}`.trim();
  }
  return it.yield_desc || '';
}
