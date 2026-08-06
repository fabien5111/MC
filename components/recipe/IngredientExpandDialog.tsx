'use client';

// « Remplacer un ingrédient par une recette » — sur la fiche d'une recette
// planifiée : le praliné acheté devient le praliné qu'on fabrique, à partir
// d'une autre recette de l'application dont les étapes viennent s'insérer
// dans le déroulé du plan.
//
// Le parcours se fait en deux temps dans une seule fenêtre :
//   1. « Quelle recette ? » — recherche par titre sur trois portées
//      cumulables (mes recettes / mes favoris / toutes).
//   2. « Combien, et où ? » — quantité à produire (→ coefficient) puis
//      position et jour de chacune des étapes à insérer.
//
// L'écriture est séquentielle (chaque `plan_step` doit exister avant ses
// sous-étapes et ses ingrédients) et annulée en bloc au moindre échec : un
// plan à moitié éclaté serait pire que pas d'éclatement du tout. Le contenu
// inséré est une copie, comme le reste du plan — la sous-recette peut évoluer
// ou disparaître ensuite sans rien changer ici (cf. CLAUDE.md « Recettes
// planifiées »).
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { formatTime } from '@/lib/format';
import { UNITS_LBL, dayLabel, effectiveTimes } from '@/lib/recipe-view';
import {
  computeInsertOrderIndexes,
  fmtNum,
  materializePlan,
  planDayLabel,
  suggestedExpansionDay,
  PLAN_SOURCE_SELECT,
  type PlanFull,
  type PlanIngredientRow,
  type PlanSourceRecipe,
} from '@/lib/recipe-plan';

// Une recette proposée par la recherche. Volontairement sans vignette : les
// images sont des data-URL en base (cf. app/api/recipes/picker/route.ts).
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

// Position d'insertion choisie pour une étape de la sous-recette : `anchor` =
// `order_index` de l'étape du plan après laquelle elle se pose (null = en
// tête), `day` = jour retenu, `suggested` = jour proposé par le calcul (gardé
// pour `base_day_offset`, ce qui permettra de rétablir la proposition depuis
// la fiche comme pour une étape déplacée).
type Placement = { anchor: number | null; day: number; suggested: number };

const num = (v: string | number | null | undefined): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const normUnit = (u: string | null | undefined) => (u || '').toLowerCase().trim();

const INPUT = 'border border-outline-variant rounded px-3 py-2 bg-white font-body-md text-sm text-on-surface focus:outline-none focus:border-primary';
const LBL = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

