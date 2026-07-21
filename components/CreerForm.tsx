'use client';

// Éditeur de recette (porté de creer.html, mise en page éditoriale fidèle) :
// création et édition. Champs soulignés (.editorial-input), radios/toggle
// custom, sections « Planning de préparation » et « Récapitulatif des
// ingrédients » recalculées en direct depuis les étapes saisies — comme dans
// la version vanilla.
//
// Différé vs vanilla : réorganisation par glisser-déposer des ustensiles
// (l'icône est affichée mais inerte ; celle des étapes est désormais active),
// éditeur de texte enrichi (gras/italique). Le découpage en sous-étapes se fait
// via les lignes de description débutant par « - » (cf. splitSousEtapes).
// Autocomplétion des ingrédients/ustensiles/allergènes via datalist ; ajout à
// la volée d'un libellé inconnu au référentiel réservé aux administrateurs
// (bouton « Ajouter au référentiel »).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageSlot } from '@/components/ImageSlot';
import type { Tag, Difficulty } from '@/lib/taxonomy';
import type { MoldType } from '@/lib/admin';
import type { Unit } from '@/lib/profile';
import type { RecipeFull } from '@/lib/recipes';

type MeasureType = 'units' | 'mold' | 'dimensions';
type IngLine = { key: string; name: string; qty: string; unit: string; comment: string; allergen: string };
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
  photos: (string | null)[];
  collapsed: boolean;
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

// Découpage de la description en sous-étapes : chaque ligne débutant par un
// tiret « - » ou une puce « • » devient une sous-étape distincte (même logique
// que la fiche recette et l'exécution guidée). Renvoie la liste des sous-étapes
// lorsqu'il y en a au moins deux, sinon `null` (description libre conservée).
function splitSousEtapes(description: string): string[] | null {
  const parts = description
    .split(/(?:^|(?<=\s))[-•]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : null;
}

let uid = 0;
const key = () => `k${uid++}`;
const emptyIng = (): IngLine => ({ key: key(), name: '', qty: '', unit: '', comment: '', allergen: '' });
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
  photos: [null, null, null, null],
  collapsed: false,
});

