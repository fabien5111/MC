'use client';

// Relecture d'un import (porté de relecture.html) : correction du pivot IA
// (infos générales, étapes avec ingrédients/étapes en vis-à-vis,
// temps et récap global live), enregistrement des corrections, puis conversion
// en recette (recipes + steps + groups + ingredients + utensils). Mutations via
// le client Supabase navigateur.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { ImportFull } from '@/lib/imports';
import type { Difficulty, Tag } from '@/lib/taxonomy';
import type { MoldType } from '@/lib/admin';
import { MaryseIcon } from '@/components/MaryseIcon';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { ImageSlot, PHOTO_DND_TYPE } from '@/components/ImageSlot';
import { PhotoBank, type PhotoBanque } from '@/components/relecture/PhotoBank';
import { MOLD_FORME_DIMS, DIM_LABELS, UNITS_LBL } from '@/lib/recipe-view';
import { RecipeToc, RELECTURE_SECTIONS, stepAnchorId } from '@/components/recipe/RecipeToc';
import { ingredientConversionText, resolveIngredientRefId, type ConversionRef, type IngredientRefOption, type UnitRef } from '@/lib/ingredient-conversions';

type MeasureType = 'units' | 'mold' | 'dimensions';

// Jusqu'à 3 allergènes par ingrédient, choisis uniquement dans la table de
// référence (plus de saisie libre). Persistés en une chaîne « a, b, c ».
const MAX_ALLERGENS = 3;
const parseAllergens = (raw: string | null | undefined): string[] =>
  (raw || '')
    .split(/[,;/]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_ALLERGENS);

type IngRow = { key: string; imported: string | null; nom: string; qte: string; unite: string; note: string; allergen: string[] };
type EtapeRow = { key: string; imported: string | null; texte: string };
type MatRow = { key: string; nom: string; commentaire: string };
type SpState = {
  key: string;
  nom: string;
  prep: string;
  attente: string;
  cuisson: string;
  temp: string;
  jour: string;
  // Comment les quantités de l'étape suivent un changement de rendement.
  // Même mécanisme que l'éditeur de recette : persisté dans
  // `ingredient_groups.scaling_mode` à la création.
  scaling: string;
  ings: IngRow[];
  etapes: EtapeRow[];
  tips: string;
  videoUrl: string;
  photos: (string | null)[];
  collapsed: boolean;
  ingsCollapsed: boolean;
};

let uid = 0;
const nextKey = () => `k${uid++}`;

// Majuscule initiale d'un libellé (le reste inchangé).
const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Slug généré depuis un libellé (même règle que CreerForm / back-office des listes).
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

// Ligature « œuf » (« oeuf » → « œuf »), en respectant la casse.
const ligatureOeuf = (s: string): string => (s || '').replace(/oe(?=ufs?\b)/gi, (m) => (m[0] === 'O' ? 'Œ' : 'œ'));

function rendementTxt(r: any): string {
  if (!r) return '';
  if (r.type === 'moule' && r.moule)
    return r.moule.libelle || [r.moule.forme, r.moule.diametre_cm && r.moule.diametre_cm + ' cm'].filter(Boolean).join(' ');
  if (r.pieces) return `${r.pieces} pièces`;
  if (r.portions) return `${r.portions} parts`;
  // Rendement extrait en texte libre (ex. « 20 cm - 8 personnes ») : le schéma
  // d'import ne le structure plus, on affiche la formulation d'origine.
  if (r.libelle) return String(r.libelle);
  return '';
}

// Description compacte d'un moule à partir de sa forme et de ses dimensions
// (mêmes clés que `MOLD_FORME_DIMS`), ex. « Ø 20 × 4.5 cm ».
function composeMoldDesc(forme: string | null | undefined, dims: Record<string, number>): string | null {
  const keys = MOLD_FORME_DIMS[forme || ''] || [];
  const parts = keys.filter((k) => dims[k] != null).map((k) => (k === 'diametre' ? 'Ø ' : '') + dims[k]);
  return parts.length ? parts.join(' × ') + ' cm' : null;
}

// Normalise une liste d'ustensiles (ancien format « chaîne simple » ou
// nouveau format { nom, commentaire } ; filtre les entrées sans nom).
function normMateriel(list: any): { nom: string; commentaire: string }[] {
  return (Array.isArray(list) ? list : [])
    .map((m: any) => ({
      nom: capitalize(ligatureOeuf(String(typeof m === 'string' ? m : m?.nom || '')).trim()),
      commentaire: ligatureOeuf(String(typeof m === 'string' ? '' : m?.commentaire || '')).trim(),
    }))
    .filter((m: { nom: string }) => m.nom);
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

// Fusion des ingrédients identiques (nom + unité) de toutes les étapes, pour
// le récapitulatif global — même logique que `mergeRecapLines` de CreerForm.
function mergeIngredientsRecap(sps: SpState[]): { name: string; qty: string; unit: string }[] {
  const merged: { key: string; name: string; qty: string; unit: string }[] = [];
  sps.forEach((sp) =>
    sp.ings.forEach((i) => {
      const name = i.nom.trim();
      if (!name) return;
      const mkey = name.toLowerCase() + '|' + i.unite.toLowerCase();
      const ex = merged.find((m) => m.key === mkey);
      if (!ex) {
        merged.push({ key: mkey, name, qty: String(i.qte ?? '').trim(), unit: i.unite });
        return;
      }
      const a = parseFloat(String(ex.qty).replace(',', '.'));
      const b = parseFloat(String(i.qte).replace(',', '.'));
      if (!isNaN(a) && !isNaN(b)) ex.qty = String(+(a + b).toFixed(2));
      else ex.qty = [ex.qty, i.qte].filter(Boolean).join(' + ');
    }),
  );
  merged.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return merged.map(({ name, qty, unit }) => ({ name, qty, unit }));
}

// Ligne `difficulties` dont le niveau est le plus proche du niveau donné.
function closestDifficulty(difficulties: Difficulty[], level: number): Difficulty | null {
  return difficulties.reduce<Difficulty | null>(
    (best, d) => (!best || Math.abs(d.level - level) < Math.abs(best.level - level) ? d : best),
    null,
  );
}

function initSp(sp: any, refAllergens: Record<string, string>): SpState {
  const lignesCuisson = (sp.etapes || []).reduce((n: number, e: any) => n + (e.duree_min || 0), 0);
  const tMax = (sp.etapes || []).reduce((m: number, e: any) => Math.max(m, e.temperature_c || 0), 0);
  const t = sp.temps || {};
  const photos = Array.isArray(sp.photos) ? sp.photos : [];
  return {
    key: nextKey(),
    nom: ligatureOeuf(sp.nom || ''),
    prep: t.preparation_min ?? '',
    attente: t.attente_min ?? '',
    cuisson: t.cuisson_min ?? (lignesCuisson || ''),
    temp: sp.temperature_c ?? (tMax || ''),
    jour: String(sp.day_offset ?? 0),
    // Absent d'un import (l'IA ne le déduit pas) : l'ajustement proportionnel
    // est le comportement attendu par défaut, comme à la création.
    scaling: typeof sp.scaling_mode === 'string' ? sp.scaling_mode : 'simple',
    ings: (sp.ingredients || []).map((g: any) => {
      // Ligature « œuf » puis majuscule initiale sur le nom importé
      // (« jaune d'oeuf » → « Jaune d'œuf »).
      const nom = capitalize(ligatureOeuf(String(g.nom || '')).trim());
      // Note vidée lorsqu'elle ne fait que répéter le nom de l'ingrédient
      // (cas où l'IA recopie le libellé dans la note).
      const noteRaw = ligatureOeuf(String(g.note || '')).trim();
      const note = noteRaw && noteRaw.toLowerCase() === nom.toLowerCase() ? '' : noteRaw;
      const refKey = nom.toLowerCase();
      const imported = g.texte_original || [g.quantite, g.unite, g.nom].filter(Boolean).join(' ') || null;
      return {
        key: nextKey(),
        imported: imported ? ligatureOeuf(imported) : null,
        nom,
        qte: g.quantite ?? '',
        unite: g.unite || '',
        note,
        // Allergène pré-rempli depuis le référentiel si l'ingrédient y figure.
        allergen: Object.prototype.hasOwnProperty.call(refAllergens, refKey) ? parseAllergens(refAllergens[refKey]) : [],
      };
    }),
    etapes: (sp.etapes || []).map((e: any) => {
      const texte = ligatureOeuf(e.texte || '');
      return { key: nextKey(), imported: texte || null, texte };
    }),
    tips: ligatureOeuf(sp.conseils || ''),
    videoUrl: sp.video || '',
    photos: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => photos[i] || null),
    collapsed: false,
    ingsCollapsed: false,
  };
}