export function IngredientExpandDialog({
  plan,
  row,
  onClose,
  onDone,
}: {
  plan: PlanFull;
  // Ligne d'ingrédient à remplacer (jamais déjà remplacée : le déclencheur
  // disparaît dans ce cas, cf. PlanIngredientsEditor).
  row: PlanIngredientRow;
  onClose: () => void;
  // Écriture aboutie — le parent enchaîne sur la proposition de suppression
  // des sessions en cours, figées avant ce changement.
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

  useEffect(() => {
    if (stage !== 'search') return;
    const params = new URLSearchParams({ scopes: [...scopes].join(','), q: term.trim() });
    // Débounce : la frappe ne déclenche pas une requête par caractère (même
    // réglage que la réécriture d'URL de la recherche avancée).
    const t = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const resp = await fetch(`/api/recipes/picker?${params.toString()}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.erreur || `Erreur ${resp.status}`);
        setItems(data.items as PickerItem[]);
      } catch (e) {
        setItems([]);
        setSearchError((e as Error).message);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [term, scopes, stage]);

  function toggleScope(s: Scope) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  // ── Étape 2 : quantité + positionnement ────────────────────────────────
  const [source, setSource] = useState<PlanSourceRecipe | null>(null);
  const [wantQty, setWantQty] = useState('');
  const [coefStr, setCoefStr] = useState('1');
  const [placements, setPlacements] = useState<Placement[]>([]);

  const sortedPlanSteps = useMemo(() => [...plan.plan_steps].sort((a, b) => a.order_index - b.order_index), [plan.plan_steps]);
  const planOrders = useMemo(() => sortedPlanSteps.map((s) => s.order_index), [sortedPlanSteps]);
  // Étape du plan qui utilise l'ingrédient : sert de repère par défaut (les
  // sous-étapes se posent juste avant) et de base au calcul du jour.
  const consumingIndex = sortedPlanSteps.findIndex((s) => s.id === row.step_id);
  const consuming = consumingIndex >= 0 ? sortedPlanSteps[consumingIndex] : null;

  // Jours proposés : ceux déjà utilisés par le plan, plus deux d'anticipation
  // — une sous-recette demande souvent d'attaquer plus tôt que la recette.
  const dayOptions = useMemo(() => {
    const used = plan.plan_steps.flatMap((s) => [Math.max(0, s.day_offset || 0), Math.max(0, s.base_day_offset ?? 0)]);
    const max = Math.max(0, ...used) + 2;
    return Array.from({ length: max + 1 }, (_, i) => i);
  }, [plan.plan_steps]);

  const dayText = (offset: number) => (plan.planned_date ? planDayLabel(offset, plan.planned_date) : dayLabel(offset));

  // Charge le contenu de la recette choisie (RLS via la session) et prépare
  // les valeurs par défaut : quantité visée = celle de l'ingrédient remplacé,
  // étapes posées juste avant celle qui le consomme, dans leur ordre.
  async function selectRecipe(item: PickerItem) {
    setLoading(true);
    const { data, error } = await createClient().from('recipes').select(PLAN_SOURCE_SELECT).eq('id', item.id).maybeSingle();
    setLoading(false);
    if (error || !data) {
      dialog.alert('Recette illisible : ' + (error?.message || 'contenu introuvable'));
      return;
    }
    const rec = data as unknown as PlanSourceRecipe;
    if (!(rec.recipe_steps || []).length) {
      dialog.alert(`« ${rec.title} » n'a aucune étape : il n'y a rien à insérer dans le déroulé.`);
      return;
    }
    const steps = [...rec.recipe_steps].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
    const defaultAnchor = consumingIndex > 0 ? sortedPlanSteps[consumingIndex - 1].order_index : null;
    setSource(rec);
    setWantQty(row.quantity != null ? fmtNum(row.quantity) : rec.yield_qty || '');
    setCoefStr('1');
    setPlacements(
      steps.map((s) => {
        const suggested = suggestedExpansionDay(consuming?.day_offset ?? 0, s.day_offset || 0);
        return { anchor: defaultAnchor, day: suggested, suggested };
      }),
    );
    setStage('setup');
  }

  const sourceYield = num(source?.yield_qty);
  // Le coefficient se déduit d'une quantité à produire quand la recette
  // annonce un rendement numérique (« 500 g de praliné ») ; sinon (moule,
  // dimensions) il n'y a rien à diviser, l'utilisateur le saisit.
  const byQuantity = source?.measure_type === 'units' && sourceYield != null && sourceYield > 0;
  const factor = useMemo(() => {
    if (!source) return 1;
    if (byQuantity) {
      const want = num(wantQty);
      if (!want || want <= 0 || !sourceYield) return 0;
      return Math.round((want / sourceYield) * 1000) / 1000;
    }
    const c = num(coefStr);
    return c && c > 0 ? Math.round(c * 1000) / 1000 : 0;
  }, [source, byQuantity, wantQty, coefStr, sourceYield]);

  // Aperçu : exactement ce qui sera écrit (même fonction que la
  // matérialisation d'un plan), pour que le résumé ne puisse pas diverger.
  const mat = useMemo(() => (source && factor > 0 ? materializePlan(source, { factor }) : null), [source, factor]);

  // Un ustensile déjà présent dans le plan n'est pas dupliqué.
  const utensilsToAdd = useMemo(() => {
    if (!mat) return [];
    const known = new Set(plan.plan_utensils.map((u) => u.name.toLowerCase().trim()));
    return mat.utensils.filter((u) => u.name && !known.has(u.name.toLowerCase().trim()));
  }, [mat, plan.plan_utensils]);

  const addedTime = mat ? mat.steps.reduce((n, s) => n + (s.prep_time || 0) + (s.wait_time || 0) + (s.cook_time || 0), 0) : 0;
  const addedIngredients = mat ? mat.steps.reduce((n, s) => n + s.ingredients.length, 0) : 0;

  // L'unité de l'ingrédient remplacé et celle du rendement de la sous-recette
  // ne sont pas converties : signalées quand elles diffèrent, la quantité
  // proposée n'étant alors qu'un point de départ.
  const unitMismatch =
    byQuantity && normUnit(row.unit) && normUnit(source?.yield_unit) && normUnit(row.unit) !== normUnit(source?.yield_unit);

  function setPlacement(i: number, patch: Partial<Placement>) {
    setPlacements((prev) => prev.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  }

  // ── Écriture ───────────────────────────────────────────────────────────
  async function insert() {
    if (!source || !mat) return;
    if (factor <= 0) {
      dialog.alert(byQuantity ? 'Indiquez une quantité à produire valide.' : 'Indiquez un coefficient valide.');
      return;
    }
    const orders = computeInsertOrderIndexes(planOrders, placements.map((p) => p.anchor));
    const supabase = createClient();
    const createdSteps: number[] = [];
    const createdUtensils: number[] = [];

    const ok = await mutate(
      async () => {
        try {
          // Toutes les étapes en une seule requête : contrairement à la
          // matérialisation d'un plan entier (PlanWidget), elles ne dépendent
          // pas les unes des autres — seules leurs sous-étapes et leurs
          // ingrédients ont besoin des `id` générés. Une insertion par étape
          // coûtait trois allers-retours réseau par étape ; le tout tient
          // désormais en cinq requêtes, quel que soit le nombre d'étapes.
          const { data: stepRows, error: stepErr } = await supabase
            .from('plan_steps')
            .insert(
              mat.steps.map((st, i) => ({
                planning_id: plan.id,
                order_index: orders[i],
                day_offset: placements[i].day,
                // Le « jour d'origine » d'une étape insérée est le jour
                // proposé par la sous-recette, pas celui de la recette du
                // plan : c'est lui qu'on pourra rétablir depuis la fiche.
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
                source_ingredient_id: row.id,
              })),
            )
            .select('id, source_step_id');
          if (stepErr || !stepRows) throw stepErr || new Error('Étapes non créées');
          stepRows.forEach((s) => createdSteps.push(s.id));

          // Le rapprochement se fait par `source_step_id` (l'étape de la
          // sous-recette dont chaque ligne provient, unique dans ce lot) et
          // non par la position dans le tableau renvoyé : PostgREST ne
          // garantit pas l'ordre des lignes insérées.
          const idBySourceStep = new Map(stepRows.map((s) => [s.source_step_id, s.id]));
          const stepIdOf = (sourceStepId: number): number => {
            const id = idBySourceStep.get(sourceStepId);
            if (id == null) throw new Error('Étape insérée introuvable');
            return id;
          };

          const substeps = mat.steps.flatMap((st) =>
            st.substeps.map((texte, k) => ({ step_id: stepIdOf(st.source_step_id), order_index: k, texte })),
          );
          if (substeps.length) {
            const { error } = await supabase.from('plan_substeps').insert(substeps);
            if (error) throw error;
          }

          const ingredients = mat.steps.flatMap((st) =>
            st.ingredients.map((it) => ({
              planning_id: plan.id,
              step_id: stepIdOf(st.source_step_id),
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
              // Ligne absente de la recette du plan : vert à l'affichage, et
              // surtout jamais reprise par un réajustement global du facteur
              // (cf. lib/recipe-plan.ts).
              added: true,
            })),
          );
          if (ingredients.length) {
            const { error } = await supabase.from('plan_ingredients').insert(ingredients);
            if (error) throw error;
          }

          if (utensilsToAdd.length) {
            const { data, error } = await supabase
              .from('plan_utensils')
              .insert(
                utensilsToAdd.map((u) => ({
                  planning_id: plan.id,
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

          // En dernier : tant que la ligne n'est pas marquée, l'éclatement
          // n'a pas eu lieu du point de vue de la fiche — un échec en amont
          // se rattrape donc par la seule suppression de ce qui a été inséré.
          const { error } = await supabase.from('plan_ingredients').update({ expanded_into_recipe_id: source.id }).eq('id', row.id);
          if (error) throw error;
          return { error: null };
        } catch (e) {
          await rollback(supabase, createdSteps, createdUtensils);
          return { error: { message: (e as Error).message || 'insertion impossible' } };
        }
      },
      // La resynchronisation n'est pas faite ici : cette fenêtre se ferme dans
      // la foulée, et une transition meurt avec le composant qui la porte — le
      // spinner s'éteindrait avant le retour du rendu serveur. C'est le parent,
      // qui reste monté, qui la déclenche (`onDone`).
      { errorLabel: 'Remplacement impossible', refresh: false },
    );

    if (ok) {
      // `onDone` avant `onClose`, et sans `await` : son rafraîchissement part
      // dans le même bloc synchrone que la fermeture, donc dans le même rendu
      // — le voile du parent prend le relais sans laisser d'interstice.
      void onDone();
      onClose();
    }
  }

  const replacedQty = row.quantity != null ? fmtNum(row.quantity) : row.quantity_text || '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Remplacer un ingrédient par une recette"
      className="fixed inset-0 z-[95] flex items-start justify-center bg-background/60 backdrop-blur-[2px] p-4 overflow-y-auto"
      onClick={onClose}
    >
      {/* Le spinner « Le Fouet » est monté au-dessus (z-100) : il couvre bien
          la fenêtre pendant la recherche, la lecture de la recette choisie et
          l'insertion. */}
      <LoadingOverlay visible={loading || busy} label={busy ? 'Insertion des étapes…' : 'Chargement…'} />
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
              {replacedQty || row.unit ? (
                <>
                  <span className="text-primary">
                    {replacedQty} {row.unit || ''}
                  </span>{' '}
                  de{' '}
                </>
              ) : null}
              <span className="font-semibold text-on-surface">{row.name}</span>
              {' — à fabriquer à partir d’une recette de l’application.'}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {stage === 'search' ? (
          <div className="p-6 flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <label className={LBL} htmlFor="expand-search">
                Chercher une recette
              </label>
              <input
                id="expand-search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                autoFocus
                placeholder="ex : praliné noisette"
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
            {!searchError && scopes.size > 0 && !items.length && !loading && (
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
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-headline-md text-headline-md text-primary">{source.title}</span>
              <button
                type="button"
                onClick={() => {
                  setSource(null);
                  setStage('search');
                }}
                className="font-label-md text-[12px] text-primary hover:underline flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>Changer de recette
              </button>
            </div>

            {/* Quantité à produire → coefficient */}
            <div className="flex flex-col gap-3">
              <span className={LBL}>Quantité à produire</span>
              {byQuantity ? (
                <div className="flex flex-wrap items-end gap-4">
                  <input type="number" min={0} step="any" value={wantQty} onChange={(e) => setWantQty(e.target.value)} className={INPUT} style={{ width: '8rem' }} />
                  <span className="font-body-md text-sm text-on-surface-variant pb-2">
                    {UNITS_LBL[source.yield_unit || ''] || source.yield_unit || ''}
                  </span>
                  <span className="font-body-md text-sm text-on-surface-variant pb-2">
                    (la recette en produit {source.yield_qty} {UNITS_LBL[source.yield_unit || ''] || source.yield_unit || ''})
                  </span>
                </div>
              ) : (
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1">
                    <span className={LBL}>Coefficient</span>
                    <input type="number" min={0} step="any" value={coefStr} onChange={(e) => setCoefStr(e.target.value)} className={INPUT} style={{ width: '7rem' }} />
                  </div>
                  <span className="font-body-md text-sm text-on-surface-variant pb-2">
                    {source.yield_desc ? `La recette produit : ${source.yield_desc}` : 'Cette recette n’annonce pas de rendement chiffré.'}
                  </span>
                </div>
              )}
              {unitMismatch && (
                <p className="font-body-md text-sm italic text-on-surface-variant">
                  L’unité de l’ingrédient ({row.unit}) diffère de celle du rendement de la recette ({source.yield_unit}) : la quantité
                  proposée n’est qu’un point de départ, ajustez-la.
                </p>
              )}
              {factor > 0 && <p className="font-body-md text-sm text-primary">Quantités de la recette multipliées par {fmtNum(factor)}.</p>}
            </div>

            {/* Positionnement de chaque étape */}
            <div className="flex flex-col gap-3">
              <span className={LBL}>Où insérer les étapes</span>
              <p className="font-body-md text-[12px] text-on-surface-variant">
                Par défaut, elles se posent juste avant l’étape qui utilise l’ingrédient, au jour qu’impose la recette (une nuit de repos
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
                          {sortedPlanSteps.map((s, k) => (
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
                s’ajouteront au plan{addedTime > 0 ? `, soit ${formatTime(addedTime)} de plus` : ''}. « {row.name} » sortira de la liste
                de courses et de la mise en place.
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
// dépendances — on ne s'appuie pas sur un éventuel ON DELETE CASCADE, dont le
// réglage exact n'a pas à être supposé ici.
async function rollback(supabase: ReturnType<typeof createClient>, stepIds: number[], utensilIds: number[]) {
  try {
    if (stepIds.length) {
      await supabase.from('plan_ingredients').delete().in('step_id', stepIds);
      await supabase.from('plan_substeps').delete().in('step_id', stepIds);
      await supabase.from('plan_steps').delete().in('id', stepIds);
    }
    if (utensilIds.length) await supabase.from('plan_utensils').delete().in('id', utensilIds);
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

// Même règle que partout ailleurs : le temps saisi prime, sinon la somme des
// étapes (cf. effectiveTimes) — la durée annoncée ici doit être celle de la
// carte et de la fiche, pas un troisième calcul.
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