function stepsFromRecipe(r: RecipeFull): StepState[] {
  const groupsByOrder: Record<number, RecipeFull['ingredient_groups'][number]> = {};
  (r.ingredient_groups || []).forEach((g) => (groupsByOrder[g.order_index || 0] = g));
  const steps = [...(r.recipe_steps || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  if (!steps.length) return [emptyStep()];
  return steps.map((s) => {
    const grp = groupsByOrder[s.order_index || 0];
    // Réédition : on réaffiche le marqueur « - » de chaque sous-étape pour que
    // le découpage reste modifiable et se conserve à l'enregistrement.
    const desc =
      Array.isArray(s.sous_etapes) && s.sous_etapes.length
        ? s.sous_etapes.map((t) => `- ${t}`).join('\n')
        : s.description || '';
    const ings = [...(grp?.ingredients || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const photos = [...(s.step_photos || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)).map((p) => p.url);
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
        ? ings.map((i) => ({ key: key(), name: i.name, qty: i.quantity || '', unit: i.unit || '', comment: i.comment || '', allergen: i.allergen || '' }))
        : [emptyIng()],
      photos: [0, 1, 2, 3].map((i) => photos[i] || null),
      collapsed: false,
    };
  });
}

// Fusion des lignes d'ingrédients identiques (nom + unité), quantités numériques additionnées.
function mergeRecapLines(steps: StepState[]): { name: string; qty: string; unit: string }[] {
  const merged: { key: string; name: string; qty: string; unit: string }[] = [];
  steps.forEach((st) =>
    st.ings.forEach((i) => {
      const name = i.name.trim();
      if (!name) return;
      const mkey = name.toLowerCase() + '|' + i.unit.toLowerCase();
      const ex = merged.find((m) => m.key === mkey);
      if (!ex) {
        merged.push({ key: mkey, name, qty: i.qty.trim(), unit: i.unit });
        return;
      }
      const a = parseFloat(String(ex.qty).replace(',', '.'));
      const b = parseFloat(String(i.qty).replace(',', '.'));
      if (!isNaN(a) && !isNaN(b)) ex.qty = String(+(a + b).toFixed(2));
      else ex.qty = [ex.qty, i.qty].filter(Boolean).join(' + ');
    }),
  );
  merged.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return merged.map(({ name, qty, unit }) => ({ name, qty, unit }));
}

export function CreerForm({
  tags,
  units,
  moldTypes,
  difficulties,
  ingredientRefs,
  refAllergens,
  allergens,
  utensilRefs,
  isAdmin,
  editRecipe,
}: {
  tags: Tag[];
  units: Unit[];
  moldTypes: MoldType[];
  difficulties: Difficulty[];
  ingredientRefs: string[];
  refAllergens: Record<string, string>;
  allergens: { id: number; name: string }[];
  utensilRefs: string[];
  isAdmin: boolean;
  editRecipe: RecipeFull | null;
}) {
  const router = useRouter();
  const editingId = editRecipe?.id ?? null;

  const [title, setTitle] = useState(editRecipe?.title || '');
  const [description, setDescription] = useState(editRecipe?.description || '');
  const [tips, setTips] = useState(editRecipe?.tips || '');
  const [source, setSource] = useState(editRecipe?.source || '');
  const [sourceUrl, setSourceUrl] = useState(editRecipe?.source_url || '');
  const [videoUrl, setVideoUrl] = useState(editRecipe?.video_url || '');
  const [servingAdvice, setServingAdvice] = useState(editRecipe?.serving_advice || '');
  const [isPublic, setIsPublic] = useState(editRecipe?.is_public !== false);
  const [hero, setHero] = useState<string | null>(editRecipe?.hero_image_url ?? null);
  const [level, setLevel] = useState<number>(
    editRecipe?.difficulties?.level ?? difficulties.find((d) => d.id === (editRecipe as { difficulty_id?: number } | null)?.difficulty_id)?.level ?? 0,
  );
  const [selectedTags, setSelectedTags] = useState<Map<number, string>>(
    () => new Map((editRecipe?.recipe_tags || []).map((t) => [t.tags?.id, t.tags?.name] as [number, string]).filter(([id]) => id != null)),
  );
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  const [measure, setMeasure] = useState<MeasureType>((editRecipe?.measure_type as MeasureType) || 'units');
  const [qtyAmount, setQtyAmount] = useState(editRecipe?.measure_type === 'units' ? editRecipe?.yield_qty || '' : '');
  const [qtyUnit, setQtyUnit] = useState(editRecipe?.measure_type === 'units' ? editRecipe?.yield_unit || 'unite' : 'unite');
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
  const [timeTouched, setTimeTouched] = useState({ prep: !!editRecipe, wait: !!editRecipe, cook: !!editRecipe, total: !!editRecipe });

  const [utensils, setUtensils] = useState<{ key: string; name: string; comment: string }[]>(() => {
    const us = [...(editRecipe?.recipe_utensils || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    return us.length ? us.map((u) => ({ key: key(), name: u.name, comment: u.comment || '' })) : [{ key: key(), name: '', comment: '' }];
  });

  const [steps, setSteps] = useState<StepState[]>(() => (editRecipe ? stepsFromRecipe(editRecipe) : [emptyStep()]));
  const [busy, setBusy] = useState(false);
  // Index de l'étape en cours de glisser-déposer (null si aucun déplacement).
  const [dragStep, setDragStep] = useState<number | null>(null);
  // Ingrédients / ustensiles / allergènes ajoutés au référentiel pendant la
  // saisie (admin) : complètent les listes serveur pour l'autocomplétion et
  // masquent aussitôt le bouton d'ajout, sans recharger la page.
  const [extraIngredientRefs, setExtraIngredientRefs] = useState<string[]>([]);
  const [extraUtensilRefs, setExtraUtensilRefs] = useState<string[]>([]);
  const [extraAllergens, setExtraAllergens] = useState<{ id: number; name: string }[]>([]);
  // Allergène associé à un ingrédient ajouté à la volée : complète refAllergens
  // pour que la prochaine saisie du même ingrédient le pré-remplisse.
  const [extraRefAllergens, setExtraRefAllergens] = useState<Record<string, string>>({});
  const [refBusy, setRefBusy] = useState<string | null>(null);

  const allIngredientRefs = useMemo(() => [...ingredientRefs, ...extraIngredientRefs], [ingredientRefs, extraIngredientRefs]);
  const allUtensilRefs = useMemo(() => [...utensilRefs, ...extraUtensilRefs], [utensilRefs, extraUtensilRefs]);
  const allAllergens = useMemo(() => [...allergens, ...extraAllergens], [allergens, extraAllergens]);
  const knownIngredients = useMemo(() => new Set(allIngredientRefs.map((n) => n.trim().toLowerCase())), [allIngredientRefs]);
  const knownUtensils = useMemo(() => new Set(allUtensilRefs.map((n) => n.trim().toLowerCase())), [allUtensilRefs]);
  const allergenIdByName = useMemo(() => new Map(allAllergens.map((a) => [a.name.trim().toLowerCase(), a.id])), [allAllergens]);
  const refAllergenMap = useMemo(() => ({ ...refAllergens, ...extraRefAllergens }), [refAllergens, extraRefAllergens]);

  // Ajout à la volée d'un libellé dans une table de référence (réservé aux
  // administrateurs — bouton affiché uniquement si `isAdmin`). L'insertion passe
  // par le client navigateur : la RLS n'autorise l'écriture qu'au rôle admin.
  async function addUtensilRef(name: string) {
    const clean = name.trim();
    if (!clean) return;
    setRefBusy(`utensils:${clean.toLowerCase()}`);
    const { error } = await createClient().from('utensils').insert({ name: clean });
    setRefBusy(null);
    if (error) return void alert('Erreur : ' + error.message);
    setExtraUtensilRefs((p) => [...p, clean]);
  }

  // Ajout d'un ingrédient au référentiel avec son allergène : si l'allergène
  // saisi n'existe pas encore dans la table `allergens`, on le crée d'abord,
  // puis on lie son id à l'ingrédient (`ingredient_refs.allergen_id`).
  async function addIngredientRef(name: string, allergenName: string) {
    const clean = name.trim();
    if (!clean) return;
    setRefBusy(`ingredient_refs:${clean.toLowerCase()}`);
    const supabase = createClient();
    const allergen = allergenName.trim();
    let allergenId: number | null = null;
    if (allergen) {
      const existing = allergenIdByName.get(allergen.toLowerCase());
      if (existing != null) {
        allergenId = existing;
      } else {
        const { data, error } = await supabase.from('allergens').insert({ name: allergen }).select('id, name').single();
        if (error || !data) {
          setRefBusy(null);
          return void alert('Erreur (allergène) : ' + (error?.message ?? 'insertion impossible'));
        }
        allergenId = data.id;
        setExtraAllergens((p) => [...p, { id: data.id, name: data.name }]);
      }
    }
    const { error } = await supabase.from('ingredient_refs').insert({ name: clean, allergen_id: allergenId });
    setRefBusy(null);
    if (error) return void alert('Erreur : ' + error.message);
    setExtraIngredientRefs((p) => [...p, clean]);
    setExtraRefAllergens((p) => ({ ...p, [clean.toLowerCase()]: allergen }));
  }

  const moldForme = useMemo(() => moldTypes.find((t) => String(t.id) === moldTypeId)?.forme || null, [moldTypes, moldTypeId]);
  const remainingTags = useMemo(() => tags.filter((t) => !selectedTags.has(t.id)), [tags, selectedTags]);

  // ── Temps globaux : somme automatique tant qu'ils ne sont pas modifiés à la main ──
  function recalcGlobalTimes(nextSteps: StepState[], touched = timeTouched) {
    const sum = (k: 'prep' | 'wait' | 'cook') => nextSteps.reduce((n, s) => n + (parseInt(s[k], 10) || 0), 0);
    if (!touched.prep) setPrep(String(sum('prep') || ''));
    if (!touched.wait) setWait(String(sum('wait') || ''));
    if (!touched.cook) setCook(String(sum('cook') || ''));
    if (!touched.total) {
      const t = (touched.prep ? parseInt(prep, 10) || 0 : sum('prep')) + (touched.wait ? parseInt(wait, 10) || 0 : sum('wait')) + (touched.cook ? parseInt(cook, 10) || 0 : sum('cook'));
      setTotal(String(t > 0 ? t : ''));
    }
  }

  // ── Updaters étapes ──
  function patchStep(i: number, p: Partial<StepState>) {
    setSteps((s) => {
      const next = s.map((st, k) => (k === i ? { ...st, ...p } : st));
      if ('prep' in p || 'wait' in p || 'cook' in p) recalcGlobalTimes(next);
      return next;
    });
  }
  const patchIng = (si: number, ii: number, p: Partial<IngLine>) =>
    setSteps((s) => s.map((st, k) => (k === si ? { ...st, ings: st.ings.map((g, j) => (j === ii ? { ...g, ...p } : g)) } : st)));
  const addIng = (si: number) => setSteps((s) => s.map((st, k) => (k === si ? { ...st, ings: [...st.ings, emptyIng()] } : st)));
  const delIng = (si: number, ii: number) => setSteps((s) => s.map((st, k) => (k === si ? { ...st, ings: st.ings.filter((_, j) => j !== ii) } : st)));
  const patchPhoto = (si: number, pi: number, url: string | null) =>
    setSteps((s) => s.map((st, k) => (k === si ? { ...st, photos: st.photos.map((p, j) => (j === pi ? url : p)) } : st)));
  const addStep = () => setSteps((s) => [...s, emptyStep()]);
  const insertStepBefore = (i: number) => setSteps((s) => [...s.slice(0, i), emptyStep(), ...s.slice(i)]);
  const delStep = (i: number) => {
    if (steps.length <= 1) return;
    const label = steps[i]?.title.trim();
    const msg = label ? `Supprimer l'étape « ${label} » ?` : 'Supprimer cette étape ?';
    if (!confirm(msg)) return;
    setSteps((s) => (s.length > 1 ? s.filter((_, k) => k !== i) : s));
  };
  // Réordonne une étape de l'index `from` vers `to` (glisser-déposer).
  const moveStep = (from: number, to: number) =>
    setSteps((s) => {
      if (from === to || from < 0 || to < 0 || from >= s.length || to >= s.length) return s;
      const next = [...s];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  const toggleCollapse = (i: number) => setSteps((s) => s.map((st, k) => (k === i ? { ...st, collapsed: !st.collapsed } : st)));
  const collapseAll = (v: boolean) => setSteps((s) => s.map((st) => ({ ...st, collapsed: v })));

  // ── Aperçus dérivés (identiques à renderPlanning / renderIngredientsRecap) ──
  const allSameDay = steps.every((s) => !s.dayOffset || parseInt(s.dayOffset, 10) === 0);
  const planningDays = useMemo(() => {
    if (allSameDay) return [];
    const items = steps
      .map((s, i) => ({ title: s.title.trim() || `Étape ${i + 1}`, offset: Math.max(0, parseInt(s.dayOffset, 10) || 0), order: i, isLast: false }))
      .sort((a, b) => b.offset - a.offset || a.order - b.order);
    items.push({ title: 'Dégustation', offset: 0, order: 999, isLast: true });
    const days: { offset: number; items: typeof items }[] = [];
    items.forEach((it) => {
      let d = days.find((x) => x.offset === it.offset);
      if (!d) {
        d = { offset: it.offset, items: [] };
        days.push(d);
      }
      d.items.push(it);
    });
    return days;
  }, [steps, allSameDay]);
  const ingredientsRecap = useMemo(() => mergeRecapLines(steps), [steps]);

  async function submit(status: 'draft' | 'pending', stay = false) {
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
        source: source.trim() || null,
        source_url: sourceUrl.trim() || null,
        video_url: videoUrl.trim() || null,
        serving_advice: servingAdvice.trim() || null,
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

      // En modification, les liaisons ci-dessus ont été supprimées avant
      // réinsertion : toute erreur d'insertion est remontée pour éviter une
      // perte silencieuse (tags/ustensiles/étapes/photos/ingrédients vidés).
      if (selectedTags.size > 0) {
        const { error } = await supabase.from('recipe_tags').insert([...selectedTags.keys()].map((tag_id) => ({ recipe_id: recipeId, tag_id })));
        if (error) throw error;
      }

      const utRows = utensils
        .map((u, i) => ({ recipe_id: recipeId, name: u.name.trim(), comment: u.comment.trim() || null, order_index: i }))
        .filter((u) => u.name);
      if (utRows.length) {
        const { error } = await supabase.from('recipe_utensils').insert(utRows);
        if (error) throw error;
      }

      for (let gi = 0; gi < steps.length; gi++) {
        const st = steps[gi];
        const desc = st.description.trim();
        const lines = st.ings
          .map((l, i) => ({
            name: l.name.trim(),
            quantity: l.qty.trim() || null,
            unit: l.unit || null,
            comment: l.comment.trim() || null,
            allergen: l.allergen.trim() || null,
            order_index: i,
          }))
          .filter((l) => l.name);
        const photoUrls = st.photos.filter((p): p is string => !!p);
        const hasContent = st.title.trim() || desc || lines.length || photoUrls.length;
        if (!hasContent) continue;

        const { data: stepRow, error: stepErr } = await supabase
          .from('recipe_steps')
          .insert({
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
            sous_etapes: desc ? splitSousEtapes(desc) : null,
            order_index: gi,
          })
          .select('id')
          .single();
        if (stepErr || !stepRow) throw stepErr || new Error('Étape non enregistrée');

        if (photoUrls.length) {
          const { error } = await supabase
            .from('step_photos')
            .insert(photoUrls.map((url, pi) => ({ step_id: stepRow.id, url, order_index: pi })));
          if (error) throw error;
        }

        if (lines.length) {
          const { data: grp, error: grpErr } = await supabase
            .from('ingredient_groups')
            .insert({ recipe_id: recipeId, name: st.title.trim() || `Étape ${gi + 1}`, order_index: gi, scaling_mode: st.scaling })
            .select('id')
            .single();
          if (grpErr || !grp) throw grpErr || new Error('Groupe non enregistré');
          const { error: ingErr } = await supabase.from('ingredients').insert(lines.map((l) => ({ ...l, group_id: grp.id })));
          if (ingErr) throw ingErr;
        }
      }

      if (status !== 'draft') {
        // Publication / enregistrement définitif : on ouvre la fiche recette.
        router.push(`/recette/${recipeId}`);
      } else if (stay) {
        // « Enregistrer en brouillon » : on reste sur l'éditeur. Pour une
        // nouvelle recette, on bascule en mode édition (id dans l'URL) afin que
        // les enregistrements suivants mettent à jour au lieu de dupliquer.
        if (editingId) {
          setBusy(false);
          router.refresh();
        } else {
          router.replace(`/creer?id=${recipeId}`);
        }
      } else {
        // « Enregistrer en brouillon et quitter » : retour au profil.
        router.push('/profil');
      }
    } catch (e) {
      alert('Erreur : ' + ((e as Error).message || "Impossible d'enregistrer la recette."));
      setBusy(false);
    }
  }

  const scalingOptions =
    measure === 'mold'
      ? [
          ['simple', 'Ajustement selon la taille du moule (volume)'],
          ['foncage', 'Recouvre une surface (fonçage, glaçage…)'],
          ['aucun', "Pas d'ajustement pour cette étape"],
        ]
      : [
          ['simple', 'Proportionnel à la quantité à produire'],
          ['aucun', "Pas d'ajustement"],
        ];

  const radio = (checked: boolean) => (
    <div className="relative flex items-center justify-center">
      <div className={`w-5 h-5 border-2 rounded-full transition-colors ${checked ? 'border-primary' : 'border-outline'}`} />
      <div className={`absolute w-2.5 h-2.5 bg-primary rounded-full transition-opacity ${checked ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );

  return (
    <>
      <div className="mb-12 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display-lg text-headline-lg-mobile md:text-display-lg text-primary mb-2">
            {editingId ? 'Modifier la recette' : 'Créer une nouvelle recette'}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">L&apos;excellence de la pâtisserie, rédigée par vos soins.</p>
        </div>
        <Link href="/profil" className="flex items-center gap-2 text-on-surface-variant hover:text-primary font-label-md text-label-md">
          <span className="material-symbols-outlined">close</span> Annuler
        </Link>
      </div>

      <div className="space-y-16">
        {/* Infos de base & média */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          <div className="lg:col-span-12 flex flex-col">
            <label className="font-label-md text-label-md text-outline mb-1">TITRE DE LA RECETTE</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="editorial-input font-headline-lg text-headline-lg text-primary w-full"
              placeholder="Le Saint-Honoré Traditionnel"
              type="text"
            />
          </div>
          <div className="lg:col-span-7 space-y-8">
            <div className="flex items-center justify-between py-4 border-b border-outline-variant">
              <div>
                <span className="font-label-md text-label-md text-primary block">VISIBILITÉ DE LA RECETTE</span>
                <span className="text-sm text-on-surface-variant">Déterminez si votre création est publique ou privée.</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-surface-container-high peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-container" />
                <span className="ml-3 font-label-md text-label-md text-primary">{isPublic ? 'Public' : 'Privé'}</span>
              </label>
            </div>
            <div className="space-y-4">
              <label className="font-label-md text-label-md text-outline uppercase block">Catégories et Tags</label>
              <div className="flex flex-wrap gap-2 items-center">
                {[...selectedTags].map(([id, name]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSelectedTags((prev) => new Map([...prev].filter(([tid]) => tid !== id)))}
                    title="Retirer ce tag"
                    className="px-4 py-1.5 rounded-full bg-primary-container text-white font-label-md text-label-md flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                  >
                    {name}
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                ))}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTagPickerOpen((v) => !v)}
                    className="px-4 py-1.5 rounded-full border border-outline-variant text-on-surface-variant font-label-md text-label-md hover:border-primary hover:text-primary transition-colors"
                  >
                    + Ajouter un tag
                  </button>
                  {tagPickerOpen && (
                    <div className="absolute z-20 mt-2 left-0 bg-white border border-outline-variant rounded-xl shadow-lg py-2 min-w-[220px] max-h-64 overflow-y-auto">
                      {remainingTags.length ? (
                        remainingTags.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setSelectedTags((prev) => new Map(prev).set(t.id, t.name));
                              setTagPickerOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 font-label-md text-label-md text-on-surface hover:bg-surface-container transition-colors"
                          >
                            {t.name}
                          </button>
                        ))
                      ) : (
                        <p className="px-4 py-2 text-sm text-on-surface-variant italic">Aucun autre tag disponible</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="lg:col-span-12">
            <label className="font-label-md text-label-md text-outline uppercase mb-2 block">Description rapide</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-surface-container-low border border-outline-variant p-4 font-body-md text-body-md focus:border-primary outline-none transition-colors"
              placeholder="Décrivez votre recette en quelques mots"
            />
          </div>
          <div className="lg:col-span-12 grid grid-cols-1 gap-6">
            <div>
              <label className="font-label-md text-label-md text-outline uppercase mb-2 block">Source</label>
              <input
                value={source}
                onChange={(e) => setSource(e.target.value)}
                type="text"
                className="w-full bg-surface-container-low border border-outline-variant p-4 font-body-md text-body-md focus:border-primary outline-none transition-colors"
                placeholder="ex : Cyril Lignac"
              />
            </div>
            <div>
              <label className="font-label-md text-label-md text-outline uppercase mb-2 block">URL de la recette d&apos;origine</label>
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                type="url"
                className="w-full bg-surface-container-low border border-outline-variant p-4 font-body-md text-body-md focus:border-primary outline-none transition-colors"
                placeholder="https://…"
              />
            </div>
            <div>
              <label className="font-label-md text-label-md text-outline uppercase mb-2 block">URL de la vidéo</label>
              <input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                type="url"
                className="w-full bg-surface-container-low border border-outline-variant p-4 font-body-md text-body-md focus:border-primary outline-none transition-colors"
                placeholder="https://… (optionnel)"
              />
            </div>
          </div>
          <div className="lg:col-span-12">
            <div className="aspect-[16/9] border border-dashed border-outline-variant overflow-hidden">
              <ImageSlot
                src={hero}
                onChange={setHero}
                shape="rect"
                maxWidth={1200}
                placeholder="Photo principale de la recette (format paysage 16:9) — taille idéale : 1200 × 675 px"
                className="w-full h-full"
              />
            </div>
          </div>
        </section>

        {/* Métadonnées : quantité produite */}
        <section className="bg-surface-container-low p-gutter md:p-12 border border-outline-variant ambient-shadow">
          <div className="flex flex-col border-b border-outline-variant pb-4">
            <label className="font-label-md text-label-md text-outline uppercase mb-4">Taille / Nombre de portions</label>
            <div className="flex flex-wrap gap-6">
              {(
                [
                  ['units', "Par nombre d'unités / poids"],
                  ['mold', 'Par type de moule / cercle'],
                  ['dimensions', 'Description libre'],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="flex items-center gap-3 cursor-pointer group">
                  <input type="radio" checked={measure === v} onChange={() => setMeasure(v)} className="sr-only" />
                  {radio(measure === v)}
                  <span className="font-body-md text-on-surface">{label}</span>
                </label>
              ))}
            </div>

            {measure === 'units' && (
              <div className="mt-4 flex flex-wrap gap-4 items-end">
                <input
                  value={qtyAmount}
                  onChange={(e) => setQtyAmount(e.target.value)}
                  className="editorial-input font-body-md text-on-surface"
                  style={{ width: '6rem' }}
                  placeholder="ex : 6"
                  type="number"
                  min={0}
                />
                <div className="relative flex items-end" style={{ minWidth: '8rem' }}>
                  <select
                    value={qtyUnit}
                    onChange={(e) => setQtyUnit(e.target.value)}
                    className="editorial-input font-body-md text-on-surface cursor-pointer appearance-none pr-6"
                  >
                    <option value="unite">Unité(s)</option>
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="l">l</option>
                  </select>
                  <span className="pointer-events-none absolute right-0 inset-y-0 flex items-center text-on-surface-variant" style={{ fontSize: '16px' }}>▾</span>
                </div>
              </div>
            )}

            {measure === 'mold' && (
              <div className="mt-4 space-y-4">
                <div className="relative flex items-end max-w-md">
                  <select
                    value={moldTypeId}
                    onChange={(e) => {
                      setMoldTypeId(e.target.value);
                      setDims({});
                    }}
                    className="editorial-input font-body-md text-on-surface cursor-pointer appearance-none pr-6"
                  >
                    <option value="" disabled>
                      Choisir le type de moule
                    </option>
                    {moldTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-0 inset-y-0 flex items-center text-on-surface-variant" style={{ fontSize: '16px' }}>▾</span>
                </div>
                <div className="flex flex-wrap gap-6 items-end">
                  <div className="flex flex-col">
                    <label className="font-label-md text-label-md text-outline mb-1">Nombre</label>
                    <input
                      value={moldCount}
                      onChange={(e) => setMoldCount(e.target.value)}
                      className="editorial-input text-on-surface"
                      style={{ width: '5rem' }}
                      placeholder="ex : 6"
                      type="number"
                      min={1}
                    />
                  </div>
                  {(FORME_DIMS[moldForme || ''] || []).map((d) => (
                    <div key={d.key} className="flex flex-col">
                      <label className="font-label-md text-label-md text-outline mb-1">{d.label}</label>
                      <div className="flex items-baseline gap-2">
                        <input
                          value={dims[d.key] || ''}
                          onChange={(e) => setDims((p) => ({ ...p, [d.key]: e.target.value }))}
                          className="editorial-input text-on-surface"
                          style={{ width: '5rem' }}
                          placeholder="0"
                          type="number"
                          min={0}
                          step="any"
                        />
                        <span className="text-sm text-on-surface-variant">cm</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-on-surface-variant italic">Ex. : 6 tartes de 7 cm de diamètre et 2 cm de haut.</p>
              </div>
            )}

            {measure === 'dimensions' && (
              <div className="mt-4">
                <input
                  value={dimsDesc}
                  onChange={(e) => setDimsDesc(e.target.value)}
                  className="editorial-input w-full font-body-md text-on-surface"
                  placeholder="ex : 20cm × 5cm, Ø 22cm…"
                  type="text"
                />
              </div>
            )}
          </div>
        </section>

        {/* Ustensiles */}
        <section className="space-y-8">
          <h2 className="font-headline-lg text-headline-lg text-primary border-b border-primary pb-4">Ustensiles nécessaires</h2>
          <ul className="space-y-4">
            {utensils.map((u, i) => (
              <li key={u.key} className="flex items-start gap-4 group">
                <span className="material-symbols-outlined text-outline-variant select-none mt-2">drag_indicator</span>
                <div className="flex-grow">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
                    <input
                      list="dl-utensils"
                      value={u.name}
                      onChange={(e) => setUtensils((p) => p.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                      className="editorial-input text-on-surface w-full"
                      placeholder="Nom de l'ustensile"
                      autoComplete="off"
                    />
                    <input
                      value={u.comment}
                      onChange={(e) => setUtensils((p) => p.map((x, k) => (k === i ? { ...x, comment: e.target.value } : x)))}
                      className="editorial-input text-on-surface w-full"
                      placeholder="Commentaire (optionnel)"
                    />
                  </div>
                  {isAdmin && u.name.trim() && !knownUtensils.has(u.name.trim().toLowerCase()) && (
                    <button
                      type="button"
                      onClick={() => addUtensilRef(u.name)}
                      disabled={refBusy === `utensils:${u.name.trim().toLowerCase()}`}
                      className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                      title="Ajouter cet ustensile à la base de référence"
                    >
                      <span className="material-symbols-outlined text-[14px]">add_circle</span>
                      Ajouter «&nbsp;{u.name.trim()}&nbsp;» au référentiel
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setUtensils((p) => (p.length > 1 ? p.filter((_, k) => k !== i) : p))}
                  title="Supprimer"
                  className="p-1 text-error hover:opacity-70 transition-opacity shrink-0 mt-1"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setUtensils((u) => [...u, { key: key(), name: '', comment: '' }])}
            className="flex items-center gap-2 text-primary font-label-md text-label-md hover:underline"
          >
            <span className="material-symbols-outlined">add</span> Ajouter un ustensile
          </button>
        </section>

        {/* Étapes */}
        <section className="space-y-12">
          <div className="flex justify-end gap-6">
            <button type="button" onClick={() => collapseAll(true)} className="flex items-center gap-2 text-on-surface-variant font-label-md text-label-md hover:underline">
              <span className="material-symbols-outlined">unfold_less</span> Tout replier
            </button>
            <button type="button" onClick={() => collapseAll(false)} className="flex items-center gap-2 text-on-surface-variant font-label-md text-label-md hover:underline">
              <span className="material-symbols-outlined">unfold_more</span> Tout déplier
            </button>
          </div>

          {steps.map((st, si) => (
            <div
              key={st.key}
              onDragOver={(e) => {
                if (dragStep === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                if (dragStep === null) return;
                e.preventDefault();
                moveStep(dragStep, si);
                setDragStep(null);
              }}
              className={dragStep === si ? 'opacity-50' : undefined}
            >
              <div className="flex items-center gap-4 border-b border-primary pb-4">
                <span
                  className="material-symbols-outlined text-outline-variant select-none cursor-grab p-1 -m-1"
                  title="Glisser pour déplacer l'étape"
                  draggable
                  onDragStart={(e) => {
                    setDragStep(si);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => setDragStep(null)}
                >
                  drag_indicator
                </span>
                <span className="font-display-lg text-headline-lg text-primary">{String(si + 1).padStart(2, '0')}</span>
                <input
                  value={st.title}
                  onChange={(e) => patchStep(si, { title: e.target.value })}
                  className="flex-grow editorial-input font-headline-md text-headline-md text-primary"
                  placeholder="Titre de l'étape (ex: Réalisation de la pâte)"
                  type="text"
                />
                <button type="button" onClick={() => insertStepBefore(si)} title="Insérer une étape avant celle-ci" className="p-1 text-secondary hover:opacity-70 shrink-0">
                  <span className="material-symbols-outlined">add_row_above</span>
                </button>
                <button type="button" onClick={() => toggleCollapse(si)} title="Replier / déplier l'étape" className="p-1 text-on-surface-variant hover:opacity-70 shrink-0">
                  <span className="material-symbols-outlined">{st.collapsed ? 'expand_more' : 'expand_less'}</span>
                </button>
                {steps.length > 1 && (
                  <button type="button" onClick={() => delStep(si)} title="Supprimer l'étape" className="p-1 text-error hover:opacity-70 shrink-0">
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                )}
              </div>

              {!st.collapsed && (
                <div className="space-y-8 mt-8">
                  <div className="border-b border-outline-variant/60 pb-4 flex flex-wrap items-center gap-3">
                    <label className="font-label-md text-label-md text-outline shrink-0">Ajustement des quantités de cette étape</label>
                    <select
                      value={st.scaling}
                      onChange={(e) => patchStep(si, { scaling: e.target.value })}
                      className="editorial-input text-on-surface bg-transparent cursor-pointer shrink-0"
                      style={{ width: 'auto' }}
                    >
                      {scalingOptions.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-8">
                    {(
                      [
                        ['TEMPS DE PRÉP', st.prep, (v: string) => patchStep(si, { prep: v }), 'min'],
                        ["TEMPS D'ATTENTE", st.wait, (v: string) => patchStep(si, { wait: v }), 'min'],
                        ['TEMPS DE CUISSON', st.cook, (v: string) => patchStep(si, { cook: v }), 'min'],
                        ['T°C DE CUISSON', st.temp, (v: string) => patchStep(si, { temp: v }), '°C'],
                      ] as const
                    ).map(([label, val, set, unit]) => (
                      <div key={label} className="flex flex-col items-center text-center w-48">
                        <label className="font-label-md text-label-md text-outline">{label}</label>
                        <div className="flex items-baseline justify-center gap-2">
                          <input
                            value={val}
                            onChange={(e) => set(e.target.value)}
                            className="editorial-input text-on-surface text-center"
                            style={{ width: '40%' }}
                            type="number"
                            min={0}
                          />
                          <span className="text-sm text-on-surface-variant">{unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="font-label-md text-label-md text-outline whitespace-nowrap">À PRÉPARER LE JOUR J −</label>
                    <input
                      value={st.dayOffset}
                      onChange={(e) => patchStep(si, { dayOffset: e.target.value })}
                      className="editorial-input text-on-surface w-20"
                      type="number"
                      min={0}
                      placeholder="0"
                    />
                    <span className="text-sm text-on-surface-variant italic">jour(s) avant dégustation</span>
                  </div>

                  <div className="flex flex-col">
                    {/* En-têtes « INGRÉDIENTS » / « ALLERGÈNES » sur une même
                        ligne, alignés sur leur colonne. Les éléments miroirs
                        (select d'unité + bouton) sont invisibles mais occupent
                        leur largeur pour aligner précisément malgré la largeur
                        auto de l'unité. */}
                    <div className="flex items-center gap-4 mb-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-label-md text-label-md text-outline">INGRÉDIENTS</span>
                      </div>
                      <div className="w-20 shrink-0" />
                      <select aria-hidden className="editorial-input invisible" style={{ width: 'auto' }} tabIndex={-1}>
                        <option value="">— unité —</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.name}>
                            {u.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex-1 min-w-0">
                        <span className="font-label-md text-label-md text-outline italic">ALLERGÈNES</span>
                      </div>
                      <div className="flex-1 min-w-0" />
                      <button aria-hidden type="button" tabIndex={-1} className="p-1 invisible shrink-0">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                    <div className="space-y-4">
                      {st.ings.map((g, ii) => (
                        <div key={g.key}>
                        <div className="flex items-center gap-4">
                          <div className="relative flex-1 min-w-0">
                            <input
                              list="dl-ingredients"
                              value={g.name}
                              onChange={(e) => {
                                const name = e.target.value;
                                // Ingrédient choisi dans le référentiel → allergène pré-rempli
                                // (chaîne vide si le référentiel n'en a pas). Sinon, on ne touche
                                // pas au champ : il reste en saisie libre.
                                const refKey = name.trim().toLowerCase();
                                if (Object.prototype.hasOwnProperty.call(refAllergenMap, refKey)) {
                                  patchIng(si, ii, { name, allergen: refAllergenMap[refKey] });
                                } else {
                                  patchIng(si, ii, { name });
                                }
                              }}
                              className="editorial-input text-on-surface w-full"
                              type="text"
                              placeholder="Ingrédient"
                              autoComplete="off"
                              data-name-step={si}
                            />
                          </div>
                          <input
                            value={g.qty}
                            onChange={(e) => patchIng(si, ii, { qty: e.target.value })}
                            className="w-20 editorial-input text-on-surface"
                            type="text"
                            placeholder="Qté"
                          />
                          <select
                            value={g.unit}
                            onChange={(e) => patchIng(si, ii, { unit: e.target.value })}
                            className="editorial-input text-on-surface cursor-pointer"
                            // Largeur automatique : le select s'ajuste à son option la plus
                            // large (ex. « pincée(s) »). `auto` prime sur le width:100% de
                            // .editorial-input ; toutes les lignes partagent les mêmes
                            // options → colonne alignée.
                            style={{ width: 'auto' }}
                          >
                            <option value="">— unité —</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.name}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                          <div className="flex-1 min-w-0">
                            <input
                              list="dl-allergens"
                              value={g.allergen}
                              onChange={(e) => patchIng(si, ii, { allergen: e.target.value })}
                              className="editorial-input text-on-surface w-full italic"
                              type="text"
                              placeholder="Allergène (optionnel)"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <input
                              value={g.comment}
                              onChange={(e) => patchIng(si, ii, { comment: e.target.value })}
                              onKeyDown={(e) => {
                                // Tab (sans Maj) depuis le dernier champ de la dernière
                                // ligne → ouvrir une nouvelle ligne d'ingrédient et y
                                // placer le curseur (sur le libellé, désormais premier).
                                if (e.key === 'Tab' && !e.shiftKey && ii === st.ings.length - 1) {
                                  e.preventDefault();
                                  addIng(si);
                                  setTimeout(() => {
                                    const names = document.querySelectorAll<HTMLInputElement>(`[data-name-step="${si}"]`);
                                    names[names.length - 1]?.focus();
                                  }, 0);
                                }
                              }}
                              className="editorial-input text-on-surface w-full"
                              type="text"
                              placeholder="Commentaire (optionnel)"
                            />
                          </div>
                          <button
                            type="button"
                            title="Supprimer"
                            onClick={() => delIng(si, ii)}
                            className="p-1 text-error hover:opacity-70 transition-opacity shrink-0"
                          >
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                        {isAdmin && g.name.trim() && !knownIngredients.has(g.name.trim().toLowerCase()) && (
                          <button
                            type="button"
                            onClick={() => addIngredientRef(g.name, g.allergen)}
                            disabled={refBusy === `ingredient_refs:${g.name.trim().toLowerCase()}`}
                            className="mt-1 ml-1 flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                            title={
                              g.allergen.trim()
                                ? `Ajouter cet ingrédient (allergène : ${g.allergen.trim()}) à la base de référence`
                                : 'Ajouter cet ingrédient à la base de référence'
                            }
                          >
                            <span className="material-symbols-outlined text-[14px]">add_circle</span>
                            Ajouter «&nbsp;{g.name.trim()}&nbsp;» au référentiel
                          </button>
                        )}
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => addIng(si)} className="mt-3 flex items-center gap-2 text-secondary font-label-md text-label-md hover:underline w-fit">
                      <span className="material-symbols-outlined">add</span> Ajouter un ingrédient
                    </button>
                  </div>

                  <div className="flex flex-col">
                    <label className="font-label-md text-label-md text-outline mb-2">DESCRIPTION</label>
                    <textarea
                      value={st.description}
                      onChange={(e) => patchStep(si, { description: e.target.value })}
                      className="w-full bg-surface-container-low border border-outline-variant p-4 font-body-md text-body-md focus:border-primary outline-none transition-colors"
                      placeholder="Décrivez les gestes techniques avec précision..."
                      rows={8}
                    />
                    <p className="mt-2 text-sm text-on-surface-variant italic">
                      Astuce : commencez une ligne par «&nbsp;-&nbsp;» pour la découper en sous-étapes cochables.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {st.photos.map((p, pi) => (
                      <div key={pi} className="aspect-square border border-dashed border-outline-variant overflow-hidden">
                        <ImageSlot
                          src={p}
                          onChange={(url) => patchPhoto(si, pi, url)}
                          shape="rect"
                          maxWidth={800}
                          placeholder={`Visuel ${pi + 1} — taille idéale : 800 × 800 px`}
                          className="w-full h-full"
                        />
                      </div>
                    ))}
                  </div>

                  <details open className="group border-b border-outline-variant">
                    <summary className="flex justify-between items-center py-4 cursor-pointer list-none font-label-md text-label-md text-primary uppercase">
                      Conseils &amp; Astuces de l&apos;étape
                      <span className="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
                    </summary>
                    <div className="pb-6">
                      <textarea
                        value={st.tips}
                        onChange={(e) => patchStep(si, { tips: e.target.value })}
                        className="w-full bg-surface-container-low border border-outline-variant p-4 font-body-md text-body-md italic text-on-surface-variant focus:border-primary outline-none transition-colors"
                        placeholder="Une astuce particulière pour cette étape ?"
                        rows={4}
                      />
                    </div>
                  </details>
                </div>
              )}
            </div>
          ))}

          <div className="flex justify-center py-8">
            <button
              type="button"
              onClick={addStep}
              className="flex items-center gap-3 px-8 py-3 border border-primary text-primary hover:bg-primary-container hover:text-white transition-all font-label-md text-label-md uppercase tracking-widest"
            >
              <span className="material-symbols-outlined">add_circle</span> Ajouter une étape
            </button>
          </div>
        </section>

        {/* Conseils de la recette */}
        <section className="space-y-8">
          <h2 className="font-headline-lg text-headline-lg text-primary border-b border-primary pb-4">Conseils et astuces de la recette</h2>
          <textarea
            value={tips}
            onChange={(e) => setTips(e.target.value)}
            className="w-full bg-surface-container-low border border-outline-variant p-6 font-body-md text-body-md focus:border-primary outline-none transition-colors italic"
            placeholder="Partagez vos secrets pour réussir cette recette à coup sûr (conservation, variantes, erreurs à éviter)..."
            rows={4}
          />
        </section>

        {/* Conseils de dégustation et de conservation */}
        <section className="space-y-8">
          <h2 className="font-headline-lg text-headline-lg text-primary border-b border-primary pb-4">Conseils de dégustation et de conservation</h2>
          <textarea
            value={servingAdvice}
            onChange={(e) => setServingAdvice(e.target.value)}
            className="w-full bg-surface-container-low border border-outline-variant p-6 font-body-md text-body-md focus:border-primary outline-none transition-colors italic"
            placeholder="Comment déguster et conserver cette recette (température de dégustation, durée et mode de conservation)..."
            rows={4}
          />
        </section>

        {/* Planning de préparation (aperçu) */}
        <section className="space-y-8">
          <div className="flex justify-between items-end border-b border-primary pb-4">
            <h2 className="font-headline-lg text-headline-lg text-primary">Planning de préparation</h2>
            <span className="text-sm text-on-surface-variant italic">Organisation visuelle des étapes</span>
          </div>
          <div className="bg-surface-container-high p-gutter rounded">
            {allSameDay ? (
              <div className="w-full flex items-center justify-center gap-3 py-6">
                <span className="material-symbols-outlined text-secondary">celebration</span>
                <span className="font-body-lg text-body-lg italic text-primary">Peut être dégusté le jour de la préparation</span>
              </div>
            ) : (
              <div className="relative flex flex-col md:flex-row gap-8">
                <div className="hidden md:block absolute top-10 left-0 w-full h-[2px] bg-outline-variant" />
                {planningDays.map((day, i) => (
                  <div key={i} className="relative flex flex-col items-center text-center gap-4 z-10 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">{i + 1}</div>
                    <span className="font-label-md text-[12px] text-secondary">{day.offset > 0 ? `J − ${day.offset}` : 'JOUR J'}</span>
                    {day.items.map((it, k) => (
                      <p key={k} className={`font-body-md text-body-md font-semibold${it.isLast ? ' text-secondary' : ''}`}>
                        {it.title}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Difficulté & temps globaux */}
        <section className="space-y-8">
          <div className="flex justify-between items-end border-b border-primary pb-4">
            <h2 className="font-headline-lg text-headline-lg text-primary">Difficulté &amp; temps</h2>
            <span className="text-sm text-on-surface-variant italic">Temps pré-remplis depuis les étapes, modifiables</span>
          </div>
          <div className="flex flex-wrap justify-evenly items-start gap-x-10 gap-y-12">
            <div className="flex flex-col items-center text-center border-b border-outline-variant pb-4">
              <label className="font-label-md text-label-md text-outline uppercase">Difficulté</label>
              <div className="flex justify-center gap-2 mt-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLevel(i + 1)}
                    className={`maryse-pill ${i <= level - 1 ? 'bg-primary' : 'bg-outline-variant'}`}
                    aria-label={`Niveau ${i + 1}`}
                  />
                ))}
              </div>
            </div>
            {(
              [
                ['TEMPS DE PRÉP', prep, (v: string) => setPrep(v), 'prep' as const],
                ['ATTENTE', wait, (v: string) => setWait(v), 'wait' as const],
                ['CUISSON', cook, (v: string) => setCook(v), 'cook' as const],
                ['DURÉE TOTALE', total, (v: string) => setTotal(v), 'total' as const],
              ] as const
            ).map(([label, val, set, k]) => (
              <div key={label} className="flex flex-col border-b border-outline-variant pb-4">
                <label className="font-label-md text-label-md text-outline">{label}</label>
                <div className="flex items-baseline gap-2">
                  <input
                    value={val}
                    onChange={(e) => {
                      set(e.target.value);
                      setTimeTouched((t) => ({ ...t, [k]: e.target.value.trim() !== '' }));
                    }}
                    className="editorial-input font-headline-md text-headline-md text-primary"
                    style={{ width: '5.5rem' }}
                    type="number"
                    min={0}
                  />
                  <span className="text-sm text-on-surface-variant">min</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Récapitulatif des ingrédients (aperçu) */}
        <section className="space-y-8">
          <div className="flex justify-between items-end border-b border-primary pb-4">
            <h2 className="font-headline-lg text-headline-lg text-primary">Récapitulatif des ingrédients</h2>
            <span className="text-sm text-on-surface-variant italic">Généré automatiquement depuis les étapes</span>
          </div>
          <div className="max-w-2xl">
            {ingredientsRecap.length === 0 ? (
              <p className="text-on-surface-variant italic text-sm">Les ingrédients saisis dans les étapes apparaîtront ici automatiquement.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'max-content max-content', columnGap: 40 }}>
                {ingredientsRecap.map((m, k) => (
                  <div key={k} className="border-b border-outline-variant/30 py-1.5" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                    <span className="font-body-md text-body-md text-on-surface">{m.name}</span>
                    <span className="font-label-md text-label-md text-primary whitespace-nowrap text-center">{[m.qty, m.unit].filter(Boolean).join(' ')}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="pt-10 border-t-2 border-primary">
          <p className="text-sm text-center text-on-surface-variant">En publiant, vous acceptez les conditions de partage de la communauté Maryse-Club.</p>
        </section>
      </div>

      <div
        className="fixed bottom-16 md:bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-md border-t border-outline-variant p-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-[1200px] mx-auto flex flex-wrap justify-center gap-3 px-margin-mobile md:px-margin-desktop">
          <button
            type="button"
            onClick={() => submit('pending')}
            disabled={busy}
            className="flex-1 min-w-[220px] max-w-md py-3.5 bg-primary-container text-white font-label-md text-label-md uppercase tracking-[0.15em] hover:bg-primary transition-all flex items-center justify-center gap-3 rounded-full shadow-md disabled:opacity-60"
          >
            {isPublic ? 'Publier la recette' : 'Enregistrer'}
            <span className="material-symbols-outlined text-[18px]">send</span>
          </button>
          <button
            type="button"
            onClick={() => submit('draft', true)}
            disabled={busy}
            className="flex-1 min-w-[220px] max-w-md py-3.5 border border-outline-variant bg-surface text-primary font-label-md text-label-md uppercase tracking-[0.15em] hover:bg-surface-container transition-all flex items-center justify-center rounded-full disabled:opacity-60"
          >
            Enregistrer en brouillon
          </button>
          <button
            type="button"
            onClick={() => submit('draft', false)}
            disabled={busy}
            className="flex-1 min-w-[220px] max-w-md py-3.5 border border-outline-variant bg-surface text-primary font-label-md text-label-md uppercase tracking-[0.15em] hover:bg-surface-container transition-all flex items-center justify-center rounded-full disabled:opacity-60"
          >
            Enregistrer en brouillon et quitter
          </button>
        </div>
      </div>

      <datalist id="dl-ingredients">
        {allIngredientRefs.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <datalist id="dl-utensils">
        {allUtensilRefs.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <datalist id="dl-allergens">
        {allAllergens.map((a) => (
          <option key={a.id} value={a.name} />
        ))}
      </datalist>
    </>
  );
}
