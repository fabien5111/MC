'use client';

// Planification d'une recette (porté du panneau « Planifier » de recette.html) :
// date de dégustation + ajustement (quantité produite / par ingrédient / moule
// via volume-surface / dimensions par IA) + étapes déjà réalisées → crée une
// entrée `planning` (facteur + libellé + overrides). Apparaît ensuite dans
// l'onglet Planning du profil.
//
// Différé vs vanilla : l'affichage « mode planifié » de la recette (quantités
// re-scalées ligne à ligne, dates réelles par jour) et l'édition fine des
// overrides d'ingrédients + le démarrage d'exécution.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { UNITS_LBL, moldMetrics, MOLD_FORME_DIMS, DIM_LABELS } from '@/lib/recipe-view';
import type { MergedIngredient } from '@/lib/recipe-view';
import type { Json } from '@/lib/database.types';

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

export function PlanWidget({
  recipe,
  moldTypes,
  ingredients,
  steps,
}: {
  recipe: PlanRecipe;
  moldTypes: { id: number; name: string; forme: string | null }[];
  ingredients: MergedIngredient[];
  steps: { id: number; title: string | null }[];
}) {
  const router = useRouter();
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());

  // Mode « unités »
  const numeric = ingredients.filter((m) => (num(m.qty) || 0) > 0);
  const [uMode, setUMode] = useState<'qty' | 'ing'>('qty');
  const [qty, setQty] = useState(recipe.yieldQty || '');
  const [ingIdx, setIngIdx] = useState(0);
  const [ingQty, setIngQty] = useState('');

  // Mode « moule »
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

  function compute(): { factor: number; label: string | null; overrides: Record<string, unknown> | null } | null {
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
      } else {
        const want = num(qty);
        if (!want || want <= 0) {
          alert('Indiquez une quantité valide.');
          return null;
        }
        factor = want / num(recipe.yieldQty)!;
        label = `Quantité : ${want} ${unitLbl}`.trim();
      }
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
    return { factor, label, overrides };
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
    const dateTxt = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const lines = [`Planifier « ${recipe.title} » le ${dateTxt} ?`];
    if (res.label) lines.push(res.label);
    if (res.factor !== 1) lines.push(`Les quantités seront multipliées par ${fr(res.factor)}.`);
    if (!confirm(lines.join('\n'))) return;

    setBusy(true);
    const supabase = createClient();
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
    router.push('/profil#planning');
  }

  const INPUT = 'border border-outline-variant rounded px-3 py-2 bg-white font-body-md text-on-surface focus:outline-none focus:border-primary';
  const LBL = 'font-label-md text-label-md text-on-surface-variant uppercase tracking-widest text-[10px]';

  return (
    <details className="group border border-secondary bg-surface-container-low rounded-xl mt-4">
      <summary className="flex items-center justify-between p-4 cursor-pointer list-none">
        <span className="font-label-md text-label-md text-primary flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">calendar_month</span> Planifier cette recette
        </span>
        <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div className="p-6 pt-0 flex flex-col gap-6">
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
            </div>
            {uMode === 'qty' ? (
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

        {recipe.measureType === 'dimensions' && (
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
        )}

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
                  className="w-5 h-5 rounded border-outline text-primary focus:ring-primary cursor-pointer"
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
        </div>
      </div>
    </details>
  );
}
