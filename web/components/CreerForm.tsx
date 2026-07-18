'use client';

// Éditeur de recette (porté de creer.html) : création et édition.
// Périmètre : infos générales, rendement (unités / moule / dimensions),
// difficulté, tags, ustensiles, étapes (temps, jour, description, astuces,
// ingrédients, mode d'adaptation), photo principale. Enregistre en brouillon
// ou soumet à publication, en écrivant recipes + recipe_tags + recipe_utensils
// + ingredient_groups + ingredients + recipe_steps.
//
// Différé vs vanilla : réorganisation par glisser-déposer, éditeur enrichi
// (gras/italique), autocomplétion des listes de référence (remplacée par une
// datalist), photos par étape, découpage en sous-étapes (la description libre
// les remplace ; à la relecture d'un import, les sous-étapes existantes sont
// regroupées dans la description).
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageSlot } from '@/components/ImageSlot';
import type { Tag, Difficulty } from '@/lib/taxonomy';
import type { MoldType } from '@/lib/admin';
import type { Unit } from '@/lib/profile';
import type { RecipeFull } from '@/lib/recipes';

type MeasureType = 'units' | 'mold' | 'dimensions';
type IngLine = { key: string; name: string; qty: string; unit: string; comment: string };
type StepState = {
  key: string;
  title: string;
  dayOffset: string;
  prep: string;
  cook: string;
  temp: string;
  wait: string;
  description: string;
  tips: string;
  scaling: string;
  ings: IngLine[];
};

const FORME_DIMS: Record<string, { key: string; label: string }[]> = {
  cylindre: [{ key: 'diametre', label: 'Diamètre' }, { key: 'hauteur', label: 'Hauteur' }],
  rectangulaire: [{ key: 'longueur', label: 'Longueur' }, { key: 'largeur', label: 'Largeur' }, { key: 'hauteur', label: 'Hauteur' }],
  oblong: [{ key: 'longueur', label: 'Longueur' }, { key: 'largeur', label: 'Largeur' }, { key: 'hauteur', label: 'Hauteur' }],
  'demi-cylindre': [{ key: 'longueur', label: 'Longueur' }, { key: 'largeur', label: 'Largeur' }],
};

function composeMoldDesc(forme: string | null | undefined, dims: Record<string, number>): string | null {
  const keys = (FORME_DIMS[forme || ''] || []).map((d) => d.key);
  const parts = keys.filter((k) => dims[k] != null).map((k) => (k === 'diametre' ? 'Ø ' : '') + dims[k]);
  return parts.length ? parts.join(' × ') + ' cm' : null;
}

let uid = 0;
const key = () => `k${uid++}`;
const emptyIng = (): IngLine => ({ key: key(), name: '', qty: '', unit: '', comment: '' });
const emptyStep = (): StepState => ({
  key: key(),
  title: '',
  dayOffset: '',
  prep: '',
  cook: '',
  temp: '',
  wait: '',
  description: '',
  tips: '',
  scaling: 'simple',
  ings: [emptyIng()],
});