export function RelectureEditor({
  importRow,
  units,
  unitRefs,
  ingredientRefs,
  refAllergens,
  allergens,
  utensilRefs,
  difficulties,
  moldTypes,
  tags,
  isAdmin,
  conversions,
  ingredientRefIds,
}: {
  importRow: ImportFull;
  units: string[];
  unitRefs: UnitRef[];
  ingredientRefs: string[];
  refAllergens: Record<string, string>;
  allergens: { id: number; name: string }[];
  utensilRefs: string[];
  difficulties: Difficulty[];
  moldTypes: MoldType[];
  tags: Tag[];
  isAdmin: boolean;
  conversions: ConversionRef[];
  ingredientRefIds: IngredientRefOption[];
}) {
  const router = useRouter();
  const recette = (importRow.recette ?? {}) as any;

  const [hero, setHero] = useState<string | null>(recette.photo_principale ?? null);
  // Photos extraites du PDF qui n'ont pas trouvé d'étape (la page indiquée par
  // l'IA ne correspondait à aucune) : elles restent disponibles au glisser-
  // déposer. Une photo retirée d'un emplacement y revient, ce qui permet de la
  // déplacer d'une étape à l'autre.
  const [banque, setBanque] = useState<PhotoBanque[]>(() =>
    Array.isArray(recette.photos_pdf) ? (recette.photos_pdf as PhotoBanque[]).filter((p) => p?.url) : [],
  );
  const estPdf = importRow.source_type === 'pdf';
  const rendreALaBanque = useCallback((url: string | null) => {
    if (!url || !estPdf) return;
    setBanque((prev) => (prev.some((p) => p.url === url) ? prev : [...prev, { url, page: null }]));
  }, [estPdf]);
  const retirerDeLaBanque = useCallback((url: string | null) => {
    if (!url) return;
    setBanque((prev) => prev.filter((p) => p.url !== url));
  }, []);
  const [titre, setTitre] = useState(ligatureOeuf(recette.titre || ''));
  const [description, setDescription] = useState(ligatureOeuf(recette.description || ''));
  const [notes, setNotes] = useState(ligatureOeuf(recette.notes || ''));
  const [source, setSource] = useState(recette.source?.auteur_origine || '');
  const [sourceUrl, setSourceUrl] = useState(
    recette.source?.url_origine || importRow.source_url || recette.source?.url || '',
  );
  const [videoUrl, setVideoUrl] = useState(recette.source?.video_url || '');
  const [servingAdvice, setServingAdvice] = useState(ligatureOeuf(recette.conseils_degustation || ''));
  const [level, setLevel] = useState<number>(Number(recette.difficulte) || 0);
  // Libellé de la difficulté (niveau le plus proche dans le référentiel), affiché à côté des pictos.
  const levelLabel = useMemo(() => (level ? closestDifficulty(difficulties, level)?.name : null), [level, difficulties]);
  // Taille / quantité produite : 3 modes comme l'éditeur de recette (unités,
  // moule, description libre). `recette.rendement` peut porter soit une
  // correction déjà enregistrée (clé `mode`), soit le pivot brut de l'IA
  // (`type`/`moule`/`pieces`/`portions`) — le type de moule n'est jamais
  // déduit automatiquement (vocabulaire IA non aligné avec le référentiel
  // `mold_types`), mais les dimensions importées pré-remplissent les champs
  // dès qu'un type est choisi (mêmes clés courtes : diametre/hauteur/…).
  const r0 = (recette.rendement || {}) as any;
  const [measure, setMeasure] = useState<MeasureType>(
    r0.mode === 'units' || r0.mode === 'mold' || r0.mode === 'dimensions'
      ? r0.mode
      : r0.type === 'moule' && r0.moule
        ? 'mold'
        : r0.pieces || r0.portions
          ? 'units'
          : 'dimensions',
  );
  const [qtyAmount, setQtyAmount] = useState(String(r0.pieces_corrige ?? r0.pieces ?? r0.portions ?? ''));
  const [qtyUnit, setQtyUnit] = useState(r0.qty_unit_corrige || 'unite');
  const [moldTypeId, setMoldTypeId] = useState(r0.moule_corrige?.type_id ? String(r0.moule_corrige.type_id) : '');
  const [moldCount, setMoldCount] = useState(String(r0.moule_corrige?.count ?? r0.pieces ?? ''));
  const [dims, setDims] = useState<Record<string, string>>(() => {
    const d = r0.moule_corrige?.dims;
    if (d && typeof d === 'object') return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v)]));
    const m = r0.moule || {};
    const guess: Record<string, string> = {};
    if (m.diametre_cm != null) guess.diametre = String(m.diametre_cm);
    if (m.hauteur_cm != null) guess.hauteur = String(m.hauteur_cm);
    if (m.longueur_cm != null) guess.longueur = String(m.longueur_cm);
    if (m.largeur_cm != null) guess.largeur = String(m.largeur_cm);
    return guess;
  });
  const [dimsDesc, setDimsDesc] = useState(r0.libelle_corrige || rendementTxt(r0));
  const [yieldNotes, setYieldNotes] = useState(ligatureOeuf(r0.notes_quantites || rendementTxt(r0)));
  // Rendement tel qu'extrait par l'IA (avant correction), affiché en référence à côté du sélecteur.
  const importedRendement = rendementTxt(r0);
  const moldForme = useMemo(() => moldTypes.find((t) => String(t.id) === moldTypeId)?.forme || null, [moldTypes, moldTypeId]);
  // Résumé affiché dans le récap global (live).
  const rendementLabel = useMemo(() => {
    if (measure === 'units') return qtyAmount.trim() ? `${qtyAmount.trim()} ${UNITS_LBL[qtyUnit] || qtyUnit}` : '';
    if (measure === 'dimensions') return dimsDesc.trim();
    const parsed: Record<string, number> = {};
    Object.entries(dims).forEach(([k, v]) => {
      const n = parseFloat(String(v).replace(',', '.'));
      if (!isNaN(n)) parsed[k] = n;
    });
    const dimsTxt = composeMoldDesc(moldForme, parsed);
    const mtName = moldTypes.find((t) => String(t.id) === moldTypeId)?.name || '';
    const count = parseInt(moldCount, 10);
    return [count > 1 ? `${count} ×` : null, mtName, dimsTxt].filter(Boolean).join(' ');
  }, [measure, qtyAmount, qtyUnit, dims, moldForme, moldTypeId, moldCount, dimsDesc, moldTypes]);
  const [sps, setSps] = useState<SpState[]>(() => (recette.sous_preparations || []).map((sp: any) => initSp(sp, refAllergens)));
  // Ustensiles de la recette : liste unique (regroupée, dédupliquée), au
  // niveau de la recette et non plus répétée par étape — comme
  // dans l'éditeur de recette. `recette.materiel` porte une correction déjà
  // enregistrée si elle existe ; sinon on agrège l'ancien format réparti par
  // étape (import brut ou anciens imports déjà en base).
  const [utensils, setUtensils] = useState<MatRow[]>(() => {
    if (Array.isArray(recette.materiel)) {
      return normMateriel(recette.materiel).map((m) => ({ key: nextKey(), ...m }));
    }
    const seen = new Map<string, { nom: string; commentaire: string }>();
    (recette.sous_preparations || []).forEach((sp: any) => {
      normMateriel(sp.materiel).forEach((m) => {
        const k = m.nom.toLowerCase();
        const prev = seen.get(k);
        if (!prev) seen.set(k, m);
        else if (!prev.commentaire && m.commentaire) seen.set(k, { ...prev, commentaire: m.commentaire });
      });
    });
    return Array.from(seen.values()).map((m) => ({ key: nextKey(), ...m }));
  });
  const [saveStatus, setSaveStatus] = useState('');
  const spNomRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [justAddedSpKey, setJustAddedSpKey] = useState<string | null>(null);

  // Focus le nom de l'étape ajoutée (porté de relecture.html).
  useEffect(() => {
    if (!justAddedSpKey) return;
    spNomRefs.current[justAddedSpKey]?.focus();
    setJustAddedSpKey(null);
  }, [justAddedSpKey]);
  const [busy, setBusy] = useState(false);
  // Verrou synchrone doublant `busy` : un état React n'est effectif qu'au
  // rendu suivant et ne protège pas de deux déclenchements dans le même tick.
  const busyRef = useRef(false);
  // Distinct de `busy` (dédié à l'enregistrement/la création, avec leurs
  // propres retours) : cliquer sur Quitter ne passe par aucune écriture.
  const [leaving, setLeaving] = useState(false);
  // Suivi grossier de la saisie pour la confirmation de sortie, cf.
  // CreerForm. Écouteur délégué sur le document plutôt qu'`onChange` sur un
  // conteneur unique : contrairement à CreerForm, l'écran n'a pas de wrapper
  // englobant toutes les sections éditables.
  const dirtyRef = useRef(false);
  useEffect(() => {
    const markDirty = () => {
      dirtyRef.current = true;
    };
    document.addEventListener('change', markDirty);
    return () => document.removeEventListener('change', markDirty);
  }, []);
  // Recette créée depuis cette relecture. La création écrit la recette puis
  // ses étapes, photos et ingrédients : si l'un de ces écrits échoue, la
  // recette existe déjà. Sans cette mémoire, une nouvelle tentative en
  // créerait une seconde, identique.
  const createdRecipeIdRef = useRef<string | null>(importRow.recipe_id ?? null);
  // Index de l'étape en cours de glisser-déposer (null si aucun).
  const [dragSp, setDragSp] = useState<number | null>(null);
  // Sous-étape en cours de glisser-déposer (étape + index), null si aucune.
  const [dragEtape, setDragEtape] = useState<{ si: number; ei: number } | null>(null);

  const alertes = Array.isArray(importRow.alertes) ? (importRow.alertes as string[]) : [];
  const STATUT_LBL: Record<string, [string, string]> = {
    brouillon: ['Brouillon', 'bg-secondary'],
    verifiee: ['Vérifiée', 'bg-green-700'],
    publiee: ['Publiée', 'bg-primary'],
  };
  const [stLbl, stCls] = STATUT_LBL[importRow.statut] || [importRow.statut, 'bg-secondary'];

  const unitOptions = useMemo(() => Array.from(new Set(units.filter(Boolean))), [units]);

  // Tags : les libellés libres extraits par l'IA (recette.tags) sont
  // rapprochés du référentiel par nom (insensible à la casse) pour
  // présélectionner les tags correspondants ; les autres sont ignorés (pas
  // d'ID à leur associer). Sélection ultérieure et création de nouveaux tags
  // (admin) comme dans l'éditeur de recette.
  const importedTagNames: string[] = Array.isArray((recette as any).tags) ? (recette as any).tags : [];
  const [selectedTags, setSelectedTags] = useState<Map<number, string>>(() => {
    const map = new Map<number, string>();
    importedTagNames.forEach((name) => {
      const match = tags.find((t) => t.name.trim().toLowerCase() === String(name).trim().toLowerCase());
      if (match) map.set(match.id, match.name);
    });
    return map;
  });
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [extraTags, setExtraTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState('');

  // Ingrédients / ustensiles / allergènes ajoutés au référentiel pendant la
  // relecture (admin) : complètent les listes serveur pour l'autocomplétion et
  // masquent aussitôt le bouton d'ajout, sans recharger la page.
  const [extraIngredientRefs, setExtraIngredientRefs] = useState<string[]>([]);
  const [extraUtensilRefs, setExtraUtensilRefs] = useState<string[]>([]);
  const [extraAllergens] = useState<{ id: number; name: string }[]>([]);
  const [extraRefAllergens, setExtraRefAllergens] = useState<Record<string, string>>({});
  const [refBusy, setRefBusy] = useState<string | null>(null);
  // Ingrédient dont la popup de choix d'allergènes est ouverte (si/ii), ou null.
  const [allergenPopup, setAllergenPopup] = useState<{ si: number; ii: number } | null>(null);

  // Listes serveur + libellés ajoutés à la volée. Dédoublonnées : après le
  // refresh déclenché par un ajout au référentiel, la liste serveur contient
  // déjà le libellé que l'état local conserve (sinon : options en double).
  const allIngredientRefs = useMemo(() => [...new Set([...ingredientRefs, ...extraIngredientRefs])], [ingredientRefs, extraIngredientRefs]);
  const allUtensilRefs = useMemo(() => [...new Set([...utensilRefs, ...extraUtensilRefs])], [utensilRefs, extraUtensilRefs]);
  const allAllergens = useMemo(() => [...allergens, ...extraAllergens], [allergens, extraAllergens]);
  const knownIngredients = useMemo(() => new Set(allIngredientRefs.map((n) => n.trim().toLowerCase())), [allIngredientRefs]);
  const knownUtensils = useMemo(() => new Set(allUtensilRefs.map((n) => n.trim().toLowerCase())), [allUtensilRefs]);
  const refAllergenMap = useMemo(() => ({ ...refAllergens, ...extraRefAllergens }), [refAllergens, extraRefAllergens]);

  // Ajout à la volée d'un ustensile dans la table de référence (réservé aux
  // administrateurs — bouton affiché uniquement si `isAdmin`). L'insertion passe
  // par le client navigateur : la RLS n'autorise l'écriture qu'au rôle admin.
  //
  // L'état local (`extra*`) rend le libellé disponible immédiatement ; le
  // refresh, lui, resynchronise les listes de référence rendues côté serveur —
  // sans quoi le libellé créé disparaîtrait en revenant sur cet écran, et
  // n'apparaîtrait pas dans le back-office des listes.
  const refreshRefs = () => router.refresh();

  async function addUtensilRef(name: string) {
    const clean = name.trim();
    if (!clean) return;
    setRefBusy(`utensils:${clean.toLowerCase()}`);
    const { error } = await createClient().from('utensils').insert({ name: clean });
    setRefBusy(null);
    if (error) return void alert('Erreur : ' + error.message);
    setExtraUtensilRefs((p) => [...p, clean]);
    refreshRefs();
  }

  // Ajout d'un ingrédient au référentiel avec ses allergènes (choisis dans la
  // table de référence, donc existants) : stockés en une chaîne « a, b, c »
  // dans la colonne texte `ingredient_refs.allergen`, jusqu'à 3.
  async function addIngredientRef(name: string, allergenNames: string[]) {
    const clean = name.trim();
    if (!clean) return;
    setRefBusy(`ingredient_refs:${clean.toLowerCase()}`);
    const supabase = createClient();
    const list = allergenNames.map((a) => a.trim()).filter(Boolean).slice(0, MAX_ALLERGENS);
    const allergenCsv = list.length ? list.join(', ') : null;
    const { error } = await supabase.from('ingredient_refs').insert({ name: clean, allergen: allergenCsv });
    setRefBusy(null);
    if (error) return void alert('Erreur : ' + error.message);
    setExtraIngredientRefs((p) => [...p, clean]);
    setExtraRefAllergens((p) => ({ ...p, [clean.toLowerCase()]: allergenCsv || '' }));
    refreshRefs();
  }

  // Création d'un tag inexistant dans le référentiel depuis la relecture
  // (admin uniquement — bouton affiché si `isAdmin`). Le tag créé est
  // aussitôt sélectionné pour la recette en cours. Un doublon (même nom)
  // réutilise le tag existant plutôt que d'échouer sur l'unicité du slug.
  //
  // `status: 'published'` est indispensable : getTags() filtre sur
  // `status = 'published'` (et ce filtre exclut aussi les lignes NULL), donc un
  // tag inséré sans statut n'apparaîtrait jamais dans la liste de référence.
  async function addTag(name: string) {
    const clean = name.trim();
    if (!clean) return;
    const existing = allTags.find((t) => t.name.trim().toLowerCase() === clean.toLowerCase());
    if (existing) {
      setSelectedTags((prev) => new Map(prev).set(existing.id, existing.name));
      setNewTagName('');
      setTagPickerOpen(false);
      return;
    }
    setRefBusy(`tags:${clean.toLowerCase()}`);
    const { data, error } = await createClient()
      .from('tags')
      .insert({ name: clean, slug: slugify(clean), status: 'published' })
      .select('id, name, slug')
      .single();
    setRefBusy(null);
    if (error || !data) return void alert('Erreur : ' + (error?.message ?? 'insertion impossible'));
    setExtraTags((p) => [...p, data]);
    setSelectedTags((prev) => new Map(prev).set(data.id, data.name));
    setNewTagName('');
    setTagPickerOpen(false);
    refreshRefs();
  }
  // Dédoublonné par id, même raison que les référentiels ci-dessus (un tag en
  // double produirait deux entrées de même clé React dans le sélecteur).
  const allTags = useMemo(() => [...new Map([...tags, ...extraTags].map((t) => [t.id, t])).values()], [tags, extraTags]);
  const remainingTags = useMemo(() => allTags.filter((t) => !selectedTags.has(t.id)), [allTags, selectedTags]);

  // ── Mutations d'état ──
  // Mêmes intitulés que l'éditeur de recette : les options dépendent de la
  // façon dont le rendement est exprimé (un fonçage n'a de sens que pour un
  // moule).
  const scalingOptions: [string, string][] =
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

  // Le mode de rendement peut changer après le choix d'un ajustement :
  // « fonçage » n'est alors plus proposé, et ne doit pas rester enregistré à
  // l'insu de l'utilisateur.
  const normScaling = (v: string): string => (scalingOptions.some(([o]) => o === v) ? v : 'simple');

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
  const patchPhoto = (si: number, pi: number, url: string | null) => {
    // La photo évincée de l'emplacement retourne dans la banque (import PDF),
    // pour rester disponible sur une autre étape.
    const ancienne = sps[si]?.photos[pi] ?? null;
    if (ancienne && ancienne !== url) rendreALaBanque(ancienne);
    retirerDeLaBanque(url);
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, photos: sp.photos.map((p, j) => (j === pi ? url : p)) } : sp)));
  };
  const patchHero = (url: string | null) => {
    if (hero && hero !== url) rendreALaBanque(hero);
    retirerDeLaBanque(url);
    setHero(url);
  };
  const addIng = (si: number) =>
    setSps((prev) =>
      prev.map((sp, k) =>
        k === si ? { ...sp, ings: [...sp.ings, { key: nextKey(), imported: null, nom: '', qte: '', unite: '', note: '', allergen: [] }] } : sp,
      ),
    );
  const delIng = (si: number, ii: number) =>
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, ings: sp.ings.filter((_, j) => j !== ii) } : sp)));
  // ── Ustensiles (liste unique au niveau de la recette) ──
  const patchUtensil = (mi: number, patch: Partial<MatRow>) =>
    setUtensils((prev) => prev.map((m, j) => (j === mi ? { ...m, ...patch } : m)));
  const addUtensil = () => setUtensils((prev) => [...prev, { key: nextKey(), nom: '', commentaire: '' }]);
  const delUtensil = (mi: number) => setUtensils((prev) => prev.filter((_, j) => j !== mi));
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
    scaling: 'simple',
    ings: [],
    etapes: [{ key: nextKey(), imported: null, texte: '' }],
    tips: '',
    videoUrl: '',
    photos: [null, null, null, null, null, null, null, null],
    collapsed: false,
    ingsCollapsed: false,
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
    if (!confirm('Supprimer cette étape ?')) return;
    setSps((prev) => prev.filter((_, k) => k !== si));
  };
  // Repli / dépli d'une étape (comme l'éditeur de recette).
  const toggleSpCollapse = (si: number) =>
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, collapsed: !sp.collapsed } : sp)));
  const collapseAllSp = (v: boolean) => setSps((prev) => prev.map((sp) => ({ ...sp, collapsed: v })));
  // Repli / dépli de la liste d'ingrédients d'une étape.
  const toggleIngsCollapse = (si: number) =>
    setSps((prev) => prev.map((sp, k) => (k === si ? { ...sp, ingsCollapsed: !sp.ingsCollapsed } : sp)));
  // Insère une sous-étape vierge juste après l'index `ei` (porté de creer.html).
  const insertEtapeAfter = (si: number, ei: number) =>
    setSps((prev) =>
      prev.map((sp, k) =>
        k === si
          ? { ...sp, etapes: [...sp.etapes.slice(0, ei + 1), { key: nextKey(), imported: null, texte: '' }, ...sp.etapes.slice(ei + 1)] }
          : sp,
      ),
    );
  // Réordonne une sous-étape de l'index `from` vers `to`, au sein d'une même étape.
  const moveEtape = (si: number, from: number, to: number) =>
    setSps((prev) =>
      prev.map((sp, k) => {
        if (k !== si || from === to || from < 0 || to < 0 || from >= sp.etapes.length || to >= sp.etapes.length) return sp;
        const next = [...sp.etapes];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return { ...sp, etapes: next };
      }),
    );

  // ── Sommaire de navigation ──
  // Entrées dérivées de `sps` (source de vérité unique) : renommer, ajouter,
  // supprimer ou réordonner une étape met le sommaire à jour tout seul.
  const tocSteps = useMemo(() => sps.map((sp) => ({ key: sp.key, title: sp.nom })), [sps]);
  // Une étape repliée n'a rien à montrer une fois atteinte : on la déplie avant
  // que le sommaire ne défile vers elle.
  const expandSp = useCallback(
    (i: number) => setSps((prev) => (prev[i]?.collapsed ? prev.map((sp, k) => (k === i ? { ...sp, collapsed: false } : sp)) : prev)),
    [],
  );
  // Réordonne une étape de l'index `from` vers `to` (glisser-déposer).
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
  const ingredientsRecap = useMemo(() => mergeIngredientsRecap(sps), [sps]);

  // ── Lecture du formulaire → pivot corrigé ──
  function readForm(): any {
    const p = JSON.parse(JSON.stringify(recette || {}));
    p.titre = titre.trim();
    p.description = description.trim() || null;
    p.notes = notes.trim() || null;
    p.conseils_degustation = servingAdvice.trim() || null;
    p.difficulte = level || null;
    p.photo_principale = hero;
    // La banque suit le brouillon : un enregistrement intermédiaire ne doit pas
    // faire disparaître les photos du PDF encore non placées.
    p.photos_pdf = banque;
    p.tags = [...selectedTags.values()];
    p.source = {
      ...(p.source || {}),
      auteur_origine: source.trim() || null,
      url_origine: sourceUrl.trim() || null,
      video_url: videoUrl.trim() || null,
    };
    const dimsParsed: Record<string, number> = {};
    Object.entries(dims).forEach(([k, v]) => {
      const n = parseFloat(String(v).replace(',', '.'));
      if (!isNaN(n)) dimsParsed[k] = n;
    });
    p.rendement = {
      ...(p.rendement || {}),
      mode: measure,
      pieces_corrige: measure === 'units' ? numOrNull(qtyAmount) : null,
      qty_unit_corrige: measure === 'units' ? qtyUnit : null,
      moule_corrige:
        measure === 'mold'
          ? {
              type_id: moldTypeId ? Number(moldTypeId) : null,
              count: moldCount.trim() || null,
              dims: Object.keys(dimsParsed).length ? dimsParsed : null,
            }
          : null,
      libelle_corrige: measure === 'dimensions' ? dimsDesc.trim() || null : null,
      notes_quantites: yieldNotes.trim() || null,
    };
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
      scaling_mode: normScaling(sp.scaling),
      ingredients: sp.ings
        .map((g) => ({
          nom: g.nom.trim(),
          quantite: numOrNull(g.qte),
          unite: g.unite || null,
          note: g.note.trim() || null,
          allergene: g.allergen.length ? g.allergen.join(', ') : null,
        }))
        .filter((g) => g.nom),
      etapes: sp.etapes.map((e, k) => ({ ordre: k + 1, texte: e.texte.trim() })).filter((e) => e.texte),
      conseils: sp.tips.trim() || null,
      video: sp.videoUrl.trim() || null,
      photos: sp.photos.filter((p): p is string => !!p),
    }));
    p.materiel = utensils
      .map((m) => ({ nom: m.nom.trim(), commentaire: m.commentaire.trim() || null }))
      .filter((m) => m.nom);
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
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await save();
      // Les corrections viennent d'être écrites en base : on invalide le rendu
      // serveur pour que « Mes imports » et cette relecture restent en phase.
      router.refresh();
      setSaveStatus('Corrections enregistrées ✓');
      setTimeout(() => setSaveStatus(''), 3000);
    } catch (e) {
      alert('Erreur : ' + (e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function onCreate() {
    // Verrou posé avant tout `await` : deux clics dans le même tick ne peuvent
    // pas ouvrir deux créations concurrentes.
    if (busyRef.current) return;
    // Unité obligatoire dès qu'une quantité est saisie : une unité importée
    // non reconnue (absente du référentiel) ne doit jamais atteindre la table
    // `ingredients` telle quelle (cf. normaliseUnite côté import).
    const validUnitNames = new Set(unitOptions);
    for (const sp of sps) {
      for (const g of sp.ings) {
        if (g.nom.trim() && String(g.qte).trim() && !validUnitNames.has(g.unite)) {
          alert(`Choisissez une unité pour « ${g.nom.trim()} » avant de créer la recette.`);
          return;
        }
      }
    }
    if (!confirm('Créer cette recette dans votre carnet (brouillon privé) ?')) return;
    busyRef.current = true;
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

      // Rendement → champs recettes (mode choisi en relecture, cf. readForm()).
      const r = p.rendement || {};
      let measure: {
        measure_type: string;
        yield_qty: string | null;
        yield_unit: string | null;
        yield_desc: string | null;
        mold_type_id: number | null;
        mold_dims: Record<string, number> | null;
      } = { measure_type: 'units', yield_qty: null, yield_unit: 'unite', yield_desc: null, mold_type_id: null, mold_dims: null };
      if (r.mode === 'mold' && r.moule_corrige) {
        const mtId: number | null = r.moule_corrige.type_id || null;
        const forme = moldTypes.find((t) => t.id === mtId)?.forme || null;
        const dimsObj: Record<string, number> = r.moule_corrige.dims || {};
        const count = parseInt(r.moule_corrige.count, 10);
        const dimsTxt = composeMoldDesc(forme, dimsObj);
        measure = {
          measure_type: 'mold',
          yield_qty: count > 0 ? String(count) : null,
          yield_unit: null,
          yield_desc: dimsTxt ? (count > 1 ? `${count} × ${dimsTxt}` : dimsTxt) : null,
          mold_type_id: mtId,
          mold_dims: Object.keys(dimsObj).length ? dimsObj : null,
        };
      } else if (r.mode === 'units' && r.pieces_corrige) {
        measure = {
          measure_type: 'units',
          yield_qty: String(r.pieces_corrige),
          yield_unit: r.qty_unit_corrige || 'unite',
          yield_desc: null,
          mold_type_id: null,
          mold_dims: null,
        };
      } else if (r.mode === 'dimensions' && r.libelle_corrige) {
        measure = { measure_type: 'dimensions', yield_qty: null, yield_unit: null, yield_desc: r.libelle_corrige, mold_type_id: null, mold_dims: null };
      }

      const diffRow = p.difficulte ? closestDifficulty(difficulties, p.difficulte) : null;

      const payload = {
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
        yield_notes: r.notes_quantites || null,
        hero_image_url: p.photo_principale || null,
        difficulty_id: diffRow?.id ?? null,
        prep_time: t.preparation_min ?? null,
        cook_time: t.cuisson_min ?? null,
        wait_time: attente || null,
        total_time: total || null,
        ...measure,
      };

      // Nouvelle tentative après un échec en cours de création : la recette
      // existe déjà, on la reprend (mise à jour + purge des liaisons déjà
      // écrites) au lieu d'en créer une seconde, identique.
      let recipeId = createdRecipeIdRef.current;
      if (recipeId) {
        const { data: updated, error } = await supabase.from('recipes').update(payload).eq('id', recipeId).select('id').maybeSingle();
        if (error) throw new Error(error.message);
        if (!updated) {
          // Recette supprimée du carnet entre-temps : on repart d'une création.
          recipeId = null;
          createdRecipeIdRef.current = null;
        } else {
          await supabase.from('recipe_tags').delete().eq('recipe_id', recipeId);
          await supabase.from('recipe_utensils').delete().eq('recipe_id', recipeId);
          await supabase.from('ingredient_groups').delete().eq('recipe_id', recipeId);
          await supabase.from('recipe_steps').delete().eq('recipe_id', recipeId);
        }
      }
      if (!recipeId) {
        const { data: recipe, error: recErr } = await supabase.from('recipes').insert(payload).select('id').single();
        if (recErr || !recipe) throw new Error(recErr?.message || 'Création refusée');
        recipeId = recipe.id;
        createdRecipeIdRef.current = recipe.id;
        // Rattachement immédiat de l'import à la recette : si la suite échoue,
        // la reprise repart de cette recette plutôt que d'en créer une autre.
        await supabase.from('imports').update({ recipe_id: recipe.id }).eq('id', importRow.id);
      }

      if (selectedTags.size > 0) {
        const { error } = await supabase.from('recipe_tags').insert([...selectedTags.keys()].map((tag_id) => ({ recipe_id: recipeId, tag_id })));
        if (error) throw error;
      }

      const sousPreps = p.sous_preparations || [];
      for (let i = 0; i < sousPreps.length; i++) {
        const sp = sousPreps[i];
        const spt = sp.temps || {};
        const sousEtapes = (sp.etapes || []).map((e: any) => e.texte).filter(Boolean);
        const { data: stepRow, error: stepErr } = await supabase
          .from('recipe_steps')
          .insert({
            recipe_id: recipeId,
            step_number: i + 1,
            title: sp.nom || `Étape ${i + 1}`,
            description: null,
            prep_time: spt.preparation_min || null,
            cook_time: spt.cuisson_min || null,
            cook_temp: sp.temperature_c || null,
            wait_time: spt.attente_min || null,
            day_offset: sp.day_offset || 0,
            tips: sp.conseils || null,
            video_url: sp.video || null,
            sous_etapes: sousEtapes.length ? sousEtapes : null,
            order_index: i,
          })
          .select('id')
          .single();
        if (stepErr || !stepRow) throw stepErr || new Error('Étape non enregistrée');

        const photoUrls: string[] = Array.isArray(sp.photos) ? sp.photos.filter((p: any) => !!p) : [];
        if (photoUrls.length) {
          const { error } = await supabase
            .from('step_photos')
            .insert(photoUrls.map((url, pi) => ({ step_id: stepRow.id, url, order_index: pi })));
          if (error) throw error;
        }

        const lines = (sp.ingredients || [])
          .map((g: any, k: number) => ({
            name: g.nom,
            quantity: g.quantite != null ? String(g.quantite) : null,
            unit: g.unite || null,
            comment: g.note || null,
            allergen: g.allergene || null,
            order_index: k,
            ref_id: resolveIngredientRefId(g.nom || '', ingredientRefIds),
          }))
          .filter((l: any) => l.name);
        if (lines.length) {
          const { data: grp, error: grpErr } = await supabase
            .from('ingredient_groups')
            .insert({
              recipe_id: recipeId,
              name: sp.nom || `Étape ${i + 1}`,
              order_index: i,
              scaling_mode: sp.scaling_mode || 'simple',
            })
            .select()
            .single();
          if (grpErr || !grp) throw grpErr || new Error('Groupe non enregistré');
          const { error: ingErr } = await supabase.from('ingredients').insert(lines.map((l: any) => ({ ...l, group_id: grp.id })));
          if (ingErr) throw ingErr;
        }
      }

      const mats = (p.materiel || []).filter((m: any) => m?.nom);
      if (mats.length) {
        const { error } = await supabase
          .from('recipe_utensils')
          .insert(mats.map((m: any, i: number) => ({ recipe_id: recipeId, name: m.nom, comment: m.commentaire || null, order_index: i })));
        if (error) throw error;
      }

      await supabase.from('imports').update({ statut: 'verifiee', recipe_id: recipeId }).eq('id', importRow.id);
      // Invalide le rendu serveur avant de naviguer : le carnet de recettes et
      // la liste « Mes imports » doivent refléter la recette créée.
      router.refresh();
      router.push(`/creer?id=${recipeId}`);
    } catch (e) {
      // La recette a pu être créée avant l'échec : `createdRecipeIdRef` fait
      // qu'une nouvelle tentative la reprend au lieu d'en créer une seconde.
      alert('Erreur à la création : ' + (e as Error).message);
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Bouton « Quitter » du rail : la suppression d'un import ne se fait plus
  // depuis la relecture (déplacée dans la liste des imports, cf.
  // ImporterList `supprimer`) — ce bouton ne fait que quitter, avec
  // confirmation si des corrections n'ont pas été enregistrées.
  const handleLeave = useCallback(() => {
    if (dirtyRef.current && !confirm('Quitter sans enregistrer les modifications en cours ?')) return;
    // Pas de reset à false ensuite : on quitte la page, autant garder le
    // spinner affiché jusqu'à la navigation (cf. DuplicateButton/CreerForm).
    setLeaving(true);
    router.push('/importer');
  }, [router]);

  const champ = 'border border-outline-variant rounded-lg px-2.5 py-1.5 bg-white text-[15px] w-full focus:outline-none focus:border-primary';

  return (
    <>
      <RecipeToc
        sections={RELECTURE_SECTIONS}
        steps={tocSteps}
        onNavigateToStep={expandSp}
        actions={[
          {
            id: 'create',
            icon: 'menu_book',
            label: importRow.statut !== 'brouillon' && importRow.recipe_id ? 'Voir la recette créée' : 'Créer la recette dans mon carnet',
            variant: 'filled',
            onClick: () => {
              if (importRow.statut !== 'brouillon' && importRow.recipe_id) router.push(`/recette/${importRow.recipe_id}`);
              else onCreate();
            },
            disabled: busy || leaving,
          },
          { id: 'save', icon: 'save', label: 'Enregistrer les corrections', variant: 'outline-strong', onClick: onSave, disabled: busy || leaving },
          { id: 'leave', icon: 'close', label: 'Quitter sans enregistrer', variant: 'outline', onClick: handleLeave, disabled: busy || leaving },
        ]}
      />

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
      ) : estPdf || importRow.source_type === 'photo' ? (
        <p className="text-sm text-on-surface-variant mb-6">
          Source : {estPdf ? 'PDF' : 'photos'}
          {recette.source?.fichier_original ? ` — ${recette.source.fichier_original}` : ''}
          {recette.source?.auteur_origine ? ` — par ${recette.source.auteur_origine}` : ''}
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

      <PhotoBank photos={banque} onSupprimer={retirerDeLaBanque} />

      {/* Infos générales */}
      <section id="sec-infos" className="scroll-mt-28 bg-surface-container-low border border-outline-variant rounded-xl p-6 mb-8">
        <h2 className="font-headline-md text-[22px] text-primary mb-4">Informations générales</h2>
        <div className="grid grid-cols-1 gap-4">
          <div className="aspect-[16/9] border border-dashed border-outline-variant overflow-hidden rounded-lg">
            <ImageSlot
              src={hero}
              onChange={patchHero}
              onClear={() => patchHero(null)}
              shape="rect"
              maxWidth={1200}
              placeholder="Photo principale de la recette (format paysage 16:9) — taille idéale : 1200 × 675 px"
              className="w-full h-full"
            />
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Titre</span>
            <input value={titre} onChange={(e) => setTitre(e.target.value)} className={`${champ} font-headline-md text-[20px]`} />
          </label>
          <div className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Catégories et Tags</span>
            <div className="flex flex-wrap gap-2 items-center mt-1">
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
            {/* Création d'un tag hors référentiel — réservée aux admins. */}
            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <input
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTag(newTagName);
                    }
                  }}
                  placeholder="Nouveau tag (hors référentiel)"
                  className={`${champ} flex-1 min-w-[200px] text-sm`}
                />
                <button
                  type="button"
                  disabled={!newTagName.trim() || refBusy === `tags:${newTagName.trim().toLowerCase()}`}
                  onClick={() => addTag(newTagName)}
                  title="Créer ce tag dans le référentiel et l'ajouter à la recette"
                  className="px-4 py-1.5 rounded-full border border-primary text-primary font-label-md text-label-md hover:bg-primary hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none"
                >
                  Créer le tag
                </button>
              </div>
            )}
          </div>
          <label className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Description rapide</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={champ} />
          </label>
          <div className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Taille / Nombre de portions</span>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-x-6 gap-y-1 mt-1">
              <div className="text-sm text-on-surface-variant lg:pt-1.5">
                {importedRendement ? '• ' + importedRendement : <span className="italic opacity-60">non précisé à l&apos;import</span>}
              </div>
              <div>
            <div className="flex flex-wrap gap-4">
              {(
                [
                  ['units', "Par nombre d'unités / poids"],
                  ['mold', 'Par type de moule / cercle'],
                  ['dimensions', 'Description libre'],
                ] as const
              ).map(([v, lbl]) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <div className="relative flex items-center justify-center shrink-0">
                    <div className={`w-4 h-4 border-2 rounded-full transition-colors ${measure === v ? 'border-primary' : 'border-outline-variant'}`} />
                    <div className={`absolute w-2 h-2 bg-primary rounded-full transition-opacity ${measure === v ? 'opacity-100' : 'opacity-0'}`} />
                  </div>
                  <input type="radio" checked={measure === v} onChange={() => setMeasure(v)} className="sr-only" />
                  <span className="text-sm">{lbl}</span>
                </label>
              ))}
            </div>

            {measure === 'units' && (
              <div className="flex flex-wrap gap-3 items-end mt-3">
                <input
                  type="number"
                  min={0}
                  value={qtyAmount}
                  onChange={(e) => setQtyAmount(e.target.value)}
                  className={champ}
                  style={{ width: '6rem' }}
                  placeholder="ex : 6"
                />
                <select value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value)} className={champ} style={{ width: 'auto' }}>
                  {Object.entries(UNITS_LBL).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {measure === 'mold' && (
              <div className="mt-3 flex flex-col gap-3">
                <select
                  value={moldTypeId}
                  onChange={(e) => setMoldTypeId(e.target.value)}
                  className={champ}
                  style={{ maxWidth: '20rem' }}
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
                <div className="flex flex-wrap gap-4 items-end">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-on-surface-variant">Nombre</span>
                    <input
                      type="number"
                      min={1}
                      value={moldCount}
                      onChange={(e) => setMoldCount(e.target.value)}
                      className={champ}
                      style={{ width: '5rem' }}
                      placeholder="ex : 6"
                    />
                  </label>
                  {(MOLD_FORME_DIMS[moldForme || ''] || []).map((k) => (
                    <label key={k} className="flex flex-col gap-1">
                      <span className="text-xs text-on-surface-variant">{DIM_LABELS[k]}</span>
                      <span className="flex items-baseline gap-1">
                        <input
                          type="number"
                          min={0}
                          step="any"
                          value={dims[k] || ''}
                          onChange={(e) => setDims((p) => ({ ...p, [k]: e.target.value }))}
                          className={champ}
                          style={{ width: '5rem' }}
                          placeholder="0"
                        />
                        <span className="text-xs text-on-surface-variant">cm</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {measure === 'dimensions' && (
              <input
                value={dimsDesc}
                onChange={(e) => setDimsDesc(e.target.value)}
                className={`${champ} mt-3`}
                placeholder="ex : 20 cm × 5 cm, Ø 22 cm…"
              />
            )}

            <label className="flex flex-col gap-1 mt-4">
              <span className="text-xs text-on-surface-variant">Complément d&apos;informations sur les quantités</span>
              <textarea
                value={yieldNotes}
                onChange={(e) => setYieldNotes(e.target.value)}
                rows={3}
                className={`${champ} text-sm`}
                placeholder="Précisions utiles à un ajustement des quantités par IA (ex : le moule est rempli aux 3/4, prévoir une marge de fonçage…)"
              />
            </label>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Difficulté</span>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setLevel(i + 1)}
                    className={`transition-transform hover:scale-110 ${i <= level - 1 ? 'text-primary' : 'text-outline-variant'}`}
                    aria-label={`Niveau ${i + 1}`}
                  >
                    <MaryseIcon size={24} />
                  </button>
                ))}
              </div>
              {levelLabel && <span className="font-label-md text-label-md text-on-surface">{levelLabel}</span>}
            </div>
          </div>
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
        </div>
      </section>

      {/* Ustensiles (liste unique de la recette, regroupée depuis les étapes importées) */}
      <section id="sec-ustensiles" className="scroll-mt-28 bg-surface-container-low border border-outline-variant rounded-xl p-6 mb-8">
        <h2 className="font-headline-md text-[22px] text-primary mb-4">Ustensiles</h2>
        <div className="flex flex-col mb-2">
          {utensils.length === 0 ? (
            <p className="text-sm italic text-on-surface-variant py-1">Aucun ustensile importé</p>
          ) : (
            utensils.map((m, mi) => {
              const known = knownUtensils.has(m.nom.trim().toLowerCase());
              return (
                <div key={m.key} className="py-1.5 border-b border-outline-variant/20">
                  <div className="flex items-center gap-2">
                    <input
                      list="dl-utensils"
                      value={m.nom}
                      onChange={(e) => patchUtensil(mi, { nom: e.target.value })}
                      className={champ}
                      placeholder="Nom de l'ustensile"
                      autoComplete="off"
                    />
                    <button type="button" title="Supprimer" onClick={() => delUtensil(mi)} tabIndex={-1} className="text-error hover:opacity-70 shrink-0">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                  <textarea
                    value={m.commentaire}
                    onChange={(e) => patchUtensil(mi, { commentaire: e.target.value })}
                    className={`${champ} text-sm mt-1 resize-y`}
                    rows={1}
                    placeholder="Commentaire (optionnel — taille, réglage…)"
                  />
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
        <button type="button" onClick={addUtensil} className="flex items-center gap-1 text-secondary font-label-md text-[12px] hover:underline">
          <span className="material-symbols-outlined text-[16px]">add</span> Ajouter un ustensile
        </button>
      </section>

      {/* Étapes */}
      <div id="sec-etapes" className="scroll-mt-28 flex justify-end gap-6 mb-4">
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
            id={stepAnchorId(si)}
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
            className={`scroll-mt-28 border border-outline-variant rounded-xl overflow-hidden ${dragSp === si ? 'opacity-50' : ''}`}
          >
            <div className="bg-surface-container-high px-6 py-3 flex items-center gap-3">
              <span
                className="material-symbols-outlined text-outline-variant select-none cursor-grab active:cursor-grabbing p-1 -m-1"
                title="Glisser pour déplacer l'étape"
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
                title="Replier / déplier l'étape"
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
            {/* Ajustement des quantités : même réglage que l'éditeur de
                recette, absent jusqu'ici de la relecture — une recette
                importée arrivait donc toujours en ajustement proportionnel,
                sans moyen de le corriger avant sa création. */}
            <div className="px-6 py-3 border-b border-outline-variant/50 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="font-label-md text-[9px] uppercase tracking-widest text-on-surface-variant shrink-0">
                Ajustement des quantités de cette étape
              </span>
              <select
                value={normScaling(sp.scaling)}
                onChange={(e) => patchSp(si, { scaling: e.target.value })}
                aria-label={`Ajustement des quantités — étape ${si + 1}`}
                className={`${champ} cursor-pointer`}
                style={{ width: 'auto' }}
              >
                {scalingOptions.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
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
              <button
                type="button"
                onClick={() => toggleIngsCollapse(si)}
                className="flex items-center gap-2 mb-2 text-on-surface-variant hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">{sp.ingsCollapsed ? 'expand_more' : 'expand_less'}</span>
                <span className="font-label-md text-label-md">Ingrédients ({sp.ings.length})</span>
              </button>
              {!sp.ingsCollapsed && (
              <>
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
                                patchIng(si, ii, { nom, allergen: parseAllergens(refAllergenMap[refKey]) });
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
                            <option value="">— unité —</option>
                            {unitOptions.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                          <button type="button" title="Supprimer" onClick={() => delIng(si, ii)} tabIndex={-1} className="text-error hover:opacity-70">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                        <textarea
                          value={g.note}
                          onChange={(e) => patchIng(si, ii, { note: e.target.value })}
                          className={`${champ} text-sm mt-1 resize-y`}
                          rows={1}
                          placeholder="Commentaire (optionnel — pommade, à froid…)"
                        />
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {g.allergen.map((a) => (
                            <span
                              key={a}
                              className="inline-flex items-center gap-0.5 bg-secondary-fixed text-on-secondary-fixed rounded-full pl-2 pr-0.5 py-0.5 text-[13px]"
                            >
                              {a}
                              <button
                                type="button"
                                title="Retirer"
                                onClick={() => patchIng(si, ii, { allergen: g.allergen.filter((x) => x !== a) })}
                                className="hover:text-error transition-colors"
                              >
                                <span className="material-symbols-outlined text-[14px] align-middle">close</span>
                              </button>
                            </span>
                          ))}
                          {g.allergen.length === 0 ? (
                            // Aucun allergène : menu déroulant pour le premier choix.
                            <select
                              value=""
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v && !g.allergen.includes(v)) patchIng(si, ii, { allergen: [...g.allergen, v] });
                              }}
                              className={`${champ} text-sm italic cursor-pointer`}
                              style={{ width: 'auto' }}
                              title="Ajouter un allergène (table de référence)"
                            >
                              <option value="">Allergène (optionnel)</option>
                              {allAllergens.map((a) => (
                                <option key={a.id} value={a.name}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            g.allergen.length < MAX_ALLERGENS && (
                              // Déjà au moins un allergène : bouton + ouvrant la popup.
                              <button
                                type="button"
                                title="Ajouter un allergène"
                                onClick={() => setAllergenPopup({ si, ii })}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full border border-outline-variant text-primary hover:bg-primary-container transition-colors"
                              >
                                <span className="material-symbols-outlined text-[16px]">add</span>
                              </button>
                            )
                          )}
                        </div>
                        {isAdmin && g.nom.trim() && !known && (
                          <button
                            type="button"
                            onClick={() => addIngredientRef(g.nom, g.allergen)}
                            disabled={refBusy === `ingredient_refs:${g.nom.trim().toLowerCase()}`}
                            className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                            title={
                              g.allergen[0]
                                ? `Ajouter cet ingrédient (allergène : ${g.allergen[0]}) à la base de référence`
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
              </>
              )}

              {/* Étapes */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-x-6 mb-2">
                <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Sous-étapes importées</p>
                <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Version corrigée</p>
              </div>
              <div className="flex flex-col gap-3 mb-2">
                {sp.etapes.map((e, ei) => (
                  <div
                    key={e.key}
                    onDragOver={(ev) => {
                      if (!dragEtape || dragEtape.si !== si) return;
                      ev.preventDefault();
                      ev.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(ev) => {
                      if (!dragEtape || dragEtape.si !== si) return;
                      ev.preventDefault();
                      moveEtape(si, dragEtape.ei, ei);
                      setDragEtape(null);
                    }}
                    className={`flex items-start gap-2 border-b border-outline-variant/20 pb-3 ${
                      dragEtape?.si === si && dragEtape.ei === ei ? 'opacity-50' : ''
                    }`}
                  >
                    <span
                      className="material-symbols-outlined text-outline-variant select-none cursor-grab active:cursor-grabbing p-1 -m-1 mt-2 shrink-0"
                      title="Glisser pour déplacer la sous-étape"
                      draggable
                      onDragStart={(ev) => {
                        setDragEtape({ si, ei });
                        ev.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDragEtape(null)}
                    >
                      drag_indicator
                    </span>
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-x-6 gap-y-1 items-start flex-1">
                      <div className="text-sm text-on-surface-variant lg:pt-2">
                        {e.imported ? e.imported : <span className="italic opacity-60">ajoutée</span>}
                      </div>
                      <div className="flex items-start gap-2">
                        <textarea value={e.texte} onChange={(ev) => patchEtape(si, ei, { texte: ev.target.value })} rows={4} className={`${champ} flex-1`} />
                        <div className="flex flex-col gap-1 mt-2 shrink-0">
                          <button
                            type="button"
                            title="Insérer une sous-étape après celle-ci"
                            onClick={() => insertEtapeAfter(si, ei)}
                            tabIndex={-1}
                            className="text-secondary hover:opacity-70"
                          >
                            <span className="material-symbols-outlined text-[18px]">add_row_below</span>
                          </button>
                          <button type="button" title="Supprimer" onClick={() => delEtape(si, ei)} tabIndex={-1} className="text-error hover:opacity-70">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => addEtape(si)} className="flex items-center gap-1 text-secondary font-label-md text-[12px] hover:underline">
                <span className="material-symbols-outlined text-[16px]">add</span> Ajouter une sous-étape
              </button>

              {/* Photos de l'étape */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                {sp.photos.map((p, pi) => (
                  <div key={pi} className="aspect-square border border-dashed border-outline-variant overflow-hidden rounded-lg">
                    <ImageSlot
                      src={p}
                      onChange={(url) => patchPhoto(si, pi, url)}
                      onClear={() => patchPhoto(si, pi, null)}
                      shape="rect"
                      maxWidth={800}
                      placeholder={`Visuel ${pi + 1} — taille idéale : 800 × 800 px`}
                      className="w-full h-full"
                    />
                  </div>
                ))}
              </div>

              {/* Lien vidéo de l'étape */}
              <div className="mt-6">
                <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Lien vidéo (YouTube, Vimeo…)</p>
                <input
                  value={sp.videoUrl}
                  onChange={(e) => patchSp(si, { videoUrl: e.target.value })}
                  type="url"
                  className={champ}
                  placeholder="https://… (optionnel)"
                />
              </div>

              {/* Conseils & astuces de l'étape */}
              <div className="mt-6">
                <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant mb-2">Conseils &amp; astuces de l&apos;étape</p>
                <textarea
                  value={sp.tips}
                  onChange={(e) => patchSp(si, { tips: e.target.value })}
                  rows={3}
                  className={champ}
                  placeholder="Une astuce particulière pour cette étape ?"
                />
              </div>
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

      {/* Conseils et astuces de la recette.
          Ancre « Conseils recette/dégustation » du sommaire : elle couvre cette
          section et la suivante, qui se suivent immédiatement. */}
      <section id="sec-conseils" className="scroll-mt-28 mt-12 bg-surface-container-low border border-outline-variant rounded-xl p-6">
        <h2 className="font-headline-md text-[22px] text-primary mb-4">Conseils et astuces de la recette</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className={champ}
          placeholder="Partagez vos secrets pour réussir cette recette à coup sûr (conservation, variantes, erreurs à éviter)…"
        />
      </section>

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
      <section id="sec-indications" className="scroll-mt-28 mt-12 bg-primary text-white rounded-xl p-6 md:p-8">
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
              ['Rendement', rendementLabel.trim() || '—'],
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

      {/* Récapitulatif des ingrédients : fusion des lignes identiques (nom +
          unité) de toutes les étapes, purement dérivé (rien n'est enregistré
          ici) — même principe que dans l'éditeur de recette (CreerForm). */}
      <section id="sec-ingredients" className="scroll-mt-28 mt-12 bg-surface-container-low border border-outline-variant rounded-xl p-6">
        <h2 className="font-headline-md text-[22px] text-primary mb-4">Récapitulatif des ingrédients</h2>
        {ingredientsRecap.length === 0 ? (
          <p className="text-on-surface-variant italic text-sm">Les ingrédients saisis dans les étapes apparaîtront ici automatiquement.</p>
        ) : (
          <div className="max-w-2xl" style={{ display: 'grid', gridTemplateColumns: 'max-content max-content', columnGap: 40 }}>
            {ingredientsRecap.map((m, k) => {
              const conv = ingredientConversionText(conversions, unitRefs, resolveIngredientRefId(m.name, ingredientRefIds), m.unit, m.qty);
              return (
                <div key={k} className="border-b border-outline-variant/30 py-1.5" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                  <span className="font-body-md text-body-md text-on-surface">{m.name}</span>
                  <span className="font-label-md text-label-md text-primary whitespace-nowrap text-center">
                    {[m.qty, m.unit].filter(Boolean).join(' ')}
                    {conv && <span className="text-on-surface-variant font-body-md text-[12px]"> ({conv})</span>}
                  </span>
                </div>
              );
            })}
          </div>
        )}
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

      {/* Barre d'actions fixe */}
      <div
        className="recipe-toc-fallback-bar fixed bottom-0 left-0 w-full bg-surface/95 backdrop-blur border-t border-outline-variant z-40 px-margin-mobile md:px-margin-desktop py-3"
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
              disabled={busy || leaving}
              className="bg-primary text-on-primary px-8 py-3 rounded-full font-label-md text-label-md flex items-center gap-2 hover:shadow-lg transition-all active:scale-95 disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-[18px]">menu_book</span> Créer la recette dans mon carnet
            </button>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={busy || leaving}
            className="border border-primary text-primary px-6 py-3 rounded-full font-label-md text-label-md hover:bg-primary hover:text-white transition-all active:scale-95 disabled:opacity-60"
          >
            Enregistrer les corrections
          </button>
          <span className="text-sm text-secondary font-label-md">{saveStatus}</span>
          <button
            type="button"
            onClick={handleLeave}
            disabled={busy || leaving}
            className="ml-auto flex items-center gap-2 text-on-surface-variant font-label-md text-label-md hover:text-primary hover:underline disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[18px]">close</span> Quitter sans enregistrer
          </button>
        </div>
      </div>

      {/* Popup de choix des allergènes d'un ingrédient (max 3). Bascule chaque
          allergène de la table de référence ; les modifications sont live. */}
      {allergenPopup &&
        (() => {
          const { si, ii } = allergenPopup;
          const ing = sps[si]?.ings[ii];
          if (!ing) return null;
          const selected = ing.allergen;
          const toggle = (name: string) => {
            if (selected.includes(name)) patchIng(si, ii, { allergen: selected.filter((x) => x !== name) });
            else if (selected.length < MAX_ALLERGENS) patchIng(si, ii, { allergen: [...selected, name] });
          };
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/30" onClick={() => setAllergenPopup(null)} />
              <div className="relative w-full max-w-sm bg-surface-bright border border-outline-variant rounded-xl shadow-xl p-6">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-headline-md text-lg font-semibold text-primary">Allergènes</h3>
                  <button type="button" onClick={() => setAllergenPopup(null)} className="text-on-surface-variant hover:text-primary">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
                <p className="text-xs text-on-surface-variant mb-4">
                  {ing.nom.trim() || 'Ingrédient'} — {selected.length}/{MAX_ALLERGENS} sélectionné(s)
                </p>
                {allAllergens.length === 0 ? (
                  <p className="text-sm text-on-surface-variant italic">Aucun allergène dans la table de référence.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                    {allAllergens.map((a) => {
                      const on = selected.includes(a.name);
                      const disabled = !on && selected.length >= MAX_ALLERGENS;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => toggle(a.name)}
                          disabled={disabled}
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] border transition-colors ${
                            on
                              ? 'bg-primary text-on-primary border-primary'
                              : disabled
                                ? 'border-outline-variant text-on-surface-variant/40 cursor-not-allowed'
                                : 'border-outline-variant text-on-surface hover:bg-surface-container-high'
                          }`}
                        >
                          {on && <span className="material-symbols-outlined text-[16px]">check</span>}
                          {a.name}
                        </button>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setAllergenPopup(null)}
                  className="mt-6 w-full bg-primary text-on-primary py-2.5 rounded-lg text-sm font-semibold hover:opacity-90"
                >
                  Terminé
                </button>
              </div>
            </div>
          );
        })()}

      {/* Écriture en cours (corrections ou création de la recette, suivie
          d'une navigation) : overlay « Le Fouet » plein écran, cf. CLAUDE.md. */}
      <LoadingOverlay visible={busy || leaving} label={leaving ? 'Retour à la liste des imports…' : undefined} />
    </>
  );
}
