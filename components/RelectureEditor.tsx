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

type IngRow = { key: string; imported: string | null; nom: string; qte: string; unite: string; note: string };
type EtapeRow = { key: string; imported: string | null; texte: string };
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
  materiel: string[];
};

let uid = 0;
const nextKey = () => `k${uid++}`;

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

function initSp(sp: any): SpState {
  const lignesCuisson = (sp.etapes || []).reduce((n: number, e: any) => n + (e.duree_min || 0), 0);
  const tMax = (sp.etapes || []).reduce((m: number, e: any) => Math.max(m, e.temperature_c || 0), 0);
  const t = sp.temps || {};
  return {
    key: nextKey(),
    nom: sp.nom || '',
    prep: t.preparation_min ?? '',
    attente: t.attente_min ?? '',
    cuisson: t.cuisson_min ?? (lignesCuisson || ''),
    temp: sp.temperature_c ?? (tMax || ''),
    jour: String(sp.day_offset ?? 0),
    ings: (sp.ingredients || []).map((g: any) => ({
      key: nextKey(),
      imported: g.texte_original || [g.quantite, UNITE_LBL[g.unite] || g.unite, g.nom].filter(Boolean).join(' ') || null,
      nom: g.nom || '',
      qte: g.quantite ?? '',
      unite: g.unite || '',
      note: g.note || '',
    })),
    etapes: (sp.etapes || []).map((e: any) => ({ key: nextKey(), imported: e.texte || null, texte: e.texte || '' })),
    materiel: sp.materiel || [],
  };
}

export function RelectureEditor({
  importRow,
  units,
  ingredientRefs,
}: {
  importRow: ImportFull;
  units: string[];
  ingredientRefs: string[];
}) {
  const router = useRouter();
  const recette = (importRow.recette ?? {}) as any;

  const [titre, setTitre] = useState(recette.titre || '');
  const [description, setDescription] = useState(recette.description || '');
  const [notes, setNotes] = useState(recette.notes || '');
  const [rendement, setRendement] = useState(recette.rendement?.libelle_corrige || rendementTxt(recette.rendement));
  const [sps, setSps] = useState<SpState[]>(() => (recette.sous_preparations || []).map(initSp));
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

  const alertes = Array.isArray(importRow.alertes) ? (importRow.alertes as string[]) : [];
  const STATUT_LBL: Record<string, [string, string]> = {
    brouillon: ['Brouillon', 'bg-secondary'],
    verifiee: ['Vérifiée', 'bg-green-700'],
    publiee: ['Publiée', 'bg-primary'],
  };
  const [stLbl, stCls] = STATUT_LBL[importRow.statut] || [importRow.statut, 'bg-secondary'];

  const unitOptions = useMemo(() => Array.from(new Set(units.filter(Boolean))), [units]);

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
        k === si ? { ...sp, ings: [...sp.ings, { key: nextKey(), imported: null, nom: '', qte: '', unite: '', note: '' }] } : sp,
      ),
    );
  const delIng = (si: number, ii: number) =>
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, ings: sp.ings.filter((_, j) => j !== ii) } : sp)));
  const addEtape = (si: number) =>
    setSps((prev) =>
      prev.map((sp, k) => (k === si ? { ...sp, etapes: [...sp.etapes, { key: nextKey(), imported: null, texte: '' }] } : sp)),
    );
  const delEtape = (si: number, ei: number) =>
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, etapes: sp.etapes.filter((_, j) => j !== ei) } : sp)));
  const addSp = () => {
    const key = nextKey();
    setSps((prev) => [
      ...prev,
      { key, nom: '', prep: '', attente: '', cuisson: '', temp: '', jour: '0', ings: [], etapes: [{ key: nextKey(), imported: null, texte: '' }], materiel: [] },
    ]);
    setJustAddedSpKey(key);
  };
  const delSp = (si: number) => {
    if (!confirm('Supprimer cette sous-préparation ?')) return;
    setSps((prev) => prev.filter((_, k) => k !== si));
  };

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
        .map((g) => ({ nom: g.nom.trim(), quantite: numOrNull(g.qte), unite: g.unite || null, note: g.note.trim() || null }))
        .filter((g) => g.nom),
      etapes: sp.etapes.map((e, k) => ({ ordre: k + 1, texte: e.texte.trim() })).filter((e) => e.texte),
      materiel: sp.materiel,
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
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Notes / conseils</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} className={champ} placeholder="Conseils de conservation, variantes, astuces…" />
          </label>
        </div>
      </section>

      {/* Sous-préparations */}
      <div className="flex flex-col gap-8">
        {sps.map((sp, si) => (
          <section key={sp.key} className="border border-outline-variant rounded-xl overflow-hidden">
            <div className="bg-surface-container-high px-6 py-3 flex items-center gap-3">
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
              <button type="button" onClick={() => delSp(si)} title="Supprimer l'étape" className="text-error hover:opacity-70">
                <span className="material-symbols-outlined text-[20px]">delete</span>
              </button>
            </div>

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
                  sp.ings.map((g, ii) => (
                    <div key={g.key} className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-x-6 gap-y-1 items-start py-1.5 border-b border-outline-variant/20">
                      <div className="text-sm text-on-surface-variant lg:pt-1.5">
                        {g.imported ? '• ' + g.imported : <span className="italic opacity-60">ajouté</span>}
                      </div>
                      <div>
                        <div className="grid gap-2 items-center" style={{ gridTemplateColumns: '1fr 5.5rem 7rem 2rem' }}>
                          <input list="dl-ingredients" value={g.nom} onChange={(e) => patchIng(si, ii, { nom: e.target.value })} className={champ} placeholder="farine" autoComplete="off" />
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
                      </div>
                    </div>
                  ))
                )}
              </div>
              <button type="button" onClick={() => addIng(si)} className="flex items-center gap-1 text-secondary font-label-md text-[12px] hover:underline mb-6">
                <span className="material-symbols-outlined text-[16px]">add</span> Ajouter un ingrédient
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
                <span className="material-symbols-outlined text-[16px]">add</span> Ajouter une étape
              </button>
            </div>
          </section>
        ))}
      </div>

      <div className="flex justify-start mt-6">
        <button type="button" onClick={addSp} className="flex items-center gap-2 text-secondary font-label-md text-label-md hover:underline">
          <span className="material-symbols-outlined">add_circle</span> Ajouter une sous-préparation
        </button>
      </div>

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
        {ingredientRefs.map((n) => (
          <option key={n} value={n} />
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