// Init des étapes depuis une recette existante (édition).
function stepsFromRecipe(r: RecipeFull): StepState[] {
  const groupsByOrder: Record<number, RecipeFull['ingredient_groups'][number]> = {};
  (r.ingredient_groups || []).forEach((g) => (groupsByOrder[g.order_index || 0] = g));
  const steps = [...(r.recipe_steps || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  if (!steps.length) return [emptyStep()];
  return steps.map((s) => {
    const grp = groupsByOrder[s.order_index || 0];
    const desc = Array.isArray(s.sous_etapes) && s.sous_etapes.length ? s.sous_etapes.join('\n') : s.description || '';
    const ings = [...(grp?.ingredients || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    return {
      key: key(),
      title: s.title || '',
      dayOffset: s.day_offset ? String(s.day_offset) : '',
      prep: s.prep_time != null ? String(s.prep_time) : '',
      cook: s.cook_time != null ? String(s.cook_time) : '',
      temp: s.cook_temp != null ? String(s.cook_temp) : '',
      wait: s.wait_time != null ? String(s.wait_time) : '',
      description: desc,
      tips: s.tips || '',
      scaling: 'simple',
      ings: ings.length
        ? ings.map((i) => ({ key: key(), name: i.name, qty: i.quantity || '', unit: i.unit || '', comment: i.comment || '' }))
        : [emptyIng()],
    };
  });
}

export function CreerForm({
  tags,
  units,
  moldTypes,
  difficulties,
  ingredientRefs,
  editRecipe,
}: {
  tags: Tag[];
  units: Unit[];
  moldTypes: MoldType[];
  difficulties: Difficulty[];
  ingredientRefs: string[];
  editRecipe: RecipeFull | null;
}) {
  const router = useRouter();
  const editingId = editRecipe?.id ?? null;

  const [title, setTitle] = useState(editRecipe?.title || '');
  const [description, setDescription] = useState(editRecipe?.description || '');
  const [tips, setTips] = useState(editRecipe?.tips || '');
  const [isPublic, setIsPublic] = useState(editRecipe?.is_public !== false);
  const [hero, setHero] = useState<string | null>(editRecipe?.hero_image_url ?? null);
  const [level, setLevel] = useState<number>(
    editRecipe?.difficulties?.level ?? difficulties.find((d) => d.id === (editRecipe as { difficulty_id?: number } | null)?.difficulty_id)?.level ?? 0,
  );
  const [selectedTags, setSelectedTags] = useState<Set<number>>(
    () => new Set((editRecipe?.recipe_tags || []).map((t) => t.tags?.id).filter((x): x is number => x != null)),
  );

  const [measure, setMeasure] = useState<MeasureType>((editRecipe?.measure_type as MeasureType) || 'units');
  const [qtyAmount, setQtyAmount] = useState(editRecipe?.measure_type === 'units' ? editRecipe?.yield_qty || '' : '');
  const [qtyUnit, setQtyUnit] = useState(editRecipe?.measure_type === 'units' ? editRecipe?.yield_unit || '' : '');
  const [moldTypeId, setMoldTypeId] = useState(editRecipe?.mold_type_id ? String(editRecipe.mold_type_id) : '');
  const [moldCount, setMoldCount] = useState(editRecipe?.measure_type === 'mold' ? editRecipe?.yield_qty || '' : '');
  const [dims, setDims] = useState<Record<string, string>>(() => {
    const md = (editRecipe as { mold_dims?: Record<string, number> } | null)?.mold_dims;
    const out: Record<string, string> = {};
    if (md) for (const k of Object.keys(md)) out[k] = String(md[k]);
    return out;
  });
  const [dimsDesc, setDimsDesc] = useState(editRecipe?.measure_type === 'dimensions' ? editRecipe?.yield_desc || '' : '');

  const [prep, setPrep] = useState(editRecipe?.prep_time != null ? String(editRecipe.prep_time) : '');
  const [wait, setWait] = useState(editRecipe?.wait_time != null ? String(editRecipe.wait_time) : '');
  const [cook, setCook] = useState(editRecipe?.cook_time != null ? String(editRecipe.cook_time) : '');
  const [total, setTotal] = useState(editRecipe?.total_time != null ? String(editRecipe.total_time) : '');

  const [utensils, setUtensils] = useState<{ key: string; name: string; comment: string }[]>(() => {
    const us = [...(editRecipe?.recipe_utensils || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    return us.length ? us.map((u) => ({ key: key(), name: u.name, comment: u.comment || '' })) : [{ key: key(), name: '', comment: '' }];
  });

  const [steps, setSteps] = useState<StepState[]>(() => (editRecipe ? stepsFromRecipe(editRecipe) : [emptyStep()]));
  const [busy, setBusy] = useState(false);

  const moldForme = useMemo(() => moldTypes.find((t) => String(t.id) === moldTypeId)?.forme || null, [moldTypes, moldTypeId]);
  const inp = 'border border-outline-variant rounded px-3 py-2 bg-white text-[15px] focus:outline-none focus:border-primary';

  // ── Updaters étapes ──
  const patchStep = (i: number, p: Partial<StepState>) => setSteps((s) => s.map((st, k) => (k === i ? { ...st, ...p } : st)));
  const patchIng = (si: number, ii: number, p: Partial<IngLine>) =>
    setSteps((s) => s.map((st, k) => (k === si ? { ...st, ings: st.ings.map((g, j) => (j === ii ? { ...g, ...p } : g)) } : st)));
  const addIng = (si: number) => setSteps((s) => s.map((st, k) => (k === si ? { ...st, ings: [...st.ings, emptyIng()] } : st)));
  const delIng = (si: number, ii: number) => setSteps((s) => s.map((st, k) => (k === si ? { ...st, ings: st.ings.filter((_, j) => j !== ii) } : st)));
  const addStep = () => setSteps((s) => [...s, emptyStep()]);
  const delStep = (i: number) => setSteps((s) => (s.length > 1 ? s.filter((_, k) => k !== i) : s));

  async function submit(status: 'draft' | 'pending') {
    if (!title.trim()) {
      alert('Donnez un titre à votre recette.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/connexion');
        return;
      }

      const gmin = (v: string): number | null => {
        const t = v.trim();
        return t ? Math.max(0, parseInt(t, 10) || 0) : null;
      };
      const diffRow = difficulties.reduce<Difficulty | null>(
        (best, d) => (!best || Math.abs(d.level - level) < Math.abs(best.level - level) ? d : best),
        null,
      );

      let yQty: string | null = null;
      let yUnit: string | null = null;
      let yDesc: string | null = null;
      let moldTypeIdNum: number | null = null;
      let moldDims: Record<string, number> | null = null;
      if (measure === 'units') {
        yQty = qtyAmount.trim() || null;
        yUnit = qtyUnit || null;
      } else if (measure === 'mold') {
        moldTypeIdNum = Number(moldTypeId) || null;
        const parsed: Record<string, number> = {};
        for (const k of Object.keys(dims)) {
          const v = parseFloat(String(dims[k]).replace(',', '.'));
          if (!isNaN(v)) parsed[k] = v;
        }
        moldDims = Object.keys(parsed).length ? parsed : null;
        const count = parseInt(moldCount, 10);
        yQty = count > 0 ? String(count) : null;
        const dimsTxt = composeMoldDesc(moldForme, parsed);
        yDesc = dimsTxt ? (count > 1 ? `${count} × ${dimsTxt}` : dimsTxt) : null;
      } else {
        yDesc = dimsDesc.trim() || null;
      }

      let finalStatus: string = status;
      if (status === 'pending' && !isPublic) finalStatus = 'published';

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        is_public: isPublic,
        status: finalStatus,
        difficulty_id: diffRow?.id ?? null,
        measure_type: measure,
        yield_qty: yQty,
        yield_unit: yUnit,
        yield_desc: yDesc,
        mold_type_id: moldTypeIdNum,
        mold_dims: moldDims,
        tips: tips.trim() || null,
        prep_time: gmin(prep),
        wait_time: gmin(wait),
        cook_time: gmin(cook),
        total_time: gmin(total),
        hero_image_url: hero,
      };

      let recipeId: string;
      if (editingId) {
        const { error } = await supabase.from('recipes').update(payload).eq('id', editingId);
        if (error) throw error;
        recipeId = editingId;
        await supabase.from('recipe_tags').delete().eq('recipe_id', editingId);
        await supabase.from('recipe_utensils').delete().eq('recipe_id', editingId);
        await supabase.from('ingredient_groups').delete().eq('recipe_id', editingId);
        await supabase.from('recipe_steps').delete().eq('recipe_id', editingId);
      } else {
        const { data, error } = await supabase.from('recipes').insert({ ...payload, author_id: user.id }).select('id').single();
        if (error || !data) throw error || new Error('Création refusée');
        recipeId = data.id;
      }

      if (selectedTags.size > 0) {
        await supabase.from('recipe_tags').insert([...selectedTags].map((tag_id) => ({ recipe_id: recipeId, tag_id })));
      }

      const utRows = utensils
        .map((u, i) => ({ recipe_id: recipeId, name: u.name.trim(), comment: u.comment.trim() || null, order_index: i }))
        .filter((u) => u.name);
      if (utRows.length) await supabase.from('recipe_utensils').insert(utRows);

      for (let gi = 0; gi < steps.length; gi++) {
        const st = steps[gi];
        const desc = st.description.trim();
        const lines = st.ings
          .map((l, i) => ({
            name: l.name.trim(),
            quantity: l.qty.trim() || null,
            unit: l.unit || null,
            comment: l.comment.trim() || null,
            order_index: i,
          }))
          .filter((l) => l.name);
        const hasContent = st.title.trim() || desc || lines.length;
        if (!hasContent) continue;

        await supabase.from('recipe_steps').insert({
          recipe_id: recipeId,
          step_number: gi + 1,
          title: st.title.trim() || `Étape ${gi + 1}`,
          description: desc || null,
          prep_time: gmin(st.prep),
          cook_time: gmin(st.cook),
          cook_temp: gmin(st.temp),
          wait_time: gmin(st.wait),
          day_offset: Math.max(0, parseInt(st.dayOffset, 10) || 0),
          tips: st.tips.trim() || null,
          sous_etapes: null,
          order_index: gi,
        });

        if (lines.length) {
          const { data: grp, error: grpErr } = await supabase
            .from('ingredient_groups')
            .insert({ recipe_id: recipeId, name: st.title.trim() || `Étape ${gi + 1}`, order_index: gi, scaling_mode: st.scaling })
            .select('id')
            .single();
          if (grpErr || !grp) {
            console.error('Groupe non enregistré :', grpErr?.message);
            continue;
          }
          await supabase.from('ingredients').insert(lines.map((l) => ({ ...l, group_id: grp.id })));
        }
      }

      router.push(status === 'draft' ? '/profil' : `/recette/${recipeId}`);
    } catch (e) {
      alert('Erreur : ' + ((e as Error).message || "Impossible d'enregistrer la recette."));
      setBusy(false);
    }
  }

  const scalingOptions =
    measure === 'mold'
      ? [
          ['simple', 'Selon la taille du moule (volume)'],
          ['foncage', 'Recouvre une surface (fonçage, glaçage…)'],
          ['aucun', "Pas d'ajustement pour cette étape"],
        ]
      : [
          ['simple', 'Ajustement selon la quantité produite'],
          ['aucun', "Pas d'ajustement pour cette étape"],
        ];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary">
          {editingId ? 'Modifier la recette' : 'Créer une recette'}
        </h1>
        <label className="flex items-center gap-2 text-label-md font-label-md text-on-surface-variant">
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="w-4 h-4" />
          {isPublic ? 'Public' : 'Privé'}
        </label>
      </div>

      {/* Infos générales */}
      <section className="flex flex-col gap-5">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre — ex : Saint-Honoré traditionnel" className={`${inp} font-headline-md text-[22px]`} />
        <label className="flex flex-col gap-1">
          <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Description rapide</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={inp} />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Photo principale</span>
            <div className="aspect-[16/9] w-full max-w-md border border-outline-variant overflow-hidden">
              <ImageSlot src={hero} onChange={setHero} shape="rect" maxWidth={1200} placeholder="Photo principale (16:9)" className="w-full h-full" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Difficulté</span>
            <div className="flex items-center gap-2 h-8">
              {[1, 2, 3, 4, 5].map((i) => (
                <button key={i} type="button" onClick={() => setLevel(i === level ? i - 1 : i)} className={`maryse-pill ${i <= level ? 'bg-primary' : 'bg-outline-variant'}`} aria-label={`Niveau ${i}`} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Rendement */}
      <section className="flex flex-col gap-4 border-t border-outline-variant pt-6">
        <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Quantité produite</span>
        <div className="flex flex-wrap gap-4">
          {(['units', 'mold', 'dimensions'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="radio" name="measure" checked={measure === m} onChange={() => setMeasure(m)} />
              {m === 'units' ? 'Unités / poids' : m === 'mold' ? 'Moule' : 'Dimensions libres'}
            </label>
          ))}
        </div>
        {measure === 'units' && (
          <div className="flex flex-wrap items-end gap-3">
            <input value={qtyAmount} onChange={(e) => setQtyAmount(e.target.value)} placeholder="ex : 8" className={inp} style={{ width: '7rem' }} />
            <select value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value)} className={inp}>
              <option value="">— unité —</option>
              {units.map((u) => (
                <option key={u.id} value={u.name}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {measure === 'mold' && (
          <div className="flex flex-wrap items-end gap-4">
            <select value={moldTypeId} onChange={(e) => setMoldTypeId(e.target.value)} className={inp}>
              <option value="">Choisir le type de moule</option>
              {moldTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <label className="flex flex-col text-sm">
              <span className="font-label-md text-[10px] uppercase text-on-surface-variant mb-1">Nombre</span>
              <input value={moldCount} onChange={(e) => setMoldCount(e.target.value)} type="number" min={1} placeholder="ex : 6" className={inp} style={{ width: '6rem' }} />
            </label>
            {(FORME_DIMS[moldForme || ''] || []).map((d) => (
              <label key={d.key} className="flex flex-col text-sm">
                <span className="font-label-md text-[10px] uppercase text-on-surface-variant mb-1">{d.label}</span>
                <div className="flex items-baseline gap-1">
                  <input value={dims[d.key] || ''} onChange={(e) => setDims((p) => ({ ...p, [d.key]: e.target.value }))} type="number" min={0} step="any" className={inp} style={{ width: '5rem' }} />
                  <span className="text-sm text-on-surface-variant">cm</span>
                </div>
              </label>
            ))}
          </div>
        )}
        {measure === 'dimensions' && (
          <input value={dimsDesc} onChange={(e) => setDimsDesc(e.target.value)} placeholder="ex : cadre 30 × 20 cm" className={inp} style={{ maxWidth: '24rem' }} />
        )}
      </section>

      {/* Temps globaux */}
      <section className="border-t border-outline-variant pt-6">
        <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Temps (minutes)</span>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3">
          {(
            [
              ['Préparation', prep, setPrep],
              ['Attente', wait, setWait],
              ['Cuisson', cook, setCook],
              ['Total', total, setTotal],
            ] as const
          ).map(([label, val, set]) => (
            <label key={label} className="flex flex-col gap-1 text-sm">
              <span className="font-label-md text-[10px] uppercase text-on-surface-variant">{label}</span>
              <input value={val} onChange={(e) => set(e.target.value)} type="number" min={0} className={inp} />
            </label>
          ))}
        </div>
      </section>

      {/* Tags */}
      {tags.length > 0 && (
        <section className="border-t border-outline-variant pt-6">
          <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Tags</span>
          <div className="flex flex-wrap gap-2 mt-3">
            {tags.map((t) => {
              const on = selectedTags.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    setSelectedTags((prev) => {
                      const n = new Set(prev);
                      if (n.has(t.id)) n.delete(t.id);
                      else n.add(t.id);
                      return n;
                    })
                  }
                  className={`px-3 py-1 rounded-full text-[12px] font-label-md transition-colors ${
                    on ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant hover:text-primary'
                  }`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Ustensiles */}
      <section className="border-t border-outline-variant pt-6">
        <div className="flex items-center justify-between mb-3">
          <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Ustensiles</span>
          <button type="button" onClick={() => setUtensils((u) => [...u, { key: key(), name: '', comment: '' }])} className="text-primary font-label-md text-[12px] hover:underline flex items-center gap-1">
            <span className="material-symbols-outlined text-[16px]">add</span> Ajouter
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {utensils.map((u, i) => (
            <div key={u.key} className="flex flex-wrap gap-2 items-center">
              <input value={u.name} onChange={(e) => setUtensils((p) => p.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder="ex : Poche à douille" className={inp} style={{ width: '14rem' }} />
              <input value={u.comment} onChange={(e) => setUtensils((p) => p.map((x, k) => (k === i ? { ...x, comment: e.target.value } : x)))} placeholder="commentaire (optionnel)" className={`${inp} flex-1`} />
              <button type="button" onClick={() => setUtensils((p) => (p.length > 1 ? p.filter((_, k) => k !== i) : p))} className="text-error hover:opacity-70">
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Étapes */}
      <section className="border-t border-outline-variant pt-6 flex flex-col gap-8">
        <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Étapes</span>
        {steps.map((st, si) => (
          <div key={st.key} className="border border-outline-variant rounded-xl overflow-hidden">
            <div className="bg-surface-container-high px-6 py-3 flex items-center gap-3">
              <span className="font-headline-md text-[18px] text-primary">{si + 1}.</span>
              <input value={st.title} onChange={(e) => patchStep(si, { title: e.target.value })} placeholder="Nom de l'étape" className={`${inp} font-headline-md text-[18px] flex-1`} />
              <button type="button" onClick={() => delStep(si)} className="text-error hover:opacity-70" title="Supprimer l'étape">
                <span className="material-symbols-outlined text-[20px]">delete</span>
              </button>
            </div>

            <div className="p-6 flex flex-col gap-5">
              <div className="flex flex-wrap gap-3">
                {(
                  [
                    ['Réalisation (min)', st.prep, (v: string) => patchStep(si, { prep: v })],
                    ['Attente (min)', st.wait, (v: string) => patchStep(si, { wait: v })],
                    ['Cuisson (min)', st.cook, (v: string) => patchStep(si, { cook: v })],
                    ['T°C', st.temp, (v: string) => patchStep(si, { temp: v })],
                    ['J −', st.dayOffset, (v: string) => patchStep(si, { dayOffset: v })],
                  ] as const
                ).map(([label, val, set]) => (
                  <label key={label} className="flex flex-col text-center text-sm">
                    <span className="font-label-md text-[9px] uppercase text-on-surface-variant mb-1">{label}</span>
                    <input value={val} onChange={(e) => set(e.target.value)} type="number" min={0} className={`${inp} text-center`} style={{ width: '5rem' }} />
                  </label>
                ))}
              </div>

              <label className="flex flex-col gap-1">
                <span className="font-label-md text-[10px] uppercase text-on-surface-variant">Description</span>
                <textarea value={st.description} onChange={(e) => patchStep(si, { description: e.target.value })} rows={4} className={inp} placeholder="Décrivez cette étape (une ligne par sous-étape si besoin)…" />
              </label>

              {/* Ingrédients de l'étape */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-label-md text-[10px] uppercase text-on-surface-variant">Ingrédients</span>
                  <select value={st.scaling} onChange={(e) => patchStep(si, { scaling: e.target.value })} className="border border-outline-variant rounded px-2 py-1 text-[12px] bg-white">
                    {scalingOptions.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  {st.ings.map((g, ii) => (
                    <div key={g.key} className="flex flex-wrap gap-2 items-center">
                      <input list="dl-ingredients" value={g.name} onChange={(e) => patchIng(si, ii, { name: e.target.value })} placeholder="ingrédient" className={inp} style={{ width: '12rem' }} autoComplete="off" />
                      <input value={g.qty} onChange={(e) => patchIng(si, ii, { qty: e.target.value })} placeholder="qté" type="number" min={0} step="any" className={`${inp} text-center`} style={{ width: '5rem' }} />
                      <select value={g.unit} onChange={(e) => patchIng(si, ii, { unit: e.target.value })} className={inp} style={{ width: '8rem' }}>
                        <option value="">— unité —</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.name}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <input value={g.comment} onChange={(e) => patchIng(si, ii, { comment: e.target.value })} placeholder="note" className={`${inp} flex-1`} style={{ minWidth: '8rem' }} />
                      <button type="button" onClick={() => delIng(si, ii)} className="text-error hover:opacity-70">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => addIng(si)} className="mt-2 flex items-center gap-1 text-primary font-label-md text-[12px] hover:underline">
                  <span className="material-symbols-outlined text-[16px]">add_circle</span> Ajouter un ingrédient
                </button>
              </div>

              <label className="flex flex-col gap-1">
                <span className="font-label-md text-[10px] uppercase text-on-surface-variant">Conseils &amp; astuces de l&apos;étape</span>
                <textarea value={st.tips} onChange={(e) => patchStep(si, { tips: e.target.value })} rows={2} className={inp} />
              </label>
            </div>
          </div>
        ))}
        <button type="button" onClick={addStep} className="flex items-center gap-2 text-secondary font-label-md text-label-md hover:underline w-fit">
          <span className="material-symbols-outlined">add_circle</span> Ajouter une étape
        </button>
      </section>

      {/* Conseils de la recette */}
      <section className="border-t border-outline-variant pt-6">
        <label className="flex flex-col gap-1">
          <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Conseils et astuces de la recette</span>
          <textarea value={tips} onChange={(e) => setTips(e.target.value)} rows={3} className={inp} />
        </label>
      </section>

      {/* Actions */}
      <div className="sticky bottom-0 bg-surface/95 backdrop-blur border-t border-outline-variant py-4 flex flex-wrap gap-3" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        <button type="button" onClick={() => submit('pending')} disabled={busy} className="bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-60">
          {isPublic ? 'Publier' : 'Enregistrer'}
        </button>
        <button type="button" onClick={() => submit('draft')} disabled={busy} className="border border-primary text-primary px-6 py-3 rounded-full font-label-md text-label-md hover:bg-primary hover:text-white transition-all active:scale-95 disabled:opacity-60">
          Enregistrer comme brouillon
        </button>
      </div>

      <datalist id="dl-ingredients">
        {ingredientRefs.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </div>
  );
}
