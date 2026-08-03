'use client';

// Planification d'une recette (porté du panneau « Planifier » de recette.html) :
// date de dégustation + ajustement (quantité produite / par ingrédient / moule
// via volume-surface / dimensions par IA) → matérialise une copie indépendante
// de la recette (planning + plan_steps/plan_substeps/plan_ingredients/
// plan_utensils, scalés par le facteur choisi). Apparaît ensuite dans l'onglet
// Planning du profil. Les étapes déjà réalisées à la planification ne se
// règlent plus ici : elles se piloteront depuis l'exécution (cf. CLAUDE.md
// « Recettes planifiées »).
//
// En mode édition (crayon du bandeau « Recette planifiée »), modifie l'entrée
// de planning existante à la place d'en créer une nouvelle. Le pré-remplissage
// se limite à la date et, pour le mode « unités », à la quantité ; les modes
// moule/IA repartent d'un formulaire vierge (édition fine du libellé non
// reconstituée). Un changement d'ajustement en édition réapplique le nouveau
// facteur à toutes les lignes issues de la recette (base_quantity connu) —
// les quantités individuellement modifiées dans l'éditeur d'ingrédients sont
// alors réinitialisées, faute de distinguer un ajustement automatique d'une
// modification manuelle dans ce modèle.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { useDialog } from '@/components/Dialog';
import { UNITS_LBL, moldMetrics, moldLbl, yieldInfo, MOLD_FORME_DIMS, DIM_LABELS } from '@/lib/recipe-view';
import type { MergedIngredient } from '@/lib/recipe-view';
import type { RecipeFull } from '@/lib/recipes';
import { materializePlan, scalingCoef, scaleFromBase, type PlanFull } from '@/lib/recipe-plan';
import { usePlanCtx } from '@/components/recipe/PlanContext';
import { LoadingOverlay } from '@/components/LoadingOverlay';

const num = (v: string | number | null | undefined): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const fr = (n: number): string => String(n).replace('.', ',');

type Supabase = ReturnType<typeof createClient>;

// Insère le contenu matérialisé (étapes → sous-étapes/ingrédients, puis
// ustensiles) sous une ligne `planning` déjà créée. Séquentiel : chaque
// plan_step doit exister avant d'insérer ses plan_substeps/plan_ingredients
// (FK step_id), donc pas de simple insert() en lot pour les étapes.
async function insertMaterializedPlan(
  supabase: Supabase,
  planningId: number,
  recipe: RecipeFull,
  factor: number,
  moldCoefs: { surface: number; volume: number } | null,
) {
  const mat = materializePlan(recipe, { factor, moldCoefs });
  for (const step of mat.steps) {
    const { data: stepRow, error: stepErr } = await supabase
      .from('plan_steps')
      .insert({
        planning_id: planningId,
        order_index: step.order_index,
        day_offset: step.day_offset,
        title: step.title,
        description: step.description,
        tips: step.tips,
        video_url: step.video_url,
        prep_time: step.prep_time,
        cook_time: step.cook_time,
        wait_time: step.wait_time,
        cook_temp: step.cook_temp,
        scaling_mode: step.scaling_mode,
        source_recipe_id: recipe.id,
        source_step_id: step.source_step_id,
      })
      .select('id')
      .single();
    if (stepErr || !stepRow) throw stepErr || new Error('Étape non créée');
    if (step.substeps.length) {
      const { error } = await supabase.from('plan_substeps').insert(step.substeps.map((texte, i) => ({ step_id: stepRow.id, order_index: i, texte })));
      if (error) throw error;
    }
    if (step.ingredients.length) {
      const { error } = await supabase.from('plan_ingredients').insert(
        step.ingredients.map((it) => ({
          planning_id: planningId,
          step_id: stepRow.id,
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
          source_recipe_id: recipe.id,
        })),
      );
      if (error) throw error;
    }
  }
  if (mat.utensils.length) {
    const { error } = await supabase
      .from('plan_utensils')
      .insert(mat.utensils.map((u) => ({ planning_id: planningId, order_index: u.order_index, name: u.name, comment: u.comment, url: u.url, source_recipe_id: recipe.id })));
    if (error) throw error;
  }
}

