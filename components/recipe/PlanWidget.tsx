'use client';

// Planification d'une recette (porté du panneau « Planifier » de recette.html) :
// date de dégustation + ajustement (quantité produite / par ingrédient / moule
// via volume-surface / dimensions par IA) + étapes déjà réalisées → crée une
// entrée `planning` (facteur + libellé + overrides). Apparaît ensuite dans
// l'onglet Planning du profil.
//
// En mode édition (crayon du bandeau « Recette planifiée »), modifie l'entrée
// de planning existante à la place d'en créer une nouvelle (porté de
// mcEditPlan / plan-validate en mode édition). Le pré-remplissage se limite à
// la date et, pour le mode « unités », à la quantité ; les modes moule/IA
// repartent d'un formulaire vierge (édition fine du libellé non reconstituée).
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UNITS_LBL, moldMetrics, MOLD_FORME_DIMS, DIM_LABELS } from '@/lib/recipe-view';
import type { MergedIngredient } from '@/lib/recipe-view';
import type { Json } from '@/lib/database.types';
import type { PlanOverrides } from '@/lib/recipe-plan';
import { usePlanCtx } from '@/components/recipe/PlanContext';

const num = (v: string | number | null | undefined): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const fr = (n: number): string => String(n).replace('.', ',');

export type PlanRecipe = {
  id: string;
  title: string;
  measureType: string | null;
  yieldQty: string | null;
  yieldUnit: string | null;
  yieldDesc: string | null;
  moldForme: string | null;
  moldDims: Record<string, number> | null;
  moldSummary: string | null;
  rendement: string | null;
};

export type ExistingPlan = { id: number; plannedDate: string; factor: number | null; overrides: PlanOverrides };

