'use client';

// Relecture d'un import (porté de relecture.html) : correction du pivot IA
// (infos générales, sous-préparations avec ingrédients/étapes en vis-à-vis,
// temps et récap global live), enregistrement des corrections, puis conversion
// en recette (recipes + steps + groups + ingredients + utensils). Mutations via
// le client Supabase navigateur.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ImportFull } from '@/lib/imports';

const UNITE_LBL: Record<string, string> = { g: 'g', ml: 'ml', piece: 'pièce(s)' };

type IngRow = { key: string; imported: string | null; nom: string; qte: string; unite: string; note: string; allergen: string };
type EtapeRow = { key: string; imported: string | null; texte: string };
type MatRow = { key: string; nom: string };
type SpState = {
  key: string;
  nom: string;
  prep: string;
  attente: string;
  cuisson: string;
  temp: string;
  jour: string;
  ings: IngRow[];
  etapes: EtapeRow[];
  materiel: MatRow[];
  collapsed: boolean;
};

let uid = 0;
const nextKey = () => `k${uid++}`;

// Majuscule initiale d'un libellé (le reste inchangé).
const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Ligature « œuf » (« oeuf » → « œuf »), en respectant la casse.
const ligatureOeuf = (s: string): string => (s || '').replace(/oe(?=ufs?\b)/gi, (m) => (m[0] === 'O' ? 'Œ' : 'œ'));

function rendementTxt(r: any): string {
  if (!r) return '';
  if (r.type === 'moule' && r.moule)
    return r.moule.libelle || [r.moule.forme, r.moule.diametre_cm && r.moule.diametre_cm + ' cm'].filter(Boolean).join(' ');
  if (r.pieces) return `${r.pieces} pièces`;
  if (r.portions) return `${r.portions} parts`;
  return '';
}

function fmtDuree(min: number): string {
  min = Math.round(min);
  const j = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return [j ? j + ' j' : '', h ? h + ' h' : '', m || (!j && !h) ? m + ' min' : ''].filter(Boolean).join(' ');
}

const numOrNull = (v: string): number | null => {
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
};

function initSp(sp: any, refAllergens: Record<string, string>): SpState {
  const lignesCuisson = (sp.etapes || []).reduce((n: number, e: any) => n + (e.duree_min || 0), 0);
  const tMax = (sp.etapes || []).reduce((m: number, e: any) => Math.max(m, e.temperature_c || 0), 0);
  const t = sp.temps || {};
  return {
    key: nextKey(),
    nom: ligatureOeuf(sp.nom || ''),
    prep: t.preparation_min ?? '',
    attente: t.attente_min ?? '',
    cuisson: t.cuisson_min ?? (lignesCuisson || ''),
    temp: sp.temperature_c ?? (tMax || ''),
    jour: String(sp.day_offset ?? 0),
    ings: (sp.ingredients || []).map((g: any) => {
      // Ligature « œuf » puis majuscule initiale sur le nom importé
      // (« jaune d'oeuf » → « Jaune d'œuf »).
      const nom = capitalize(ligatureOeuf(String(g.nom || '')).trim());
      // Note vidée lorsqu'elle ne fait que répéter le nom de l'ingrédient
      // (cas où l'IA recopie le libellé dans la note).
      const noteRaw = ligatureOeuf(String(g.note || '')).trim();
      const note = noteRaw && noteRaw.toLowerCase() === nom.toLowerCase() ? '' : noteRaw;
      const refKey = nom.toLowerCase();
      const imported = g.texte_original || [g.quantite, UNITE_LBL[g.unite] || g.unite, g.nom].filter(Boolean).join(' ') || null;
      return {
        key: nextKey(),
        imported: imported ? ligatureOeuf(imported) : null,
        nom,
        qte: g.quantite ?? '',
        unite: g.unite || '',
        note,
        // Allergène pré-rempli depuis le référentiel si l'ingrédient y figure.
        allergen: Object.prototype.hasOwnProperty.call(refAllergens, refKey) ? refAllergens[refKey] : '',
      };
    }),
    etapes: (sp.etapes || []).map((e: any) => {
      const texte = ligatureOeuf(e.texte || '');
      return { key: nextKey(), imported: texte || null, texte };
    }),
    materiel: (sp.materiel || [])
      .map((m: any) => capitalize(ligatureOeuf(String(m || '')).trim()))
      .filter(Boolean)
      .map((nom: string) => ({ key: nextKey(), nom })),
    collapsed: false,
  };
}