// Réapplique un nouveau facteur/coefficients moule aux lignes issues de la
// recette (base_quantity connu) d'un plan déjà matérialisé. Les lignes
// ajoutées à la main dans l'éditeur d'ingrédients ne sont jamais touchées.
async function rescalePlanIngredients(supabase: Supabase, plan: PlanFull, factor: number, moldCoefs: { surface: number; volume: number } | null) {
  for (const step of plan.plan_steps) {
    const coef = scalingCoef(step.scaling_mode, factor, moldCoefs);
    const rows = plan.plan_ingredients.filter((it) => it.step_id === step.id && !it.added);
    for (const it of rows) {
      const { quantity, quantity_text } = scaleFromBase(it.base_quantity, it.quantity_text, coef);
      const { error } = await supabase.from('plan_ingredients').update({ quantity, quantity_text }).eq('id', it.id);
      if (error) throw error;
    }
  }
}

export function PlanWidget({
  recipe,
  moldTypes,
  ingredients,
  existingPlan,
  isAdmin = false,
}: {
  recipe: RecipeFull;
  moldTypes: { id: number; name: string; forme: string | null }[];
  ingredients: MergedIngredient[];
  existingPlan?: PlanFull | null;
  // Réservé aux administrateurs pour le moment : ajustement des quantités par IA
  // (texte libre) proposé comme troisième mode d'ajustement dans le mode « unités ».
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const writeGuard = useWriteGuard();
  const { open, editMode, close } = usePlanCtx();
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const yInfo = yieldInfo(recipe);
  const moldSummary = [recipe.yield_desc, moldLbl(recipe)].filter(Boolean).join(' — ') || null;
  const moldForme = recipe.mold_types?.forme ?? null;
  const moldDims = recipe.mold_dims && typeof recipe.mold_dims === 'object' && !Array.isArray(recipe.mold_dims) ? (recipe.mold_dims as Record<string, number>) : null;

  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);

  // Le panneau est placé en haut de la fiche (avant la photo) : les
  // déclencheurs situés plus bas (crayon du bandeau « Recette planifiée »)
  // l'ouvriraient hors écran. `nearest` ne bouge pas s'il est déjà visible.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [open]);

  // Ré-initialise le formulaire à chaque ouverture, selon le mode (création vs
  // édition de l'entrée de planning existante).
  useEffect(() => {
    if (!open) return;
    // Repart d'un mode d'ajustement propre (et efface l'état IA) à chaque
    // ouverture — la reconstitution fine du mode IA n'est pas gérée en édition.
    setUMode('qty');
    setMMode('mold');
    setAiPrompt('');
    setAiCoef('');
    setAiMsg(null);
    if (editMode && existingPlan) {
      setDate(existingPlan.planned_date || today);
      if (recipe.measure_type === 'units') {
        const y = num(recipe.yield_qty);
        if (y) setQty(String(Math.round(y * (existingPlan.factor || 1) * 100) / 100));
      }
    } else if (!editMode) {
      setDate(today);
      setQty(recipe.yield_qty || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editMode]);

  // Mode « unités »
  const numeric = ingredients.filter((m) => (num(m.qty) || 0) > 0);
  const [uMode, setUMode] = useState<'qty' | 'ing' | 'ia'>('qty');
  const [qty, setQty] = useState(recipe.yield_qty || '');
  const [ingIdx, setIngIdx] = useState(0);
  const [ingQty, setIngQty] = useState('');

  // Mode « moule » (avec, pour les administrateurs, un sous-mode IA en texte libre)
  const [mMode, setMMode] = useState<'mold' | 'ia'>('mold');
  const [moldCount, setMoldCount] = useState(String(parseInt(recipe.yield_qty || '', 10) > 0 ? parseInt(recipe.yield_qty!, 10) : 1));
  const [targetType, setTargetType] = useState(''); // '' = moule de la recette
  const [dims, setDims] = useState<Record<string, string>>({});
  const targetForme = targetType === '' ? moldForme : moldTypes.find((t) => String(t.id) === targetType)?.forme || null;

  // Mode « dimensions » (IA)
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCoef, setAiCoef] = useState('');
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  async function askAi() {
    if (aiPrompt.trim().length < 3) {
      dialog.alert("Décrivez l'ajustement souhaité.");
      return;
    }
    setAiBusy(true);
    setAiMsg(null);
    try {
      const resp = await fetch('/api/scale-recipe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt.trim(),
          recette: {
            titre: recipe.title,
            rendement: yInfo?.value ?? null,
            yield_notes: recipe.yield_notes,
            ingredients: ingredients.map((m) => ({ nom: m.name, quantite: m.qty, unite: m.unit })),
          },
          moules_reference: [],
        }),
      });
      const data = await resp.json().catch(() => ({ erreur: `HTTP ${resp.status}` }));
      if (!resp.ok) throw new Error(data.erreur || `Erreur ${resp.status}`);
      setAiMsg(data.explication || '');
      if (data.coefficient != null && data.coefficient > 0) setAiCoef(String(data.coefficient));
    } catch (e) {
      setAiMsg((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  function compute(): { factor: number; label: string | null; moldCoefs: { surface: number; volume: number } | null } | null {
    let factor = 1;
    let label: string | null = null;
    let moldCoefs: { surface: number; volume: number } | null = null;

    if (recipe.measure_type === 'units' && (num(recipe.yield_qty) || 0) > 0) {
      const unitLbl = UNITS_LBL[recipe.yield_unit || ''] || recipe.yield_unit || '';
      if (uMode === 'ing') {
        const m = numeric[ingIdx];
        const base = num(m?.qty);
        const want = num(ingQty);
        if (!m || !base || !want || want <= 0) {
          dialog.alert('Indiquez une quantité valide.');
          return null;
        }
        factor = want / base;
        label = `Base ${m.name} : ${want} ${m.unit || ''}`.trim();
      } else if (uMode === 'ia') {
        const c = num(aiCoef);
        if (!(c && c > 0)) {
          dialog.alert("Cliquez d'abord sur « Calculer le coefficient avec l'IA ».");
          return null;
        }
        factor = c;
        label = aiPrompt.trim() ? `IA : ${aiPrompt.trim().slice(0, 60)}` : `Coefficient : ×${fr(c)}`;
      } else {
        const want = num(qty);
        if (!want || want <= 0) {
          dialog.alert('Indiquez une quantité valide.');
          return null;
        }
        factor = want / num(recipe.yield_qty)!;
        label = `Quantité : ${want} ${unitLbl}`.trim();
      }
    } else if (recipe.measure_type === 'mold' && mMode === 'ia') {
      const c = num(aiCoef);
      if (!(c && c > 0)) {
        dialog.alert("Cliquez d'abord sur « Calculer le coefficient avec l'IA ».");
        return null;
      }
      factor = c;
      label = aiPrompt.trim() ? `IA : ${aiPrompt.trim().slice(0, 60)}` : `Coefficient : ×${fr(c)}`;
    } else if (recipe.measure_type === 'mold') {
      const tgtDims: Record<string, number> = {};
      for (const k of MOLD_FORME_DIMS[targetForme || ''] || []) {
        const v = num(dims[k]);
        if (v && v > 0) tgtDims[k] = v;
      }
      const src = moldMetrics(moldForme, moldDims || {});
      const tgt = moldMetrics(targetForme, tgtDims);
      const srcCount = parseInt(recipe.yield_qty || '', 10) > 0 ? parseInt(recipe.yield_qty!, 10) : 1;
      const tgtCount = parseInt(moldCount, 10) > 0 ? parseInt(moldCount, 10) : srcCount;
      const nRatio = tgtCount / srcCount;
      const coefVol = src.volume && tgt.volume ? (nRatio * tgt.volume) / src.volume : null;
      const coefSurf = src.surface && tgt.surface ? (nRatio * tgt.surface) / src.surface : null;
      const round = (x: number) => Math.round(x * 1000) / 1000;
      if (coefVol || coefSurf || nRatio !== 1) {
        moldCoefs = { surface: coefSurf != null ? round(coefSurf) : round(nRatio), volume: coefVol != null ? round(coefVol) : round(nRatio) };
        factor = moldCoefs.volume;
      }
      const dimTxt = Object.entries(tgtDims).map(([k, v]) => (k === 'diametre' ? 'Ø ' : '') + v).join(' × ');
      const tname = targetType === '' ? 'Moule de la recette' : moldTypes.find((t) => String(t.id) === targetType)?.name || 'Moule';
      label = `Moule : ${tgtCount > 1 ? tgtCount + ' × ' : ''}${tname}${dimTxt ? ' — ' + dimTxt + ' cm' : ''}`;
    } else if (recipe.measure_type === 'dimensions') {
      const c = num(aiCoef);
      if (aiPrompt.trim() && !(c && c > 0)) {
        dialog.alert("Cliquez d'abord sur « Calculer le coefficient avec l'IA ».");
        return null;
      }
      if (c && c > 0) {
        factor = c;
        label = aiPrompt.trim() ? `IA : ${aiPrompt.trim().slice(0, 60)}` : `Coefficient : ×${fr(c)}`;
      }
    }

    factor = Math.round(factor * 1000) / 1000;
    return { factor, label, moldCoefs };
  }

  async function validate() {
    if (!writeGuard('Planification d’une recette')) return;
    if (!date) {
      dialog.alert('Choisissez une date.');
      return;
    }
    if (date < today) {
      dialog.alert("La date doit être aujourd'hui ou dans le futur.");
      return;
    }
    const res = compute();
    if (!res) return;
    const editing = editMode && existingPlan;
    // Rien à réajuster si l'ajustement n'a pas changé — évite d'écraser
    // pour rien les quantités individuellement modifiées dans l'éditeur.
    const adjustmentChanged = !!editing && (res.factor !== (existingPlan.factor ?? 1) || res.label !== existingPlan.adjust_label);

    const dateTxt = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const lines = [editing ? `Modifier la planification de « ${recipe.title} » pour le ${dateTxt} ?` : `Planifier « ${recipe.title} » le ${dateTxt} ?`];
    if (res.label) lines.push(res.label);
    if (res.factor !== 1) lines.push(`Les quantités seront multipliées par ${fr(res.factor)}.`);
    if (adjustmentChanged) lines.push('Les quantités individuellement modifiées dans le détail des ingrédients seront réinitialisées selon ce nouvel ajustement.');
    if (!(await dialog.confirm(lines.join('\n')))) return;

    setBusy(true);
    const supabase = createClient();

    if (editing) {
      const { error } = await supabase
        .from('planning')
        .update({ planned_date: date, ...(adjustmentChanged ? { factor: res.factor, adjust_label: res.label } : {}) })
        .eq('id', existingPlan.id);
      if (error) {
        dialog.alert('Erreur : ' + error.message);
        setBusy(false);
        return;
      }
      if (adjustmentChanged) {
        try {
          await rescalePlanIngredients(supabase, existingPlan, res.factor, res.moldCoefs);
        } catch (e) {
          dialog.alert('La date a été mise à jour, mais le nouvel ajustement des quantités a échoué : ' + (e as Error).message);
          setBusy(false);
          return;
        }
      }
      close();
      router.refresh();
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push('/connexion');
      return;
    }
    const { data: planRow, error } = await supabase
      .from('planning')
      .insert({ user_id: user.id, recipe_id: recipe.id, recipe_title: recipe.title, planned_date: date, factor: res.factor, adjust_label: res.label, status: 'planifie', notes: null })
      .select('id')
      .single();
    if (error || !planRow) {
      dialog.alert('Erreur : ' + (error?.message || 'création refusée'));
      setBusy(false);
      return;
    }
    try {
      await insertMaterializedPlan(supabase, planRow.id, recipe, res.factor, res.moldCoefs);
    } catch (e) {
      await supabase.from('planning').delete().eq('id', planRow.id);
      dialog.alert('Erreur lors de la création du plan : ' + (e as Error).message);
      setBusy(false);
      return;
    }
    close();
    // `busy` reste vrai jusqu'au démontage par la navigation : le spinner doit
    // rester affiché pendant la transition vers /profil#planning.
    // router.refresh() APRÈS le push (et non avant) : appelé avant, il ne
    // rafraîchit que la route qu'on quitte (la fiche recette) — l'onglet
    // Planning du profil, déjà visité dans la session, resservait alors une
    // entrée du cache client antérieure à la création du plan.
    router.push('/profil#planning');
    router.refresh();
  }

  // Rendu même panneau fermé (après `close()` en fin de validation) : la
  // navigation vers /profil#planning reste à couvrir par le spinner jusqu'à
  // ce qu'elle prenne effet.
  if (!open) return <LoadingOverlay visible={busy} label="Enregistrement du plan…" />;

  const INPUT = 'border border-outline-variant rounded px-3 py-2 bg-white font-body-md text-on-surface focus:outline-none focus:border-primary';
  const LBL = 'font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]';

  // Rappel de la quantité de base de la recette, affiché sous les sélecteurs
  // d'ajustement pour que le choix (quantité / ingrédient / moule…) se fasse
  // en connaissance de la production initiale.
  const qtyInfoBlock = (yInfo?.value || recipe.yield_notes) && (
    <div className="flex flex-col gap-1">
      {yInfo?.value && (
        <span className="font-body-md text-on-surface">
          <span className={LBL}>Quantité produite </span> {yInfo.value}
        </span>
      )}
      {recipe.yield_notes && <p className="font-body-md text-body-md italic text-on-surface-variant whitespace-pre-line">{recipe.yield_notes}</p>}
    </div>
  );

  // Bloc d'ajustement par IA (texte libre → coefficient), partagé entre le mode
  // « dimensions » et le troisième mode « unités » réservé aux administrateurs.
  const aiBlock = (
    <div className="flex flex-col gap-3" style={{ maxWidth: '40rem' }}>
      <label className={LBL}>Décrivez l&apos;ajustement souhaité</label>
      <textarea value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} rows={3} className={INPUT} placeholder="ex : pour 12 personnes au lieu de 8, ou moule de 24 cm" />
      <div>
        <button
          type="button"
          onClick={askAi}
          disabled={aiBusy}
          className="flex items-center gap-2 bg-secondary text-on-secondary px-5 py-2 rounded-full font-label-md text-label-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-60"
        >
          <span className={`material-symbols-outlined text-[18px]${aiBusy ? ' animate-spin' : ''}`}>{aiBusy ? 'progress_activity' : 'auto_awesome'}</span>
          Calculer le coefficient avec l&apos;IA
        </button>
      </div>
      {aiMsg != null && (
        <div className="border border-secondary rounded-xl bg-white p-4 flex flex-col gap-3">
          <p className="font-body-md text-on-surface">{aiMsg}</p>
          {aiCoef && (
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-2">
                <label className={LBL}>Coefficient proposé</label>
                <input type="number" min={0} step="any" value={aiCoef} onChange={(e) => setAiCoef(e.target.value)} className={INPUT} style={{ width: '8rem' }} />
              </div>
              <span className="text-xs text-on-surface-variant pb-2">Vous pouvez l&apos;ajuster avant de valider.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div ref={panelRef} className="mb-12 border border-secondary bg-surface-container-low p-8 rounded-xl">
      <LoadingOverlay visible={busy} label="Enregistrement du plan…" />
      <h3 className="font-headline-md text-headline-md text-primary mb-6 flex items-center gap-3">
        <span className="material-symbols-outlined">calendar_month</span>
        {editMode && existingPlan ? 'Modifier la planification' : 'Planifier cette recette'}
      </h3>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <label className={LBL} htmlFor="plan-date">
            Date de dégustation
          </label>
          <input id="plan-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} style={{ width: '10rem' }} />
        </div>

        {/* Ajustement selon le type de mesure */}
        {recipe.measure_type === 'units' && (num(recipe.yield_qty) || 0) > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="umode" checked={uMode === 'qty'} onChange={() => setUMode('qty')} /> Ajuster par quantité produite
              </label>
              {numeric.length > 0 && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="umode" checked={uMode === 'ing'} onChange={() => setUMode('ing')} /> Ajuster par quantité d&apos;un ingrédient
                </label>
              )}
              {isAdmin && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="umode" checked={uMode === 'ia'} onChange={() => setUMode('ia')} />
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
                    Ajuster les quantités par IA
                  </span>
                </label>
              )}
            </div>
            {qtyInfoBlock}
            {uMode === 'ia' ? (
              aiBlock
            ) : uMode === 'qty' ? (
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-2">
                  <label className={LBL}>Quantité à produire</label>
                  <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={INPUT} style={{ width: '8rem' }} />
                </div>
                <span className="font-body-md text-on-surface-variant pb-2">{UNITS_LBL[recipe.yield_unit || ''] || recipe.yield_unit || ''}</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex flex-col gap-2">
                  <label className={LBL}>Ingrédient</label>
                  <select
                    value={ingIdx}
                    onChange={(e) => {
                      const i = Number(e.target.value);
                      setIngIdx(i);
                      setIngQty(String(num(numeric[i]?.qty) || ''));
                    }}
                    className={INPUT}
                    style={{ minWidth: '14rem' }}
                  >
                    {numeric.map((m, i) => (
                      <option key={i} value={i}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className={LBL}>Quantité disponible</label>
                  <input type="number" min={0} step="any" value={ingQty} onChange={(e) => setIngQty(e.target.value)} className={INPUT} style={{ width: '8rem' }} />
                </div>
                <span className="font-body-md text-on-surface-variant pb-2">{numeric[ingIdx]?.unit || ''}</span>
              </div>
            )}
          </div>
        )}

        {recipe.measure_type === 'mold' && (
          <div className="flex flex-col gap-4">
            {isAdmin && (
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="mmode" checked={mMode === 'mold'} onChange={() => setMMode('mold')} /> Ajuster par moule
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="mmode" checked={mMode === 'ia'} onChange={() => setMMode('ia')} />
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[18px] text-primary">auto_awesome</span>
                    Ajuster les quantités par IA
                  </span>
                </label>
              </div>
            )}
            {qtyInfoBlock}
            {mMode === 'ia' ? (
              aiBlock
            ) : (
              <div className="flex flex-col gap-3" style={{ maxWidth: '32rem' }}>
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex flex-col gap-1">
                    <label className={LBL}>Nombre</label>
                    <input type="number" min={1} value={moldCount} onChange={(e) => setMoldCount(e.target.value)} className={INPUT} style={{ width: '6rem' }} />
                  </div>
                  <select
                    value={targetType}
                    onChange={(e) => {
                      setTargetType(e.target.value);
                      setDims({});
                    }}
                    className={`${INPUT} flex-1`}
                    style={{ minWidth: '220px' }}
                  >
                    <option value="">{moldSummary ? `Moule de la recette — ${moldSummary}` : 'Moule de la recette'}</option>
                    {moldTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.forme ? ` (${t.forme})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap gap-4 items-end">
                  {(MOLD_FORME_DIMS[targetForme || ''] || []).map((k) => (
                    <div key={k} className="flex flex-col">
                      <label className={LBL}>{DIM_LABELS[k] || k}</label>
                      <div className="flex items-baseline gap-2">
                        <input type="number" min={0} step="any" value={dims[k] || ''} onChange={(e) => setDims((p) => ({ ...p, [k]: e.target.value }))} className={INPUT} style={{ width: '6.5rem' }} />
                        <span className="text-sm text-on-surface-variant">cm</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-on-surface-variant">
                  Indiquez le nombre et les dimensions visés : les quantités seront recalculées (pâte et glaçage selon la
                  surface, appareil selon le volume).
                </p>
              </div>
            )}
          </div>
        )}

        {recipe.measure_type === 'dimensions' && (
          <div className="flex flex-col gap-4">
            {qtyInfoBlock}
            {aiBlock}
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap pt-2">
          <button
            type="button"
            onClick={validate}
            disabled={busy}
            className="bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md uppercase tracking-[0.15em] hover:shadow-xl active:scale-95 transition-all disabled:opacity-60"
          >
            {busy ? 'Enregistrement…' : 'Valider'}
          </button>
          <button
            type="button"
            onClick={close}
            className="border border-outline px-6 py-3 rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