export function PlanWidget({
  recipe,
  moldTypes,
  ingredients,
  steps,
  existingPlan,
  isAdmin = false,
}: {
  recipe: PlanRecipe;
  moldTypes: { id: number; name: string; forme: string | null }[];
  ingredients: MergedIngredient[];
  steps: { id: number; title: string | null }[];
  existingPlan?: ExistingPlan | null;
  // Réservé aux administrateurs pour le moment : ajustement des quantités par IA
  // (texte libre) proposé comme troisième mode d'ajustement dans le mode « unités ».
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const { open, editMode, close } = usePlanCtx();
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());

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
      setDate(existingPlan.plannedDate);
      setDone(new Set(existingPlan.overrides.etapes_faites.map(Number)));
      if (recipe.measureType === 'units') {
        const y = num(recipe.yieldQty);
        if (y) setQty(String(Math.round(y * (existingPlan.factor || 1) * 100) / 100));
      }
    } else if (!editMode) {
      setDate(today);
      setDone(new Set());
      setQty(recipe.yieldQty || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editMode]);

  // Mode « unités »
  const numeric = ingredients.filter((m) => (num(m.qty) || 0) > 0);
  const [uMode, setUMode] = useState<'qty' | 'ing' | 'ia'>('qty');
  const [qty, setQty] = useState(recipe.yieldQty || '');
  const [ingIdx, setIngIdx] = useState(0);
  const [ingQty, setIngQty] = useState('');

  // Mode « moule » (avec, pour les administrateurs, un sous-mode IA en texte libre)
  const [mMode, setMMode] = useState<'mold' | 'ia'>('mold');
  const [moldCount, setMoldCount] = useState(String(parseInt(recipe.yieldQty || '', 10) > 0 ? parseInt(recipe.yieldQty!, 10) : 1));
  const [targetType, setTargetType] = useState(''); // '' = moule de la recette
  const [dims, setDims] = useState<Record<string, string>>({});
  const targetForme = targetType === '' ? recipe.moldForme : moldTypes.find((t) => String(t.id) === targetType)?.forme || null;

  // Mode « dimensions » (IA)
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiCoef, setAiCoef] = useState('');
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  async function askAi() {
    if (aiPrompt.trim().length < 3) {
      alert("Décrivez l'ajustement souhaité.");
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
            rendement: recipe.rendement,
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

  function compute(): {
    factor: number;
    label: string | null;
    overrides: Record<string, unknown> | null;
    etapesFaites: string[];
    moldCoefs: { surface: number; volume: number } | null;
    moldTarget: Record<string, unknown> | null;
  } | null {
    let factor = 1;
    let label: string | null = null;
    let moldCoefs: { surface: number; volume: number } | null = null;
    let moldTarget: Record<string, unknown> | null = null;

    if (recipe.measureType === 'units' && (num(recipe.yieldQty) || 0) > 0) {
      const unitLbl = UNITS_LBL[recipe.yieldUnit || ''] || recipe.yieldUnit || '';
      if (uMode === 'ing') {
        const m = numeric[ingIdx];
        const base = num(m?.qty);
        const want = num(ingQty);
        if (!m || !base || !want || want <= 0) {
          alert('Indiquez une quantité valide.');
          return null;
        }
        factor = want / base;
        label = `Base ${m.name} : ${want} ${m.unit || ''}`.trim();
      } else if (uMode === 'ia') {
        const c = num(aiCoef);
        if (!(c && c > 0)) {
          alert("Cliquez d'abord sur « Calculer le coefficient avec l'IA ».");
          return null;
        }
        factor = c;
        label = aiPrompt.trim() ? `IA : ${aiPrompt.trim().slice(0, 60)}` : `Coefficient : ×${fr(c)}`;
      } else {
        const want = num(qty);
        if (!want || want <= 0) {
          alert('Indiquez une quantité valide.');
          return null;
        }
        factor = want / num(recipe.yieldQty)!;
        label = `Quantité : ${want} ${unitLbl}`.trim();
      }
    } else if (recipe.measureType === 'mold' && mMode === 'ia') {
      const c = num(aiCoef);
      if (!(c && c > 0)) {
        alert("Cliquez d'abord sur « Calculer le coefficient avec l'IA ».");
        return null;
      }
      factor = c;
      label = aiPrompt.trim() ? `IA : ${aiPrompt.trim().slice(0, 60)}` : `Coefficient : ×${fr(c)}`;
    } else if (recipe.measureType === 'mold') {
      const tgtDims: Record<string, number> = {};
      for (const k of MOLD_FORME_DIMS[targetForme || ''] || []) {
        const v = num(dims[k]);
        if (v && v > 0) tgtDims[k] = v;
      }
      const src = moldMetrics(recipe.moldForme, recipe.moldDims || {});
      const tgt = moldMetrics(targetForme, tgtDims);
      const srcCount = parseInt(recipe.yieldQty || '', 10) > 0 ? parseInt(recipe.yieldQty!, 10) : 1;
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
      moldTarget = { type_id: targetType ? Number(targetType) : null, forme: targetForme || null, dims: tgtDims, count: tgtCount };
    } else if (recipe.measureType === 'dimensions') {
      const c = num(aiCoef);
      if (aiPrompt.trim() && !(c && c > 0)) {
        alert("Cliquez d'abord sur « Calculer le coefficient avec l'IA ».");
        return null;
      }
      if (c && c > 0) {
        factor = c;
        label = aiPrompt.trim() ? `IA : ${aiPrompt.trim().slice(0, 60)}` : `Coefficient : ×${fr(c)}`;
      }
    }

    factor = Math.round(factor * 1000) / 1000;
    const etapesFaites = [...done].map(String);
    const overrides =
      etapesFaites.length || moldCoefs || moldTarget
        ? { mods: {}, added: [], etapes_faites: etapesFaites, ...(moldCoefs ? { mold_coefs: moldCoefs } : {}), ...(moldTarget ? { mold_target: moldTarget } : {}) }
        : null;
    return { factor, label, overrides, etapesFaites, moldCoefs, moldTarget };
  }

  async function validate() {
    if (!date) {
      alert('Choisissez une date.');
      return;
    }
    if (date < today) {
      alert("La date doit être aujourd'hui ou dans le futur.");
      return;
    }
    const res = compute();
    if (!res) return;
    const editing = editMode && existingPlan;
    const dateTxt = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const lines = [editing ? `Modifier la planification de « ${recipe.title} » pour le ${dateTxt} ?` : `Planifier « ${recipe.title} » le ${dateTxt} ?`];
    if (res.label) lines.push(res.label);
    if (res.factor !== 1) lines.push(`Les quantités seront multipliées par ${fr(res.factor)}.`);
    if (!confirm(lines.join('\n'))) return;

    setBusy(true);
    const supabase = createClient();

    if (editing) {
      const overrides = {
        ...existingPlan.overrides,
        etapes_faites: res.etapesFaites,
        ...(res.moldCoefs ? { mold_coefs: res.moldCoefs } : {}),
        ...(res.moldTarget ? { mold_target: res.moldTarget } : {}),
      };
      const { error } = await supabase
        .from('planning')
        .update({ planned_date: date, factor: res.factor, adjust_label: res.label, overrides: overrides as unknown as Json })
        .eq('id', existingPlan.id);
      if (error) {
        alert('Erreur : ' + error.message);
        setBusy(false);
        return;
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
    const { error } = await supabase.from('planning').insert({
      user_id: user.id,
      recipe_id: recipe.id,
      planned_date: date,
      factor: res.factor,
      adjust_label: res.label,
      overrides: res.overrides as Json,
      notes: null,
    });
    if (error) {
      alert('Erreur : ' + error.message);
      setBusy(false);
      return;
    }
    close();
    router.push('/profil#planning');
  }

  if (!open) return null;

  const INPUT = 'border border-outline-variant rounded px-3 py-2 bg-white font-body-md text-on-surface focus:outline-none focus:border-primary';
  const LBL = 'font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]';

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
    <div className="mb-12 border border-secondary bg-surface-container-low p-8 rounded-xl">
      <h3 className="font-headline-md text-headline-md text-primary mb-6 flex items-center gap-3">
        <span className="material-symbols-outlined">calendar_month</span>
        {editMode && existingPlan ? 'Modifier la planification' : 'Planifier cette recette'}
      </h3>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2" style={{ maxWidth: '16rem' }}>
          <label className={LBL} htmlFor="plan-date">
            Date de dégustation
          </label>
          <input id="plan-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
        </div>

        {/* Ajustement selon le type de mesure */}
        {recipe.measureType === 'units' && (num(recipe.yieldQty) || 0) > 0 && (
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
            {uMode === 'ia' ? (
              aiBlock
            ) : uMode === 'qty' ? (
              <div className="flex items-end gap-3">
                <div className="flex flex-col gap-2">
                  <label className={LBL}>Quantité à produire</label>
                  <input type="number" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} className={INPUT} style={{ width: '8rem' }} />
                </div>
                <span className="font-body-md text-on-surface-variant pb-2">{UNITS_LBL[recipe.yieldUnit || ''] || recipe.yieldUnit || ''}</span>
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

        {recipe.measureType === 'mold' && (
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
                    <option value="">{recipe.moldSummary ? `Moule de la recette — ${recipe.moldSummary}` : 'Moule de la recette'}</option>
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

        {recipe.measureType === 'dimensions' && aiBlock}

        {/* Étapes déjà réalisées */}
        {steps.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className={LBL}>
              J&apos;ai déjà réalisé ces étapes{' '}
              <span className="normal-case tracking-normal">(leurs ingrédients seront marqués comme déjà en votre possession)</span>
            </span>
            {steps.map((s) => (
              <label key={s.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={done.has(s.id)}
                  onChange={() =>
                    setDone((prev) => {
                      const n = new Set(prev);
                      if (n.has(s.id)) n.delete(s.id);
                      else n.add(s.id);
                      return n;
                    })
                  }
                  className="w-5 h-5 rounded border-outline accent-primary focus:ring-primary cursor-pointer"
                />
                <span className="font-body-md">{s.title || 'Étape'}</span>
              </label>
            ))}
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