export function RelectureEditor({
  importRow,
  units,
  ingredientRefs,
  refAllergens,
  allergens,
  utensilRefs,
  isAdmin,
}: {
  importRow: ImportFull;
  units: string[];
  ingredientRefs: string[];
  refAllergens: Record<string, string>;
  allergens: { id: number; name: string }[];
  utensilRefs: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const recette = (importRow.recette ?? {}) as any;

  const [titre, setTitre] = useState(ligatureOeuf(recette.titre || ''));
  const [description, setDescription] = useState(ligatureOeuf(recette.description || ''));
  const [notes, setNotes] = useState(ligatureOeuf(recette.notes || ''));
  const [source, setSource] = useState(recette.source?.auteur_origine || '');
  const [sourceUrl, setSourceUrl] = useState(
    recette.source?.url_origine || importRow.source_url || recette.source?.url || '',
  );
  const [videoUrl, setVideoUrl] = useState(recette.source?.video_url || '');
  const [servingAdvice, setServingAdvice] = useState(ligatureOeuf(recette.conseils_degustation || ''));
  const [rendement, setRendement] = useState(recette.rendement?.libelle_corrige || rendementTxt(recette.rendement));
  const [sps, setSps] = useState<SpState[]>(() => (recette.sous_preparations || []).map((sp: any) => initSp(sp, refAllergens)));
  const [saveStatus, setSaveStatus] = useState('');
  const spNomRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [justAddedSpKey, setJustAddedSpKey] = useState<string | null>(null);

  // Focus le nom de la sous-préparation ajoutée (porté de relecture.html).
  useEffect(() => {
    if (!justAddedSpKey) return;
    spNomRefs.current[justAddedSpKey]?.focus();
    setJustAddedSpKey(null);
  }, [justAddedSpKey]);
  const [busy, setBusy] = useState(false);
  // Index de la sous-préparation en cours de glisser-déposer (null si aucun).
  const [dragSp, setDragSp] = useState<number | null>(null);

  const alertes = Array.isArray(importRow.alertes) ? (importRow.alertes as string[]) : [];
  const STATUT_LBL: Record<string, [string, string]> = {
    brouillon: ['Brouillon', 'bg-secondary'],
    verifiee: ['Vérifiée', 'bg-green-700'],
    publiee: ['Publiée', 'bg-primary'],
  };
  const [stLbl, stCls] = STATUT_LBL[importRow.statut] || [importRow.statut, 'bg-secondary'];

  const unitOptions = useMemo(() => Array.from(new Set(units.filter(Boolean))), [units]);

  // Ingrédients / ustensiles / allergènes ajoutés au référentiel pendant la
  // relecture (admin) : complètent les listes serveur pour l'autocomplétion et
  // masquent aussitôt le bouton d'ajout, sans recharger la page.
  const [extraIngredientRefs, setExtraIngredientRefs] = useState<string[]>([]);
  const [extraUtensilRefs, setExtraUtensilRefs] = useState<string[]>([]);
  const [extraAllergens, setExtraAllergens] = useState<{ id: number; name: string }[]>([]);
  const [extraRefAllergens, setExtraRefAllergens] = useState<Record<string, string>>({});
  const [refBusy, setRefBusy] = useState<string | null>(null);

  const allIngredientRefs = useMemo(() => [...ingredientRefs, ...extraIngredientRefs], [ingredientRefs, extraIngredientRefs]);
  const allUtensilRefs = useMemo(() => [...utensilRefs, ...extraUtensilRefs], [utensilRefs, extraUtensilRefs]);
  const allAllergens = useMemo(() => [...allergens, ...extraAllergens], [allergens, extraAllergens]);
  const knownIngredients = useMemo(() => new Set(allIngredientRefs.map((n) => n.trim().toLowerCase())), [allIngredientRefs]);
  const knownUtensils = useMemo(() => new Set(allUtensilRefs.map((n) => n.trim().toLowerCase())), [allUtensilRefs]);
  const allergenIdByName = useMemo(() => new Map(allAllergens.map((a) => [a.name.trim().toLowerCase(), a.id])), [allAllergens]);
  const refAllergenMap = useMemo(() => ({ ...refAllergens, ...extraRefAllergens }), [refAllergens, extraRefAllergens]);

  // Ajout à la volée d'un ustensile dans la table de référence (réservé aux
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

  // ── Mutations d'état ──
  const patchSp = (i: number, patch: Partial<SpState>) =>
    setSps((prev) => prev.map((sp, k) => (k === i ? { ...sp, ...patch } : sp)));
  const patchIng = (si: number, ii: number, patch: Partial<IngRow>) =>
    setSps((prev) =>
      prev.map((sp, k) =>
        k === si ? { ...sp, ings: sp.ings.map((g, j) => (j === ii ? { ...g, ...patch } : g)) } : sp,
      ),
    );
  const patchEtape = (si: number, ei: number, patch: Partial<EtapeRow>) =>
    setSps((prev) =>
      prev.map((sp, k) =>
        k === si ? { ...sp, etapes: sp.etapes.map((e, j) => (j === ei ? { ...e, ...patch } : e)) } : sp,
      ),
    );
  const addIng = (si: number) =>
    setSps((prev) =>
      prev.map((sp, k) =>
        k === si ? { ...sp, ings: [...sp.ings, { key: nextKey(), imported: null, nom: '', qte: '', unite: '', note: '', allergen: '' }] } : sp,
      ),
    );
  const delIng = (si: number, ii: number) =>
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, ings: sp.ings.filter((_, j) => j !== ii) } : sp)));
  // ── Matériel / ustensiles ──
  const patchMat = (si: number, mi: number, nom: string) =>
    setSps((prev) =>
      prev.map((sp, k) => (k === si ? { ...sp, materiel: sp.materiel.map((m, j) => (j === mi ? { ...m, nom } : m)) } : sp)),
    );
  const addMat = (si: number) =>
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, materiel: [...sp.materiel, { key: nextKey(), nom: '' }] } : sp)));
  const delMat = (si: number, mi: number) =>
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, materiel: sp.materiel.filter((_, j) => j !== mi) } : sp)));
  const addEtape = (si: number) =>
    setSps((prev) =>
      prev.map((sp, k) => (k === si ? { ...sp, etapes: [...sp.etapes, { key: nextKey(), imported: null, texte: '' }] } : sp)),
    );
  const delEtape = (si: number, ei: number) =>
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, etapes: sp.etapes.filter((_, j) => j !== ei) } : sp)));
  const emptySp = (): SpState => ({
    key: nextKey(),
    nom: '',
    prep: '',
    attente: '',
    cuisson: '',
    temp: '',
    jour: '0',
    ings: [],
    etapes: [{ key: nextKey(), imported: null, texte: '' }],
    materiel: [],
    collapsed: false,
  });
  const addSp = () => {
    const sp = emptySp();
    setSps((prev) => [...prev, sp]);
    setJustAddedSpKey(sp.key);
  };
  // Insère une étape vierge juste avant l'étape d'index `si` (porté de creer.html).
  const insertSpBefore = (si: number) => {
    const sp = emptySp();
    setSps((prev) => [...prev.slice(0, si), sp, ...prev.slice(si)]);
    setJustAddedSpKey(sp.key);
  };
  const delSp = (si: number) => {
    if (!confirm('Supprimer cette sous-préparation ?')) return;
    setSps((prev) => prev.filter((_, k) => k !== si));
  };
  // Repli / dépli d'une sous-préparation (comme l'éditeur de recette).
  const toggleSpCollapse = (si: number) =>
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, collapsed: !sp.collapsed } : sp)));
  const collapseAllSp = (v: boolean) => setSps((prev) => prev.map((sp) => ({ ...sp, collapsed: v })));
  // Réordonne une sous-préparation de l'index `from` vers `to` (glisser-déposer).
  const moveSp = (from: number, to: number) =>
    setSps((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });

  // ── Récap global (live) ──
  const spTotals = sps.map((sp) => (numOrNull(sp.prep) || 0) + (numOrNull(sp.attente) || 0) + (numOrNull(sp.cuisson) || 0));
  const sumPrep = sps.reduce((n, sp) => n + (numOrNull(sp.prep) || 0), 0);
  const sumAttente = sps.reduce((n, sp) => n + (numOrNull(sp.attente) || 0), 0);
  const sumCuisson = sps.reduce((n, sp) => n + (numOrNull(sp.cuisson) || 0), 0);
  const sumTotal = sumPrep + sumAttente + sumCuisson;

  // ── Lecture du formulaire → pivot corrigé ──
  function readForm(): any {
    const p = JSON.parse(JSON.stringify(recette || {}));
    p.titre = titre.trim();
    p.description = description.trim() || null;
    p.notes = notes.trim() || null;
    p.conseils_degustation = servingAdvice.trim() || null;
    p.source = {
      ...(p.source || {}),
      auteur_origine: source.trim() || null,
      url_origine: sourceUrl.trim() || null,
      video_url: videoUrl.trim() || null,
    };
    p.rendement = p.rendement || {};
    p.rendement.libelle_corrige = rendement.trim() || null;
    p.sous_preparations = sps.map((sp, i) => ({
      ordre: i + 1,
      nom: sp.nom.trim() || `Étape ${i + 1}`,
      temps: {
        preparation_min: numOrNull(sp.prep),
        attente_min: numOrNull(sp.attente),
        cuisson_min: numOrNull(sp.cuisson),
      },
      temperature_c: numOrNull(sp.temp),
      day_offset: numOrNull(sp.jour) || 0,
      ingredients: sp.ings
        .map((g) => ({
          nom: g.nom.trim(),
          quantite: numOrNull(g.qte),
          unite: g.unite || null,
          note: g.note.trim() || null,
          allergene: g.allergen.trim() || null,
        }))
        .filter((g) => g.nom),
      etapes: sp.etapes.map((e, k) => ({ ordre: k + 1, texte: e.texte.trim() })).filter((e) => e.texte),
      materiel: sp.materiel.map((m) => m.nom.trim()).filter(Boolean),
    }));
    const somme = (k: string) => p.sous_preparations.reduce((n: number, sp: any) => n + (sp.temps?.[k] || 0), 0);
    p.temps = {
      preparation_min: somme('preparation_min') || null,
      cuisson_min: somme('cuisson_min') || null,
      repos_min: somme('attente_min') || null,
      congelation_min: null,
    };
    return p;
  }

  async function save(): Promise<any> {
    const p = readForm();
    const supabase = createClient();
    const { error } = await supabase.from('imports').update({ recette: p }).eq('id', importRow.id);
    if (error) throw new Error(error.message);
    return p;
  }

  async function onSave() {
    setBusy(true);
    try {
      await save();
      setSaveStatus('Corrections enregistrées ✓');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (e) {
      alert('Erreur : ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (!confirm('Créer cette recette dans votre carnet (brouillon privé) ?')) return;
    setBusy(true);
    const supabase = createClient();
    try {
      const p = await save();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/connexion');
        return;
      }
      const t = p.temps || {};
      const attente = (t.repos_min || 0) + (t.congelation_min || 0);
      const total = (t.preparation_min || 0) + (t.cuisson_min || 0) + attente;

      // Rendement → champs recettes
      const r = p.rendement || {};
      let measure: { measure_type: string; yield_qty: string | null; yield_unit: string | null; yield_desc: string | null } = {
        measure_type: 'units',
        yield_qty: null,
        yield_unit: 'unite',
        yield_desc: null,
      };
      if (r.type === 'moule' && r.moule) {
        measure = { measure_type: 'mold', yield_qty: null, yield_unit: null, yield_desc: r.libelle_corrige || r.moule.libelle || rendementTxt(r) || null };
      } else if (r.pieces || r.portions) {
        measure = { measure_type: 'units', yield_qty: String(r.pieces || r.portions), yield_unit: 'unite', yield_desc: r.libelle_corrige || null };
      } else if (r.libelle_corrige) {
        measure = { measure_type: 'dimensions', yield_qty: null, yield_unit: null, yield_desc: r.libelle_corrige };
      }

      const { data: recipe, error: recErr } = await supabase
        .from('recipes')
        .insert({
          author_id: user.id,
          title: p.titre || 'Recette importée',
          description: p.description || null,
          is_public: false,
          status: 'draft',
          tips: p.notes || null,
          source: p.source?.auteur_origine || null,
          source_url: p.source?.url_origine || null,
          video_url: p.source?.video_url || null,
          serving_advice: p.conseils_degustation || null,
          prep_time: t.preparation_min ?? null,
          cook_time: t.cuisson_min ?? null,
          wait_time: attente || null,
          total_time: total || null,
          ...measure,
        })
        .select()
        .single();
      if (recErr || !recipe) throw new Error(recErr?.message || 'Création refusée');

      const sousPreps = p.sous_preparations || [];
      for (let i = 0; i < sousPreps.length; i++) {
        const sp = sousPreps[i];
        const spt = sp.temps || {};
        const sousEtapes = (sp.etapes || []).map((e: any) => e.texte).filter(Boolean);
        await supabase.from('recipe_steps').insert({
          recipe_id: recipe.id,
          step_number: i + 1,
          title: sp.nom || `Étape ${i + 1}`,
          description: null,
          prep_time: spt.preparation_min || null,
          cook_time: spt.cuisson_min || null,
          cook_temp: sp.temperature_c || null,
          wait_time: spt.attente_min || null,
          day_offset: sp.day_offset || 0,
          tips: null,
          sous_etapes: sousEtapes.length ? sousEtapes : null,
          order_index: i,
        });
        const lines = (sp.ingredients || [])
          .map((g: any, k: number) => ({
            name: g.nom,
            quantity: g.quantite != null ? String(g.quantite) : null,
            unit: UNITE_LBL[g.unite] || g.unite || null,
            comment: g.note || null,
            allergen: g.allergene || null,
            order_index: k,
          }))
          .filter((l: any) => l.name);
        if (lines.length) {
          const { data: grp, error: grpErr } = await supabase
            .from('ingredient_groups')
            .insert({ recipe_id: recipe.id, name: sp.nom || `Étape ${i + 1}`, order_index: i })
            .select()
            .single();
          if (grpErr || !grp) throw grpErr || new Error('Groupe non enregistré');
          const { error: ingErr } = await supabase.from('ingredients').insert(lines.map((l: any) => ({ ...l, group_id: grp.id })));
          if (ingErr) throw ingErr;
        }
      }

      const mats = Array.from(
        new Set(sousPreps.flatMap((sp: any) => sp.materiel || []).map((m: any) => String(m).trim()).filter(Boolean)),
      ) as string[];
      if (mats.length) {
        const { error } = await supabase.from('recipe_utensils').insert(mats.map((m, i) => ({ recipe_id: recipe.id, name: m, order_index: i })));
        if (error) throw error;
      }

      await supabase.from('imports').update({ statut: 'verifiee', recipe_id: recipe.id }).eq('id', importRow.id);
      router.push(`/recette/${recipe.id}`);
    } catch (e) {
      alert('Erreur à la création : ' + (e as Error).message);
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm('Supprimer définitivement cet import ?')) return;
    const supabase = createClient();
    const { error } = await supabase.from('imports').delete().eq('id', importRow.id);
    if (error) return void alert('Erreur : ' + error.message);
    router.push('/importer');
  }

  const champ = 'border border-outline-variant rounded-lg px-2.5 py-1.5 bg-white text-[15px] w-full focus:outline-none focus:border-primary';

  return (
    <>
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-2">
        <h1 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary">
          Relecture de l&apos;import
        </h1>
        <span className={`font-label-md text-[11px] px-2.5 py-0.5 rounded-full text-white ${stCls}`}>{stLbl}</span>
      </div>
      <p className="text-on-surface-variant mb-2">
        Corrigez ce qui doit l&apos;être à droite (la colonne de gauche montre le contenu d&apos;origine), puis
        créez la recette dans votre carnet : elle y arrivera en <strong>brouillon privé</strong>.
      </p>
      {importRow.source_url ? (
        <p className="text-sm text-on-surface-variant mb-6">
          Source :{' '}
          <a href={importRow.source_url} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
            {importRow.source_url}
          </a>
          {recette.source?.auteur_origine ? ` — par ${recette.source.auteur_origine}` : ''}
        </p>
      ) : importRow.source_type === 'texte' ? (
        <p className="text-sm text-on-surface-variant mb-6">
          Source : texte collé{recette.source?.auteur_origine ? ` — par ${recette.source.auteur_origine}` : ''}
        </p>
      ) : null}

      {alertes.length > 0 && (
        <div className="mb-8 border border-error/40 bg-error-container/30 rounded-xl p-5">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-error mb-2">Points à vérifier</p>
          <div className="flex flex-col gap-1">
            {alertes.map((a, k) => (
              <p key={k} className="text-sm">
                • {a}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Infos générales */}
      <section className="bg-surface-container-low border border-outline-variant rounded-xl p-6 mb-8">
        <h2 className="font-headline-md text-[22px] text-primary mb-4">Informations générales</h2>
        <div className="grid grid-cols-1 gap-4">
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Titre</span>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} className={`${champ} font-headline-md text-[20px]`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Description rapide</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={champ} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Rendement</span>
            <input value={rendement} onChange={(e) => setRendement(e.target.value)} className={champ} placeholder="8 parts, 20 pièces, cercle 20 cm…" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Source</span>
            <input value={source} onChange={(e) => setSource(e.target.value)} className={champ} placeholder="ex : Cyril Lignac" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">URL de la recette d&apos;origine</span>
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} type="url" className={champ} placeholder="https://…" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">URL de la vidéo</span>
            <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} type="url" className={champ} placeholder="https://… (optionnel)" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Notes / conseils</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={champ} placeholder="Conseils de conservation, variantes, astuces…" />
          </label>
        </div>
      </section>

      {/* Sous-préparations */}
      <div className="flex justify-end gap-6 mb-4">
        <button type="button" onClick={() => collapseAllSp(true)} className="flex items-center gap-2 text-on-surface-variant font-label-md text-[12px] hover:underline">
          <span className="material-symbols-outlined text-[18px]">unfold_less</span> Tout replier
        </button>
        <button type="button" onClick={() => collapseAllSp(false)} className="flex items-center gap-2 text-on-surface-variant font-label-md text-[12px] hover:underline">
          <span className="material-symbols-outlined text-[18px]">unfold_more</span> Tout déplier
        </button>
      </div>
      <div className="flex flex-col gap-8">
        {sps.map((sp, si) => (
          <section
            key={sp.key}
            onDragOver={(e) => {
              if (dragSp === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              if (dragSp === null) return;
              e.preventDefault();
              moveSp(dragSp, si);
              setDragSp(null);
            }}
            className={`border border-outline-variant rounded-xl overflow-hidden ${dragSp === si ? 'opacity-50' : ''}`}
          >
            <div className="bg-surface-container-high px-6 py-3 flex items-center gap-3">
              <span
                className="material-symbols-outlined text-outline-variant select-none cursor-grab active:cursor-grabbing p-1 -m-1"
                title="Glisser pour déplacer la sous-préparation"
                draggable
                onDragStart={(e) => {
                  setDragSp(si);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragEnd={() => setDragSp(null)}
              >
                drag_indicator
              </span>
              <span className="font-headline-md text-[18px] text-primary">{si + 1}.</span>
              <input
                ref={(el) => {
                  spNomRefs.current[sp.key] = el;
                }}
                value={sp.nom}
                onChange={(e) => patchSp(si, { nom: e.target.value })}
                className={`${champ} font-headline-md text-[18px] flex-1`}
                placeholder="Nom de l'étape"
              />
              <button
                type="button"
                onClick={() => insertSpBefore(si)}
                title="Insérer une étape avant celle-ci"
                className="text-secondary hover:opacity-70"
              >
                <span className="material-symbols-outlined text-[20px]">add_row_above</span>
              </button>
              <button
                type="button"
                onClick={() => toggleSpCollapse(si)}
                title="Replier / déplier la sous-préparation"
                className="text-on-surface-variant hover:opacity-70"
              >
                <span className="material-symbols-outlined text-[20px]">{sp.collapsed ? 'expand_more' : 'expand_less'}</span>
              </button>
              <button type="button" onClick={() => delSp(si)} title="Supprimer l'étape" className="text-error hover:opacity-70">
                <span className="material-symbols-outlined text-[20px]">delete</span>
              </button>
            </div>

            {!sp.collapsed && (
            <>
            <div className="px-6 py-4 bg-surface-container-low/40 border-b border-outline-variant/50 flex flex-wrap items-end gap-x-6 gap-y-3">
              {(
                [
                  ['prep', 'Réalisation', 'min'],
                  ['attente', 'Attente', 'min'],
                  ['cuisson', 'Cuisson', 'min'],
                  ['temp', 'T°C cuisson', '°C'],
                ] as const
              ).map(([field, label, unit]) => (
                <label key={field} className="flex flex-col items-center text-center gap-1">
                  <span className="font-label-md text-[9px] uppercase tracking-widest text-on-surface-variant">{label}</span>
                  <span className="flex items-baseline gap-1">
                    <input
                      type="number"
                      min={0}
                      value={sp[field]}
                      onChange={(e) => patchSp(si, { [field]: e.target.value } as Partial<SpState>)}
                      className={`${champ} text-center`}
                      style={{ width: '4rem' }}
                    />
                    <span className="text-xs text-on-surface-variant">{unit}</span>
                  </span>
                </label>
              ))}
              <label className="flex flex-col items-center text-center gap-1">
                <span className="font-label-md text-[9px] uppercase tracking-widest text-on-surface-variant">Total</span>
                <span className="font-label-md text-primary" style={{ width: '4rem', textAlign: 'center' }}>
                  {spTotals[si] ? fmtDuree(spTotals[si]) : '—'}
                </span>
              </label>
              <label className="flex flex-col items-center text-center gap-1">
                <span className="font-label-md text-[9px] uppercase tracking-widest text-on-surface-variant">À préparer</span>
                <span className="flex items-baseline gap-1 text-sm">
                  <span className="text-on-surface-variant">J −</span>
                  <input
                    type="number"
                    min={0}
                    value={sp.jour}
                    onChange={(e) => patchSp(si, { jour: e.target.value })}
                    className={`${champ} text-center`}
                    style={{ width: '3.5rem' }}
                  />
                  <span className="text-xs text-on-surface-variant">j</span>
                </span>
              </label>
            </div>

            <div className="p-6">
              {/* Ingrédients */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-x-6 mb-2">
                <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Contenu importé</p>
                <div className="hidden lg:grid gap-2" style={{ gridTemplateColumns: '1fr 5.5rem 7rem 2rem' }}>
                  <span className="font-label-md text-[10px] uppercase text-on-surface-variant">Ingrédient</span>
                  <span className="font-label-md text-[10px] uppercase text-on-surface-variant text-center">Quantité</span>
                  <span className="font-label-md text-[10px] uppercase text-on-surface-variant text-center">Unité</span>
                  <span />
                </div>
              </div>
              <div className="flex flex-col mb-2">
                {sp.ings.length === 0 ? (
                  <p className="text-sm italic text-on-surface-variant py-1">Aucun ingrédient importé (montage ?)</p>
                ) : (
                  sp.ings.map((g, ii) => {
                    const known = knownIngredients.has(g.nom.trim().toLowerCase());
                    return (
                    <div key={g.key} className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-x-6 gap-y-1 items-start py-1.5 border-b border-outline-variant/20">
                      <div className="text-sm text-on-surface-variant lg:pt-1.5">
                        {g.imported ? '• ' + g.imported : <span className="italic opacity-60">ajouté</span>}
                      </div>
                      <div>
                        <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 5.5rem 7rem 2rem' }}>
                          <input
                            list="dl-ingredients"
                            value={g.nom}
                            onChange={(e) => {
                              // Ingrédient choisi dans le référentiel → allergène pré-rempli
                              // (chaîne vide si le référentiel n'en a pas). Sinon, saisie libre.
                              const nom = e.target.value;
                              const refKey = nom.trim().toLowerCase();
                              if (Object.prototype.hasOwnProperty.call(refAllergenMap, refKey)) {
                                patchIng(si, ii, { nom, allergen: refAllergenMap[refKey] });
                              } else {
                                patchIng(si, ii, { nom });
                              }
                            }}
                            className={champ}
                            placeholder="Farine"
                            autoComplete="off"
                          />
                          <input type="number" min={0} step="any" value={g.qte} onChange={(e) => patchIng(si, ii, { qte: e.target.value })} className={`${champ} text-center`} />
                          <select value={g.unite} onChange={(e) => patchIng(si, ii, { unite: e.target.value })} className={champ}>
                            <option value="">—</option>
                            {Array.from(new Set([...unitOptions, g.unite].filter(Boolean))).map((u) => (
                              <option key={u} value={u}>
                                {UNITE_LBL[u] || u}
                              </option>
                            ))}
                          </select>
                          <button type="button" title="Supprimer" onClick={() => delIng(si, ii)} tabIndex={-1} className="text-error hover:opacity-70">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                        {g.note !== '' && (
                          <input value={g.note} onChange={(e) => patchIng(si, ii, { note: e.target.value })} className={`${champ} text-sm mt-1`} placeholder="note (pommade, à froid…)" />
                        )}
                        <div className="grid gap-2 mt-1" style={{ gridTemplateColumns: '1fr 5.5rem 7rem 2rem' }}>
                          <input
                            list="dl-allergens"
                            value={g.allergen}
                            onChange={(e) => patchIng(si, ii, { allergen: e.target.value })}
                            className={`${champ} text-sm italic`}
                            placeholder="Allergène (optionnel)"
                            autoComplete="off"
                          />
                          <span className="col-span-3" />
                        </div>
                        {isAdmin && g.nom.trim() && !known && (
                          <button
                            type="button"
                            onClick={() => addIngredientRef(g.nom, g.allergen)}
                            disabled={refBusy === `ingredient_refs:${g.nom.trim().toLowerCase()}`}
                            className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                            title={
                              g.allergen.trim()
                                ? `Ajouter cet ingrédient (allergène : ${g.allergen.trim()}) à la base de référence`
                                : 'Ajouter cet ingrédient à la base de référence'
                            }
                          >
                            <span className="material-symbols-outlined text-[14px]">add_circle</span>
                            Ajouter «&nbsp;{g.nom.trim()}&nbsp;» au référentiel
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
              <button type="button" onClick={() => addIng(si)} className="flex items-center gap-1 text-secondary font-label-md text-[12px] hover:underline mb-6">
                <span className="material-symbols-outlined text-[16px]">add</span> Ajouter un ingrédient
              </button>

              {/* Ustensiles / matériel */}
              <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Ustensiles</p>
              <div className="flex flex-col mb-2">
                {sp.materiel.length === 0 ? (
                  <p className="text-sm italic text-on-surface-variant py-1">Aucun ustensile importé</p>
                ) : (
                  sp.materiel.map((m, mi) => {
                    const known = knownUtensils.has(m.nom.trim().toLowerCase());
                    return (
                      <div key={m.key} className="py-1.5 border-b border-outline-variant/20">
                        <div className="flex items-center gap-2">
                          <input
                            list="dl-utensils"
                            value={m.nom}
                            onChange={(e) => patchMat(si, mi, e.target.value)}
                            className={champ}
                            placeholder="Nom de l'ustensile"
                            autoComplete="off"
                          />
                          <button type="button" title="Supprimer" onClick={() => delMat(si, mi)} tabIndex={-1} className="text-error hover:opacity-70 shrink-0">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                        {isAdmin && m.nom.trim() && !known && (
                          <button
                            type="button"
                            onClick={() => addUtensilRef(m.nom)}
                            disabled={refBusy === `utensils:${m.nom.trim().toLowerCase()}`}
                            className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                            title="Ajouter cet ustensile à la base de référence"
                          >
                            <span className="material-symbols-outlined text-[14px]">add_circle</span>
                            Ajouter «&nbsp;{m.nom.trim()}&nbsp;» au référentiel
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
              <button type="button" onClick={() => addMat(si)} className="flex items-center gap-1 text-secondary font-label-md text-[12px] hover:underline mb-6">
                <span className="material-symbols-outlined text-[16px]">add</span> Ajouter un ustensile
              </button>

              {/* Étapes */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-x-6 mb-2">
                <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Sous-étapes importées</p>
                <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Version corrigée</p>
              </div>
              <div className="flex flex-col gap-3 mb-2">
                {sp.etapes.map((e, ei) => (
                  <div key={e.key} className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-x-6 gap-y-1 items-start border-b border-outline-variant/20 pb-3">
                    <div className="text-sm text-on-surface-variant lg:pt-2">
                      {e.imported ? e.imported : <span className="italic opacity-60">ajoutée</span>}
                    </div>
                    <div className="flex items-start gap-2">
                      <textarea value={e.texte} onChange={(ev) => patchEtape(si, ei, { texte: ev.target.value })} rows={4} className={`${champ} flex-1`} />
                      <button type="button" title="Supprimer" onClick={() => delEtape(si, ei)} tabIndex={-1} className="text-error hover:opacity-70 mt-2">
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addEtape(si)} className="flex items-center gap-1 text-secondary font-label-md text-[12px] hover:underline">
                <span className="material-symbols-outlined text-[16px]">add</span> Ajouter une sous-étape
              </button>
            </div>
            </>
            )}
          </section>
        ))}
      </div>

      <div className="flex justify-start mt-6">
        <button type="button" onClick={addSp} className="flex items-center gap-2 text-secondary font-label-md text-label-md hover:underline">
          <span className="material-symbols-outlined">add_circle</span> Ajouter une étape
        </button>
      </div>

      {/* Conseils de dégustation et de conservation (fin de recette) */}
      <section className="mt-12 bg-surface-container-low border border-outline-variant rounded-xl p-6">
        <h2 className="font-headline-md text-[22px] text-primary mb-4">Conseils de dégustation et de conservation</h2>
        <textarea
          value={servingAdvice}
          onChange={(e) => setServingAdvice(e.target.value)}
          rows={4}
          className={champ}
          placeholder="Température de dégustation, durée et mode de conservation…"
        />
      </section>

      {/* Récap global */}
      <section className="mt-12 bg-primary text-white rounded-xl p-6 md:p-8">
        <h2 className="font-headline-md text-[22px] mb-5 flex items-center gap-3">
          <span className="material-symbols-outlined">insights</span>Indications globales de la recette
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {(
            [
              ['Réalisation', sumPrep ? fmtDuree(sumPrep) : '—'],
              ['Attente', sumAttente ? fmtDuree(sumAttente) : '—'],
              ['Cuisson', sumCuisson ? fmtDuree(sumCuisson) : '—'],
              ['Temps total', sumTotal ? fmtDuree(sumTotal) : '—'],
              ['Rendement', rendement.trim() || '—'],
              ["Nombre d'étapes", String(sps.length)],
            ] as const
          ).map(([lbl, val]) => (
            <div key={lbl}>
              <p className="font-label-md text-[10px] uppercase tracking-widest opacity-70 mb-1">{lbl}</p>
              <p className="font-headline-md text-[20px]">{val}</p>
            </div>
          ))}
        </div>
      </section>

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

      {/* Barre d'actions fixe */}
      <div
        className="fixed bottom-0 left-0 w-full bg-surface/95 backdrop-blur border-t border-outline-variant z-40 px-margin-mobile md:px-margin-desktop py-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-[1200px] mx-auto flex flex-wrap items-center gap-3">
          {importRow.statut !== 'brouillon' && importRow.recipe_id ? (
            <a
              href={`/recette/${importRow.recipe_id}`}
              className="bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all"
            >
              <span className="material-symbols-outlined text-[18px]">menu_book</span> Voir la recette créée
            </a>
          ) : (
            <button
              type="button"
              onClick={onCreate}
              disabled={busy}
              className="bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all active:scale-95 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">menu_book</span> Créer la recette dans mon carnet
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={busy}
            className="border border-primary text-primary px-6 py-3 rounded-full font-label-md text-label-md hover:bg-primary hover:text-white transition-all active:scale-95 disabled:opacity-60"
          >
            Enregistrer les corrections
          </button>
          <span className="text-sm text-secondary font-label-md">{saveStatus}</span>
          <button type="button" onClick={onDelete} className="ml-auto flex items-center gap-2 text-error font-label-md text-label-md hover:underline">
            <span className="material-symbols-outlined text-[18px]">delete</span> Supprimer cet import
          </button>
        </div>
      </div>
    </>
  );
}
