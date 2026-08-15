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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageSlot } from '@/components/ImageSlot';
import { RecipeToc, CREER_SECTIONS, stepAnchorId } from '@/components/recipe/RecipeToc';
import { MaryseIcon } from '@/components/MaryseIcon';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import type { Tag, Difficulty } from '@/lib/taxonomy';
import type { MoldType } from '@/lib/admin';
import type { Unit } from '@/lib/profile';
import type { RecipeFull } from '@/lib/recipes';
import { ingredientConversionText, resolveIngredientRefId, type ConversionRef, type IngredientRefOption } from '@/lib/ingredient-conversions';
import { formatDate } from '@/lib/format';
import { normLoose } from '@/lib/search-params';
import { capitalizeSentences } from '@/lib/text';

type MeasureType = 'units' | 'mold' | 'dimensions';
// `allergen` : jusqu'à 3 allergènes, choisis uniquement dans la table de
// référence (plus de saisie libre). Persistés en une chaîne « a, b, c » dans
// la colonne texte `ingredients.allergen` (compatible avec l'affichage recette
// qui redécoupe sur les virgules).
const MAX_ALLERGENS = 3;
type IngLine = { key: string; name: string; qty: string; unit: string; comment: string; allergen: string[] };
type StepState = {
  key: string;
  title: string;
  dayOffset: string;
  prep: string;
  cook: string;
  temp: string;
  wait: string;
  description: string;
  // Sous-étapes : `null` → mode texte libre (description). Un tableau (même
  // vide) → mode liste : la description est éclatée en sous-étapes éditables.
  subSteps: string[] | null;
  tips: string;
  videoUrl: string;
  scaling: string;
  ings: IngLine[];
  photos: (StepPhoto | null)[];
  collapsed: boolean;
};

type StepPhoto = { url: string; original_url: string; ai_retouched: boolean };

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

// Éclatement d'un texte de description en sous-étapes : on découpe sur les
// sauts de ligne puis sur les puces/tirets en tête (« - », « • », « – », « * »),
// comme la version d'origine. Un texte vide donne une première sous-étape vide.
function splitSousEtapes(description: string): string[] {
  const parts = description
    .split(/\n+/)
    .flatMap((l) => l.split(/(?:^|(?<=\s))[-•–*]\s+/))
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [''];
}

let uid = 0;
const key = () => `k${uid++}`;

// Slug généré depuis un libellé (même règle que le back-office des listes) :
// la colonne `tags.slug` est NOT NULL et n'est pas saisie dans l'éditeur.
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const emptyIng = (): IngLine => ({ key: key(), name: '', qty: '', unit: '', comment: '', allergen: [] });

// Découpe la valeur stockée (« a, b ») en liste d'allergènes (max 3).
const parseAllergens = (raw: string | null | undefined): string[] =>
  (raw || '')
    .split(/[,;/]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_ALLERGENS);
const emptyStep = (): StepState => ({
  key: key(),
  title: '',
  dayOffset: '',
  prep: '',
  cook: '',
  temp: '',
  wait: '',
  description: '',
  subSteps: null,
  tips: '',
  videoUrl: '',
  scaling: 'simple',
  ings: [emptyIng()],
  photos: [null, null, null, null, null, null, null, null],
  collapsed: false,
});

function stepsFromRecipe(r: RecipeFull): StepState[] {
  const groupsByOrder: Record<number, RecipeFull['ingredient_groups'][number]> = {};
  (r.ingredient_groups || []).forEach((g) => (groupsByOrder[g.order_index || 0] = g));
  const steps = [...(r.recipe_steps || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  if (!steps.length) return [emptyStep()];
  return steps.map((s) => {
    const grp = groupsByOrder[s.order_index || 0];
    // Réédition : sous-étapes enregistrées → on rouvre le mode liste éditable ;
    // sinon on repart de la description en texte libre.
    const subSteps = Array.isArray(s.sous_etapes) && s.sous_etapes.length ? s.sous_etapes.map((t) => String(t)) : null;
    const desc = s.description || '';
    const ings = [...(grp?.ingredients || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const photos = [...(s.step_photos || [])]
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .map((p) => ({ url: p.url, original_url: p.original_url || p.url, ai_retouched: p.ai_retouched ?? false }));
    return {
      key: key(),
      title: s.title || '',
      dayOffset: s.day_offset ? String(s.day_offset) : '',
      prep: s.prep_time != null ? String(s.prep_time) : '',
      cook: s.cook_time != null ? String(s.cook_time) : '',
      temp: s.cook_temp != null ? String(s.cook_temp) : '',
      wait: s.wait_time != null ? String(s.wait_time) : '',
      description: desc,
      subSteps,
      tips: s.tips || '',
      videoUrl: s.video_url || '',
      scaling: grp?.scaling_mode || 'simple',
      ings: ings.length
        ? ings.map((i) => ({ key: key(), name: i.name, qty: i.quantity || '', unit: i.unit || '', comment: i.comment || '', allergen: parseAllergens(i.allergen) }))
        : [emptyIng()],
      photos: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => photos[i] || null),
      collapsed: false,
    };
  });
}

// Fusion des lignes d'ingrédients identiques (nom + unité + commentaire) de
// toutes les étapes, quantités numériques additionnées — même logique que
// `mergeIngredientsRecap` de RelectureEditor : le commentaire fait partie de
// la clé de fusion, sinon « crème liquide, chaude » et « crème liquide,
// froide » (ou « chocolat noir 66 % » / « chocolat noir 54 % » porté par le
// commentaire plutôt que le nom) fusionneraient leurs quantités en un total
// sans usage réel.
function mergeRecapLines(steps: StepState[]): { name: string; qty: string; unit: string; note: string; stepIndices: number[] }[] {
  const merged: { key: string; name: string; qty: string; unit: string; note: string; steps: Set<number> }[] = [];
  steps.forEach((st, si) =>
    st.ings.forEach((i) => {
      const name = i.name.trim();
      if (!name) return;
      const note = i.comment.trim();
      const mkey = name.toLowerCase() + '|' + i.unit.toLowerCase() + '|' + note.toLowerCase();
      const ex = merged.find((m) => m.key === mkey);
      if (!ex) {
        merged.push({ key: mkey, name, qty: i.qty.trim(), unit: i.unit, note, steps: new Set([si]) });
        return;
      }
      ex.steps.add(si);
      const a = parseFloat(String(ex.qty).replace(',', '.'));
      const b = parseFloat(String(i.qty).replace(',', '.'));
      if (!isNaN(a) && !isNaN(b)) ex.qty = String(+(a + b).toFixed(2));
      else ex.qty = [ex.qty, i.qty].filter(Boolean).join(' + ');
    }),
  );
  merged.sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.note.localeCompare(b.note, 'fr'));
  return merged.map(({ name, qty, unit, note, steps }) => ({
    name,
    qty,
    unit,
    note,
    stepIndices: Array.from(steps).sort((a, b) => a - b),
  }));
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
  highlightUnknownRefs,
  editRecipe,
  conversions,
  ingredientRefIds,
  initialStep,
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
  // Cadre rouge sur un ingrédient/ustensile hors référentiel : true pour
  // l'admin dans sa propre session ET pour une session d'impersonation (seul
  // un admin complet peut en ouvrir une — cf. app/creer/page.tsx). Séparé
  // d'`isAdmin`, qui reste réservé aux écritures (bouton « Ajouter au
  // référentiel », publication directe, création de tag).
  highlightUnknownRefs: boolean;
  editRecipe: RecipeFull | null;
  conversions: ConversionRef[];
  ingredientRefIds: IngredientRefOption[];
  // Étape (1-indexée) sur laquelle se repositionner à l'ouverture, transmise
  // depuis la fiche recette (cf. components/recipe/RecetteToc.tsx) : on
  // rouvre l'éditeur là où la recette était consultée, plutôt qu'en haut.
  initialStep?: number | null;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const editingId = editRecipe?.id ?? null;

  const [title, setTitle] = useState(editRecipe?.title || '');
  const [description, setDescription] = useState(editRecipe?.description || '');
  const [tips, setTips] = useState(editRecipe?.tips || '');
  const [source, setSource] = useState(editRecipe?.source || '');
  const [sourceUrl, setSourceUrl] = useState(editRecipe?.source_url || '');
  const [videoUrl, setVideoUrl] = useState(editRecipe?.video_url || '');
  const [servingAdvice, setServingAdvice] = useState(editRecipe?.serving_advice || '');
  const [isPublic, setIsPublic] = useState(editRecipe ? editRecipe.is_public !== false : false);
  const [hero, setHero] = useState<string | null>(editRecipe?.hero_image_url ?? null);
  const [heroOriginal, setHeroOriginal] = useState<string | null>(editRecipe?.hero_image_original_url ?? editRecipe?.hero_image_url ?? null);
  const [heroAiRetouched, setHeroAiRetouched] = useState<boolean>(editRecipe?.hero_image_ai_retouched ?? false);
  const [level, setLevel] = useState<number>(
    editRecipe?.difficulties?.level ?? difficulties.find((d) => d.id === (editRecipe as { difficulty_id?: number } | null)?.difficulty_id)?.level ?? 0,
  );
  const [selectedTags, setSelectedTags] = useState<Map<number, string>>(
    () => new Map((editRecipe?.recipe_tags || []).map((t) => [t.tags?.id, t.tags?.name] as [number, string]).filter(([id]) => id != null)),
  );
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  // Cases cochées dans la liste déroulante, pas encore insérées dans
  // `selectedTags` — permet de cocher plusieurs tags puis de les ajouter en
  // une seule fois plutôt qu'un par un.
  const [pendingTagIds, setPendingTagIds] = useState<Set<number>>(new Set());
  const tagPickerRef = useRef<HTMLDivElement>(null);
  // Tags créés à la volée par un admin depuis l'éditeur : complètent la liste
  // serveur pour l'autocomplétion et la sélection, sans recharger la page.
  const [extraTags, setExtraTags] = useState<Tag[]>([]);
  const [newTagName, setNewTagName] = useState('');

  const [measure, setMeasure] = useState<MeasureType>((editRecipe?.measure_type as MeasureType) || 'units');
  const [yieldNotes, setYieldNotes] = useState(editRecipe?.yield_notes || '');
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

  // Temps globaux saisis manuellement (prioritaires sur la somme des étapes
  // en consultation — laissés vides, la somme des étapes fait foi).
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
  // Distinct de `busy` (dédié à l'enregistrement, avec son propre libellé de
  // spinner) : cliquer sur Quitter ne passe par aucune écriture.
  const [leaving, setLeaving] = useState(false);
  // Verrou synchrone doublant `busy` : un état React n'est effectif qu'au
  // rendu suivant et ne protège donc pas de deux déclenchements dans le même
  // tick (double clic, double événement tactile).
  const busyRef = useRef(false);
  // Suivi grossier de la saisie pour le bouton « Quitter » du rail : un ref
  // suffit (pas de rendu à déclencher), et sa mise à jour n'a besoin d'être
  // précise que dans un sens — un faux positif ne coûte qu'une confirmation
  // superflue, un faux négatif perdrait une saisie en cours sans prévenir.
  // Couvre les champs contrôlés (texte, bascules, fichiers via ImageSlot) via
  // la délégation `onChange` posée sur le conteneur du formulaire ; les
  // actions déclenchées par clic seul (difficulté, ajout/suppression de
  // lignes) n'y sont pas — sauf les tags, qui appellent `markDirty()`
  // explicitement (même correctif que RelectureEditor).
  const dirtyRef = useRef(false);
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
  }, []);
  // Id de la recette créée pendant cette session d'édition. `editingId` ne
  // vient que des props serveur : après une création, il reste `null` tant que
  // le rendu déclenché par `router.replace('/creer?id=…')` n'est pas revenu.
  // Sans cette mémoire, un second enregistrement dans cet intervalle repart en
  // création et produit une deuxième recette identique.
  const createdIdRef = useRef<string | null>(null);
  // Enregistrement terminé, en attente du passage effectif en mode édition.
  const [awaitingEditMode, setAwaitingEditMode] = useState(false);
  // Index de l'étape en cours de glisser-déposer (null si aucun déplacement).
  const [dragStep, setDragStep] = useState<number | null>(null);
  // Ingrédients / ustensiles / allergènes ajoutés au référentiel pendant la
  // saisie (admin) : complètent les listes serveur pour l'autocomplétion et
  // masquent aussitôt le bouton d'ajout, sans recharger la page.
  const [extraIngredientRefs, setExtraIngredientRefs] = useState<string[]>([]);
  const [extraUtensilRefs, setExtraUtensilRefs] = useState<string[]>([]);
  const [extraAllergens] = useState<{ id: number; name: string }[]>([]);
  // Allergène associé à un ingrédient ajouté à la volée : complète refAllergens
  // pour que la prochaine saisie du même ingrédient le pré-remplisse.
  const [extraRefAllergens, setExtraRefAllergens] = useState<Record<string, string>>({});
  const [refBusy, setRefBusy] = useState<string | null>(null);
  // Ingrédient dont la popup de choix d'allergènes est ouverte (si/ii), ou null.
  const [allergenPopup, setAllergenPopup] = useState<{ si: number; ii: number } | null>(null);

  // Bascule « création → édition » après un enregistrement en brouillon :
  // l'éditeur reste verrouillé jusqu'à ce que le rendu serveur déclenché par
  // `router.replace('/creer?id=…')` lui rende l'id dans ses props. Sans cette
  // attente, les boutons redeviendraient cliquables alors que le formulaire se
  // croit encore en création (c'est le doublon qu'on observait).
  // Filet de sécurité : si la navigation n'aboutit pas (réseau coupé), on
  // relâche quand même au bout de RELEASE_MS — `createdIdRef` garantit alors
  // qu'un nouvel enregistrement met à jour la recette au lieu d'en créer une.
  useEffect(() => {
    if (!awaitingEditMode) return;
    const release = () => {
      busyRef.current = false;
      setBusy(false);
      setAwaitingEditMode(false);
    };
    if (editingId) {
      release();
      return;
    }
    const timer = setTimeout(release, 10_000);
    return () => clearTimeout(timer);
  }, [awaitingEditMode, editingId]);

  // Listes serveur + libellés ajoutés à la volée. Dédoublonnées : après le
  // refresh déclenché par un ajout au référentiel, la liste serveur contient
  // déjà le libellé que l'état local conserve (sinon : options en double).
  const allIngredientRefs = useMemo(() => [...new Set([...ingredientRefs, ...extraIngredientRefs])], [ingredientRefs, extraIngredientRefs]);
  const allUtensilRefs = useMemo(() => [...new Set([...utensilRefs, ...extraUtensilRefs])], [utensilRefs, extraUtensilRefs]);
  const allAllergens = useMemo(() => [...allergens, ...extraAllergens], [allergens, extraAllergens]);
  const knownIngredients = useMemo(() => new Set(allIngredientRefs.map((n) => n.trim().toLowerCase())), [allIngredientRefs]);
  const knownUtensils = useMemo(() => new Set(allUtensilRefs.map((n) => n.trim().toLowerCase())), [allUtensilRefs]);
  const refAllergenMap = useMemo(() => ({ ...refAllergens, ...extraRefAllergens }), [refAllergens, extraRefAllergens]);

  // Cadre rouge (admin, y compris en impersonation) sur un nom sans
  // correspondance dans la table de référence — même définition qu'Admin →
  // Éléments inconnus, pour repérer le rattachement manquant dès la saisie
  // plutôt qu'après coup sur cet écran séparé.
  const unknownRefClass = (known: Set<string>, name: string) =>
    highlightUnknownRefs && name.trim() && !known.has(name.trim().toLowerCase()) ? ' border-2 border-error' : '';

  // Ajout à la volée d'un libellé dans une table de référence (réservé aux
  // administrateurs — bouton affiché uniquement si `isAdmin`). L'insertion passe
  // par le client navigateur : la RLS n'autorise l'écriture qu'au rôle admin.
  //
  // L'état local (`extra*`) rend le libellé disponible immédiatement ; le
  // refresh, lui, resynchronise les listes de référence rendues côté serveur —
  // sans quoi le libellé créé disparaîtrait en revenant sur l'éditeur, et
  // n'apparaîtrait pas dans le back-office des listes.
  const refreshRefs = () => router.refresh();

  async function addUtensilRef(name: string) {
    const clean = name.trim();
    if (!clean) return;
    setRefBusy(`utensils:${clean.toLowerCase()}`);
    const { error } = await createClient().from('utensils').insert({ name: clean });
    setRefBusy(null);
    if (error) return void dialog.alert('Erreur : ' + error.message);
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
    if (error) return void dialog.alert('Erreur : ' + error.message);
    setExtraIngredientRefs((p) => [...p, clean]);
    setExtraRefAllergens((p) => ({ ...p, [clean.toLowerCase()]: allergenCsv || '' }));
    refreshRefs();
  }

  // Repli du menu déroulant de tags au clic en dehors (les cases cochées mais
  // non confirmées sont perdues, comme un menu qu'on abandonne).
  useEffect(() => {
    if (!tagPickerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setTagPickerOpen(false);
        setPendingTagIds(new Set());
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [tagPickerOpen]);

  // Création d'un tag inexistant dans le référentiel depuis l'éditeur (admin
  // uniquement — bouton affiché si `isAdmin`). Le tag créé est aussitôt
  // sélectionné pour la recette en cours. Un doublon (même nom) réutilise le
  // tag existant plutôt que d'échouer sur l'unicité du slug.
  //
  // `status: 'published'` est indispensable : getTags() filtre sur
  // `status = 'published'` (et ce filtre exclut aussi les lignes NULL), donc un
  // tag inséré sans statut n'apparaîtrait jamais dans la liste de référence.
  // La création étant réservée aux admins, la publication est immédiate — même
  // règle que pour une recette soumise par un admin (cf. submit()).
  async function addTag(name: string) {
    const clean = capitalizeSentences(name.trim());
    if (!clean) return;
    const existing = allTags.find((t) => t.name.trim().toLowerCase() === clean.toLowerCase());
    if (existing) {
      setSelectedTags((prev) => new Map(prev).set(existing.id, existing.name));
      setNewTagName('');
      setTagPickerOpen(false);
      markDirty();
      return;
    }
    setRefBusy(`tags:${clean.toLowerCase()}`);
    const { data, error } = await createClient()
      .from('tags')
      .insert({ name: clean, slug: slugify(clean), status: 'published' })
      .select('id, name, slug')
      .single();
    setRefBusy(null);
    if (error || !data) return void dialog.alert('Erreur : ' + (error?.message ?? 'insertion impossible'));
    setExtraTags((p) => [...p, data]);
    setSelectedTags((prev) => new Map(prev).set(data.id, data.name));
    setNewTagName('');
    setTagPickerOpen(false);
    markDirty();
    refreshRefs();
  }

  const moldForme = useMemo(() => moldTypes.find((t) => String(t.id) === moldTypeId)?.forme || null, [moldTypes, moldTypeId]);
  // Dédoublonné par id, même raison que les référentiels ci-dessus (un tag en
  // double produirait deux entrées de même clé React dans le sélecteur).
  const allTags = useMemo(() => [...new Map([...tags, ...extraTags].map((t) => [t.id, t])).values()], [tags, extraTags]);
  const remainingTags = useMemo(() => allTags.filter((t) => !selectedTags.has(t.id)), [allTags, selectedTags]);
  const filteredRemainingTags = useMemo(() => {
    const q = normLoose(tagSearch.trim());
    return q ? remainingTags.filter((t) => normLoose(t.name).includes(q)) : remainingTags;
  }, [remainingTags, tagSearch]);

  // ── Somme des temps des étapes : purement informative en édition (affichée à
  // côté des champs manuels), recalculée en direct depuis les étapes saisies.
  // Le fallback « manuel vide → somme des étapes » est appliqué en consultation. ──
  const stepSums = useMemo(() => {
    const sum = (k: 'prep' | 'wait' | 'cook') => steps.reduce((n, s) => n + (parseInt(s[k], 10) || 0), 0);
    const p = sum('prep');
    const w = sum('wait');
    const c = sum('cook');
    return { prep: p, wait: w, cook: c, total: p + w + c };
  }, [steps]);

  // ── Updaters étapes ──
  function patchStep(i: number, p: Partial<StepState>) {
    setSteps((s) => s.map((st, k) => (k === i ? { ...st, ...p } : st)));
  }
  const patchIng = (si: number, ii: number, p: Partial<IngLine>) =>
    setSteps((s) => s.map((st, k) => (k === si ? { ...st, ings: st.ings.map((g, j) => (j === ii ? { ...g, ...p } : g)) } : st)));
  const addIng = (si: number) => setSteps((s) => s.map((st, k) => (k === si ? { ...st, ings: [...st.ings, emptyIng()] } : st)));
  const delIng = (si: number, ii: number) => setSteps((s) => s.map((st, k) => (k === si ? { ...st, ings: st.ings.filter((_, j) => j !== ii) } : st)));
  const patchPhoto = (si: number, pi: number, url: string | null) =>
    setSteps((s) =>
      s.map((st, k) =>
        k === si
          ? {
              ...st,
              photos: st.photos.map((p, j) => (j === pi ? (url ? { url, original_url: p?.original_url ?? url, ai_retouched: false } : null) : p)),
            }
          : st,
      ),
    );
  // Photo *nouvelle* (choix de fichier, dépôt, glissement) : sépare la
  // version d'origine (non recadrée) de la version affichée. Jamais appelée
  // pour un simple recadrage de la photo déjà en place (cf. ImageSlot).
  const patchPhotoOriginal = (si: number, pi: number, url: string) =>
    setSteps((s) =>
      s.map((st, k) =>
        k === si ? { ...st, photos: st.photos.map((p, j) => (j === pi && p ? { ...p, original_url: url } : p)) } : st,
      ),
    );
  const patchPhotoAi = (si: number, pi: number, aiRetouched: boolean) =>
    setSteps((s) =>
      s.map((st, k) =>
        k === si ? { ...st, photos: st.photos.map((p, j) => (j === pi && p ? { ...p, ai_retouched: aiRetouched } : p)) } : st,
      ),
    );
  const addStep = () => setSteps((s) => [...s, emptyStep()]);
  const insertStepBefore = (i: number) => setSteps((s) => [...s.slice(0, i), emptyStep(), ...s.slice(i)]);
  const delStep = async (i: number) => {
    if (steps.length <= 1) return;
    const label = steps[i]?.title.trim();
    const msg = label ? `Supprimer l'étape « ${label} » ?` : 'Supprimer cette étape ?';
    if (!(await dialog.confirm(msg))) return;
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

  // ── Sommaire de navigation ──
  // Les entrées d'étapes sont dérivées de `steps` (source de vérité unique) :
  // renommer, ajouter, supprimer ou réordonner une étape met le sommaire à jour
  // sans synchronisation manuelle.
  const tocSteps = useMemo(() => steps.map((st) => ({ key: st.key, title: st.title })), [steps]);
  // Une étape repliée n'a rien à montrer une fois atteinte : on la déplie avant
  // que le sommaire ne défile vers elle.
  const expandStep = useCallback(
    (i: number) => setSteps((s) => (s[i]?.collapsed ? s.map((st, k) => (k === i ? { ...st, collapsed: false } : st)) : s)),
    [],
  );

  // Lien « voir l'étape » du récapitulatif d'ingrédients, pour un ingrédient
  // qui n'apparaît que dans une seule étape — même motif que le `goToStep` de
  // RelectureEditor : déplie l'étape si besoin avant de défiler jusqu'à elle.
  const [scrollToStepIndex, setScrollToStepIndex] = useState<number | null>(null);
  const goToStep = useCallback(
    (i: number) => {
      expandStep(i);
      setScrollToStepIndex(i);
    },
    [expandStep],
  );
  useEffect(() => {
    if (scrollToStepIndex === null) return;
    document.getElementById(stepAnchorId(scrollToStepIndex))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setScrollToStepIndex(null);
  }, [scrollToStepIndex]);

  // Repositionnement sur l'étape d'où l'édition a été ouverte (prop
  // `initialStep`, cf. components/recipe/RecetteToc.tsx) : déplie l'étape
  // visée puis défile jusqu'à elle, une seule fois au montage — un
  // changement ultérieur de `initialStep` (il ne varie pas dans la vie du
  // composant, l'id venant de l'URL initiale) ne doit pas rejouer le saut.
  useEffect(() => {
    const index = (initialStep ?? 0) - 1;
    if (index < 0) return;
    expandStep(index);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Double frame : laisse React déplier l'étape et le navigateur refaire la
    // mise en page avant de mesurer la cible (même motif que `navigate` dans
    // lib/use-toc.ts).
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.getElementById(stepAnchorId(index));
        if (!el) return;
        window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: reduce ? 'auto' : 'smooth' });
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sous-étapes : bascule texte libre ⇄ liste éditable ──
  const [dragSub, setDragSub] = useState<{ si: number; idx: number } | null>(null);
  // « Éclater en sous-étapes » : découpe la description en lignes éditables et
  // passe la description en mode liste (le texte libre est vidé).
  const splitToSubsteps = (si: number) =>
    setSteps((s) => s.map((st, k) => (k === si ? { ...st, subSteps: splitSousEtapes(st.description), description: '' } : st)));
  // « Revenir au texte libre » : refusionne les sous-étapes en description
  // (une par ligne, précédée d'un tiret) et quitte le mode liste.
  const mergeSubsteps = (si: number) =>
    setSteps((s) =>
      s.map((st, k) => {
        if (k !== si) return st;
        const texts = (st.subSteps || []).map((t) => t.trim()).filter(Boolean);
        return { ...st, description: texts.map((t) => `- ${t}`).join('\n'), subSteps: null };
      }),
    );
  const patchSubstep = (si: number, idx: number, value: string) =>
    setSteps((s) => s.map((st, k) => (k === si ? { ...st, subSteps: (st.subSteps || []).map((t, j) => (j === idx ? value : t)) } : st)));
  // Ajoute une sous-étape (à la fin, ou juste après `idx` via la touche Entrée).
  const addSubstep = (si: number, idx?: number) =>
    setSteps((s) =>
      s.map((st, k) => {
        if (k !== si) return st;
        const list = [...(st.subSteps || [])];
        const at = idx == null ? list.length : idx + 1;
        list.splice(at, 0, '');
        return { ...st, subSteps: list };
      }),
    );
  const delSubstep = (si: number, idx: number) =>
    setSteps((s) => s.map((st, k) => (k === si ? { ...st, subSteps: (st.subSteps || []).filter((_, j) => j !== idx) } : st)));
  // Réordonne une sous-étape de `from` vers `to` au sein de la même étape.
  const moveSubstep = (si: number, from: number, to: number) =>
    setSteps((s) =>
      s.map((st, k) => {
        if (k !== si || !st.subSteps) return st;
        if (from === to || from < 0 || to < 0 || from >= st.subSteps.length || to >= st.subSteps.length) return st;
        const list = [...st.subSteps];
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        return { ...st, subSteps: list };
      }),
    );

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
    // Verrou posé avant tout `await` : deux clics dans le même tick ne peuvent
    // pas ouvrir deux enregistrements concurrents.
    if (busyRef.current) return;
    if (!title.trim()) {
      dialog.alert('Donnez un titre à votre recette.');
      return;
    }
    // Unité obligatoire dès qu'une quantité est saisie : une valeur qui ne
    // figure pas dans le référentiel (ex. reprise d'un ancien import) ne doit
    // jamais être réenregistrée telle quelle.
    const validUnitNames = new Set(units.map((u) => u.name));
    for (const st of steps) {
      for (const l of st.ings) {
        if (l.name.trim() && l.qty.trim() && !validUnitNames.has(l.unit)) {
          dialog.alert(`Choisissez une unité pour « ${l.name.trim()} ».`);
          return;
        }
      }
    }
    if (status === 'draft' && editRecipe?.status === 'published') {
      const msg = isPublic
        ? 'Cette recette est publique et visible par tous. La repasser en brouillon la retirera immédiatement de l\'accueil et des recherches. Continuer ?'
        : 'Cette recette est publiée. La repasser en brouillon la retirera de votre carnet publié. Continuer ?';
      if (!(await dialog.confirm(msg))) return;
    }
    // Publication publique par un membre non-admin : reste en file de
    // validation (cf. `finalStatus` plus bas) tant qu'un admin ne l'a pas
    // relue. Prévenir avant l'envoi plutôt qu'après évite la surprise d'une
    // recette qui semble « publiée » mais n'apparaît nulle part sur le site.
    if (status === 'pending' && isPublic && !isAdmin) {
      if (!(await dialog.confirm('Votre recette sera soumise à la validation d\'un modérateur avant d\'apparaître publiquement sur le site. Continuer ?')))
        return;
    }
    busyRef.current = true;
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
      // Soumission (« pending ») → file de validation, sauf : recette privée,
      // ou auteur administrateur → publication immédiate sans validation.
      if (status === 'pending' && (!isPublic || isAdmin)) finalStatus = 'published';

      const payload = {
        title: capitalizeSentences(title.trim()),
        description: capitalizeSentences(description.trim()) || null,
        is_public: isPublic,
        status: finalStatus,
        difficulty_id: diffRow?.id ?? null,
        measure_type: measure,
        yield_qty: yQty,
        yield_unit: yUnit,
        yield_desc: yDesc,
        mold_type_id: moldTypeIdNum,
        mold_dims: moldDims,
        yield_notes: yieldNotes.trim() || null,
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
        hero_image_original_url: heroOriginal,
        hero_image_ai_retouched: heroAiRetouched,
      };

      // Recette à mettre à jour : celle ouverte en édition, ou celle créée
      // quelques instants plus tôt dans cette même session d'édition (l'id
      // n'est pas encore redescendu dans les props). Tout enregistrement qui
      // suit une création est donc une mise à jour, jamais une seconde
      // création — y compris après une erreur en cours d'enregistrement.
      let recipeId = editingId ?? createdIdRef.current;
      if (recipeId) {
        const { error } = await supabase.from('recipes').update(payload).eq('id', recipeId);
        if (error) throw error;
        await supabase.from('recipe_tags').delete().eq('recipe_id', recipeId);
        await supabase.from('recipe_utensils').delete().eq('recipe_id', recipeId);
        await supabase.from('ingredient_groups').delete().eq('recipe_id', recipeId);
        await supabase.from('recipe_steps').delete().eq('recipe_id', recipeId);
      } else {
        const { data, error } = await supabase.from('recipes').insert({ ...payload, author_id: user.id }).select('id').single();
        if (error || !data) throw error || new Error('Création refusée');
        recipeId = data.id;
        createdIdRef.current = data.id;
      }

      // En modification, les liaisons ci-dessus ont été supprimées avant
      // réinsertion : toute erreur d'insertion est remontée pour éviter une
      // perte silencieuse (tags/ustensiles/étapes/photos/ingrédients vidés).
      if (selectedTags.size > 0) {
        const { error } = await supabase.from('recipe_tags').insert([...selectedTags.keys()].map((tag_id) => ({ recipe_id: recipeId, tag_id })));
        if (error) throw error;
      }

      const utRows = utensils
        .map((u, i) => ({ recipe_id: recipeId, name: capitalizeSentences(u.name.trim()), comment: u.comment.trim() || null, order_index: i }))
        .filter((u) => u.name);
      if (utRows.length) {
        const { error } = await supabase.from('recipe_utensils').insert(utRows);
        if (error) throw error;
      }

      for (let gi = 0; gi < steps.length; gi++) {
        const st = steps[gi];
        const desc = st.description.trim();
        // Mode liste actif → sous-étapes non vides conservées ; sinon `null`.
        const subs = st.subSteps ? st.subSteps.map((t) => capitalizeSentences(t.trim())).filter(Boolean) : [];
        const lines = st.ings
          .map((l, i) => ({
            name: capitalizeSentences(l.name.trim()),
            quantity: l.qty.trim() || null,
            unit: l.unit || null,
            comment: l.comment.trim() || null,
            allergen: l.allergen.length ? l.allergen.join(', ') : null,
            order_index: i,
            ref_id: resolveIngredientRefId(l.name, ingredientRefIds),
          }))
          .filter((l) => l.name);
        const photoRows = st.photos.filter((p): p is StepPhoto => !!p);
        const hasContent = st.title.trim() || desc || subs.length || lines.length || photoRows.length;
        if (!hasContent) continue;

        const { data: stepRow, error: stepErr } = await supabase
          .from('recipe_steps')
          .insert({
            recipe_id: recipeId,
            step_number: gi + 1,
            title: capitalizeSentences(st.title.trim()) || `Étape ${gi + 1}`,
            description: capitalizeSentences(desc) || null,
            prep_time: gmin(st.prep),
            cook_time: gmin(st.cook),
            cook_temp: gmin(st.temp),
            wait_time: gmin(st.wait),
            day_offset: Math.max(0, parseInt(st.dayOffset, 10) || 0),
            tips: st.tips.trim() || null,
            video_url: st.videoUrl.trim() || null,
            sous_etapes: subs.length ? subs : null,
            order_index: gi,
          })
          .select('id')
          .single();
        if (stepErr || !stepRow) throw stepErr || new Error('Étape non enregistrée');

        if (photoRows.length) {
          const { error } = await supabase
            .from('step_photos')
            .insert(photoRows.map((p, pi) => ({ step_id: stepRow.id, url: p.url, original_url: p.original_url, order_index: pi, ai_retouched: p.ai_retouched })));
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

      // Contrôle IA à la validation (§3 et §5 de la spec) : déclenché à la
      // soumission pour publication publique, et rejoué si le contenu d'une
      // recette déjà publique change. Ne bloque jamais la soumission — la
      // route écrit son propre statut d'échec si l'appel IA rate (§10).
      if (finalStatus === 'pending' || editRecipe?.status === 'published') {
        fetch('/api/moderation-recette', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ recipeId }),
        }).catch(() => {});
      }

      // Maintenance de l'index de similarité (§6.3) : publication (nouveau
      // contenu à indexer) ou dépublication/modification d'une recette
      // jusque-là publique (entrée à retirer ou rafraîchir) — la route
      // détermine laquelle des deux depuis le statut réel en base.
      if (finalStatus === 'published' || editRecipe?.status === 'published') {
        fetch('/api/reindex-recette', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ recipeId }),
        }).catch(() => {});
      }

      if (status !== 'draft') {
        if (finalStatus === 'pending') {
          // Recette publique soumise par un membre non-admin (§ ligne 653 :
          // seul ce cas reste en `pending`) : sans messagerie interne pour le
          // signaler autrement, prévenir ici que la validation d'un admin est
          // nécessaire avant que la recette ne devienne visible.
          await dialog.alert(
            "Votre recette a bien été soumise. Elle sera visible publiquement dès qu'un administrateur l'aura validée.",
          );
        }
        // Publication / enregistrement définitif : on ouvre la fiche recette.
        // router.refresh() APRÈS le push (et non avant, cf. PlanWidget.tsx) :
        // appelé avant, il ne rafraîchit que la route qu'on quitte (/creer) —
        // la fiche recette, déjà visitée dans la session, resservirait alors
        // une entrée du cache client antérieure à cette écriture.
        router.push(`/recette/${recipeId}`);
        router.refresh();
      } else if (stay) {
        // « Enregistrer en brouillon » : on reste sur l'éditeur. Pour une
        // nouvelle recette, on bascule en mode édition (id dans l'URL) afin que
        // les enregistrements suivants mettent à jour au lieu de dupliquer ;
        // le verrou n'est levé qu'au retour de ce rendu serveur (cf. l'effet
        // `awaitingEditMode`), sans quoi un clic dans l'intervalle repartirait
        // sur un formulaire qui se croit encore en création.
        if (editingId) {
          busyRef.current = false;
          setBusy(false);
          router.refresh();
        } else {
          setAwaitingEditMode(true);
          router.replace(`/creer?id=${recipeId}`);
        }
      } else {
        // « Enregistrer en brouillon et quitter » : retour au carnet.
        // router.refresh() APRÈS le push (cf. commentaire ci-dessus) : sinon
        // le carnet, déjà visité dans la session, resservirait ses compteurs
        // de statut d'avant ce changement (ex. publiée → brouillon).
        router.push('/carnet');
        router.refresh();
      }
    } catch (e) {
      // La recette a pu être créée avant l'échec (étapes, photos, ingrédients
      // sont écrits ensuite) : `createdIdRef` fait qu'une nouvelle tentative la
      // met à jour au lieu d'en créer une seconde.
      dialog.alert('Erreur : ' + ((e as Error).message || "Impossible d'enregistrer la recette."));
      busyRef.current = false;
      setBusy(false);
    }
  }

  // Bouton « Quitter » du rail : quitte directement si rien n'a été modifié ;
  // sinon propose une popup à trois issues (annuler / quitter sans enregistrer
  // / enregistrer et quitter) — même motif que RelectureEditor.handleLeave.
  // Retour à la fiche recette pour une édition (ou une création déjà
  // enregistrée en brouillon dans cette session) ; à défaut de recette
  // existante, retour au profil — contrairement au lien « Annuler »
  // ci-dessous, qui revient toujours au profil. Fonction non mémoïsée (comme
  // `submit`) : un `useCallback` à dépendances fixes figerait `submit` (donc
  // tout l'état du formulaire) sur sa valeur du tout premier rendu — même
  // piège que `handleSaveAndLeave` dans RelectureEditor.
  async function handleLeave() {
    if (!dirtyRef.current) {
      setLeaving(true);
      const recipeId = editingId ?? createdIdRef.current;
      router.push(recipeId ? `/recette/${recipeId}` : '/carnet');
      return;
    }
    const choix = await dialog.choice("Des modifications n'ont pas été enregistrées. Que souhaitez-vous faire ?", [
      { label: 'Quitter sans enregistrer', value: 'discard' },
      { label: 'Enregistrer et quitter', value: 'save', variant: 'primary' },
    ]);
    if (choix === 'discard') {
      setLeaving(true);
      const recipeId = editingId ?? createdIdRef.current;
      router.push(recipeId ? `/recette/${recipeId}` : '/carnet');
    } else if (choix === 'save') {
      await submit('draft', false);
    }
    // choix === null (Annuler / Échap) : on reste sur l'écran, rien à faire.
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

  // Même étiquette que la fiche recette (app/recette/[id]/page.tsx) : donne
  // au bloc « Motif du refus » ci-dessous le même repère visuel qu'ailleurs
  // sur le site, y compris en brouillon (statut inchangé par un enregistrement
  // en brouillon qui suit un refus).
  let statusBadge: { label: string; cls: string } | null = null;
  if (editRecipe?.status === 'pending') statusBadge = { label: 'En attente de validation', cls: 'bg-secondary text-white' };
  else if (editRecipe?.status === 'draft') statusBadge = { label: 'Brouillon', cls: 'bg-secondary text-white' };
  else if (editRecipe?.status === 'rejected') statusBadge = { label: 'Publication refusée', cls: 'bg-error text-white' };
  else if (editRecipe?.status === 'published') statusBadge = { label: 'Publiée', cls: 'bg-green-700 text-white' };

  return (
    <>
      {/* `mobile="drawer"` : sous 700 px le rail disparaît, et le bouton
          flottant reprend le sommaire *et* ces actions — c'est ce qui a
          remplacé la barre d'actions fixe de bas d'écran, qui n'offrait aucune
          navigation entre sections et mangeait trois rangées de boutons sur un
          téléphone. `mobileInset` reste à sa valeur par défaut : /creer ne
          monte pas la barre de navigation basse. */}
      <RecipeToc
        sections={CREER_SECTIONS}
        steps={tocSteps}
        onNavigateToStep={expandStep}
        mobile="drawer"
        actions={[
          { id: 'leave', icon: 'close', label: 'Quitter', variant: 'outline', onClick: handleLeave, disabled: busy || leaving },
          {
            id: 'save',
            icon: 'save',
            label: 'Enregistrer en brouillon',
            variant: 'outline-strong',
            onClick: () => submit('draft', true),
            disabled: busy || leaving,
          },
          {
            id: 'publish',
            icon: 'send',
            label: isPublic ? 'Publier la recette' : 'Enregistrer',
            variant: 'filled',
            onClick: () => submit('pending'),
            disabled: busy || leaving,
          },
        ]}
      />

      <div className="mb-12 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display-lg text-headline-lg-mobile md:text-display-lg text-primary mb-2">
            {editingId ? 'Modifier la recette' : 'Créer une nouvelle recette'}
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant">L&apos;excellence de la pâtisserie, rédigée par vos soins.</p>
        </div>
        <Link href="/carnet" className="flex items-center gap-2 text-on-surface-variant hover:text-primary font-label-md text-label-md">
          <span className="material-symbols-outlined">close</span> Annuler
        </Link>
      </div>

      {statusBadge && (
        <div className="no-print flex items-center gap-4 flex-wrap mb-4">
          <span className={`${statusBadge.cls} px-3 py-1 font-label-md text-[10px] uppercase tracking-widest`}>{statusBadge.label}</span>
        </div>
      )}

      {editRecipe?.moderation_note && (
        // Même bloc que sur la fiche recette (app/recette/[id]/page.tsx),
        // placé sous l'étiquette de statut ci-dessus : reste affiché tant que
        // la recette n'a pas été resoumise (refusée ou repassée en brouillon
        // depuis un refus) — la resoumission vide `moderation_note` (trigger
        // SQL `recipes_track_rejection_note`).
        <div className="no-print mb-8 border border-error/40 bg-error-container/40 text-on-error-container rounded-xl px-5 py-3 flex items-start gap-3">
          <span className="material-symbols-outlined text-[20px] shrink-0">info</span>
          <p className="font-body-md text-[13px]">
            <span className="font-semibold">
              Motif du refus{editRecipe.moderation_note_at ? ` du ${formatDate(editRecipe.moderation_note_at)}` : ''} :
            </span>{' '}
            {editRecipe.moderation_note}
          </p>
        </div>
      )}

      <div className="space-y-16" onChange={markDirty}>
        {/* Infos de base & média */}
        <section id="sec-description" className="scroll-mt-28 grid grid-cols-1 lg:grid-cols-12 gap-12">
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
              <div className="flex rounded-full border border-outline-variant overflow-hidden">
                <button
                  type="button"
                  onClick={() => {
                    setIsPublic(false);
                    markDirty();
                  }}
                  className={`px-4 py-1.5 font-label-md text-label-md transition-colors ${!isPublic ? 'bg-primary-container text-white' : 'text-on-surface-variant hover:text-primary'}`}
                >
                  Privée
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPublic(true);
                    markDirty();
                  }}
                  className={`px-4 py-1.5 font-label-md text-label-md transition-colors ${isPublic ? 'bg-primary-container text-white' : 'text-on-surface-variant hover:text-primary'}`}
                >
                  Publique
                </button>
              </div>
            </div>
            <div className="space-y-4">
              <label className="font-label-md text-label-md text-outline uppercase block">Catégories et Tags</label>
              <div className="flex flex-wrap gap-2 items-center">
                {[...selectedTags].map(([id, name]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setSelectedTags((prev) => new Map([...prev].filter(([tid]) => tid !== id)));
                      markDirty();
                    }}
                    title="Retirer ce tag"
                    className="px-4 py-1.5 rounded-full bg-primary-container text-white font-label-md text-label-md flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                  >
                    {name}
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                ))}
                <div className="relative" ref={tagPickerRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setTagPickerOpen((v) => !v);
                      setTagSearch('');
                      setPendingTagIds(new Set());
                    }}
                    className="px-4 py-1.5 rounded-full border border-outline-variant text-on-surface-variant font-label-md text-label-md hover:border-primary hover:text-primary transition-colors"
                  >
                    + Ajouter un tag
                  </button>
                  {tagPickerOpen && (
                    <div className="absolute z-20 mt-2 left-0 bg-white border border-outline-variant rounded-xl shadow-lg py-2 min-w-[220px] max-h-64 overflow-y-auto">
                      <div className="px-2 pb-2 sticky top-0 bg-white">
                        <input
                          type="text"
                          value={tagSearch}
                          onChange={(e) => setTagSearch(e.target.value)}
                          placeholder="Rechercher un tag…"
                          autoFocus
                          className="w-full px-3 py-1.5 text-sm border border-outline-variant rounded-lg focus:border-primary outline-none"
                        />
                      </div>
                      {filteredRemainingTags.length ? (
                        filteredRemainingTags.map((t) => (
                          <label
                            key={t.id}
                            className="flex items-center gap-2 w-full text-left px-4 py-2 font-label-md text-label-md text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={pendingTagIds.has(t.id)}
                              onChange={(e) => {
                                setPendingTagIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(t.id);
                                  else next.delete(t.id);
                                  return next;
                                });
                              }}
                              className="accent-primary"
                            />
                            {t.name}
                          </label>
                        ))
                      ) : (
                        <p className="px-4 py-2 text-sm text-on-surface-variant italic">Aucun autre tag disponible</p>
                      )}
                      {pendingTagIds.size > 0 && (
                        <div className="px-2 pt-2 sticky bottom-0 bg-white border-t border-outline-variant">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTags((prev) => {
                                const next = new Map(prev);
                                for (const t of allTags) if (pendingTagIds.has(t.id)) next.set(t.id, t.name);
                                return next;
                              });
                              setTagPickerOpen(false);
                              setPendingTagIds(new Set());
                              markDirty();
                            }}
                            className="w-full px-4 py-1.5 rounded-full bg-primary-container text-white font-label-md text-label-md hover:opacity-80 transition-opacity"
                          >
                            Ajouter {pendingTagIds.size} tag{pendingTagIds.size > 1 ? 's' : ''}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* Création d'un tag hors référentiel — réservée aux admins. */}
              {isAdmin && (
                <div className="flex flex-wrap items-center gap-2">
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
                    className="editorial-input flex-1 min-w-[200px] text-body-md"
                  />
                  <button
                    type="button"
                    disabled={!newTagName.trim() || refBusy === `tags:${newTagName.trim().toLowerCase()}`}
                    onClick={() => addTag(newTagName)}
                    title="Créer ce tag dans le référentiel et l'ajouter à la recette"
                    className="px-4 py-1.5 rounded-full border border-primary text-primary font-label-md text-label-md hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    Créer le tag
                  </button>
                </div>
              )}
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
          <div className="lg:col-span-12 space-y-1.5">
            <div className="relative aspect-[16/9] border border-dashed border-outline-variant overflow-hidden">
              <ImageSlot
                src={hero}
                originalSrc={heroOriginal}
                aiRetouched={heroAiRetouched}
                onChange={(url) => {
                  setHero(url);
                  setHeroAiRetouched(false);
                }}
                onOriginalChange={setHeroOriginal}
                onClear={() => {
                  setHero(null);
                  setHeroOriginal(null);
                  setHeroAiRetouched(false);
                }}
                shape="rect"
                maxWidth={1200}
                aspectRatio={16 / 9}
                placeholder="Photo principale de la recette (format paysage 16:9) — taille idéale : 1200 × 675 px"
                className="w-full h-full"
              />
            </div>
            {hero && (
              <label className="flex items-start gap-1.5 text-[11px] leading-tight text-on-surface-variant cursor-pointer">
                <input
                  type="checkbox"
                  checked={heroAiRetouched}
                  onChange={(e) => setHeroAiRetouched(e.target.checked)}
                  className="w-3.5 h-3.5 mt-0.5 rounded border-outline accent-primary cursor-pointer shrink-0"
                />
                Indication photo retravaillée avec l&apos;IA
              </label>
            )}
          </div>
        </section>

        {/* Métadonnées : quantité produite */}
        <section id="sec-taille" className="scroll-mt-28 bg-surface-container-low p-gutter md:p-12 border border-outline-variant ambient-shadow">
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
                    <option value="pers">Pers.</option>
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

            <div className="mt-6">
              <label className="font-label-md text-label-md text-outline uppercase mb-2 block">
                Complément d&apos;informations sur les quantités
              </label>
              <textarea
                value={yieldNotes}
                onChange={(e) => setYieldNotes(e.target.value)}
                className="editorial-input w-full font-body-md text-on-surface italic"
                placeholder="Précisions utiles à un ajustement des quantités par IA (ex : le moule est rempli aux 3/4, prévoir une marge de fonçage…)"
                rows={3}
              />
            </div>
          </div>
        </section>

        {/* Ustensiles */}
        <section id="sec-ustensiles" className="scroll-mt-28 space-y-8">
          <h2 className="font-headline-lg text-headline-lg text-primary border-b border-primary pb-4">Ustensiles nécessaires</h2>
          <ul className="space-y-4">
            {utensils.map((u, i) => (
              <li key={u.key} className="flex items-start gap-4 group">
                <span className="material-symbols-outlined text-outline-variant select-none mt-2">drag_indicator</span>
                <div className="flex-grow">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 items-start">
                    <input
                      list="dl-utensils"
                      value={u.name}
                      onChange={(e) => setUtensils((p) => p.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))}
                      className={`editorial-input text-on-surface w-full${unknownRefClass(knownUtensils, u.name)}`}
                      placeholder="Nom de l'ustensile"
                      autoComplete="off"
                    />
                    <textarea
                      value={u.comment}
                      onChange={(e) => setUtensils((p) => p.map((x, k) => (k === i ? { ...x, comment: e.target.value } : x)))}
                      className="editorial-input text-on-surface w-full resize-y"
                      rows={1}
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
        <section id="sec-etapes" className="scroll-mt-28 space-y-12">
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
              id={stepAnchorId(si)}
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
              className={`scroll-mt-28${dragStep === si ? ' opacity-50' : ''}`}
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
                    <label className="font-label-md text-label-md text-outline shrink-0 uppercase">Ajustement des quantités de cette étape</label>
                    <select
                      value={st.scaling}
                      onChange={(e) => patchStep(si, { scaling: e.target.value })}
                      className="editorial-input text-on-surface cursor-pointer shrink-0"
                      style={{ width: 'auto' }}
                    >
                      {scalingOptions.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* gap-6/w-44 (au lieu de gap-8/w-48) : à 1024px (`lg`), la
                      largeur reste réduite de 58px pour le rail (`.creer-page`)
                      — sous cette marge, gap-8/w-48 dépassait de peu et
                      renvoyait le 4ᵉ champ à la ligne. Vérifié à tenir sur une
                      ligne de 1024px jusqu'au repli naturel sous 768px. */}
                  <div className="flex flex-wrap gap-6">
                    {(
                      [
                        ['TEMPS DE PRÉP', st.prep, (v: string) => patchStep(si, { prep: v }), 'min'],
                        ["TEMPS D'ATTENTE", st.wait, (v: string) => patchStep(si, { wait: v }), 'min'],
                        ['TEMPS DE CUISSON', st.cook, (v: string) => patchStep(si, { cook: v }), 'min'],
                        ['T°C DE CUISSON', st.temp, (v: string) => patchStep(si, { temp: v }), '°C'],
                      ] as const
                    ).map(([label, val, set, unit]) => (
                      <div key={label} className="flex flex-col w-44">
                        <label className="font-label-md text-label-md text-outline text-left">{label}</label>
                        {/* Champ centré dans la colonne : deux espaceurs égaux
                            l'encadrent, l'unité vit dans celui de droite. */}
                        <div className="flex items-baseline gap-2">
                          <span className="flex-1" />
                          <input
                            value={val}
                            onChange={(e) => set(e.target.value)}
                            className="editorial-input text-on-surface text-center shrink-0"
                            style={{ width: '5rem' }}
                            type="number"
                            min={0}
                          />
                          <span className="flex-1 text-sm text-on-surface-variant">{unit}</span>
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
                    {/* En-tête « INGRÉDIENTS » (+ miroirs quantité/unité,
                        toujours utiles : alignent la colonne « unité », dont
                        la largeur auto dépend des options). En dessous de
                        `xl`, le groupe « ALLERGÈNES »/commentaire/suppression
                        (`hidden xl:contents`) ne s'affiche pas du tout — sans
                        lui l'en-tête tiendrait sur une ligne comme
                        aujourd'hui, mais réserverait quand même la hauteur
                        d'une 2e ligne vide (le texte masqué occupe toujours
                        sa boîte). `xl:contents` le neutralise en tant
                        qu'élément (ses enfants redeviennent des items directs
                        du flex à partir de `xl`, alignement desktop
                        inchangé). Le libellé « ALLERGÈNES » lui-même n'a plus
                        de raison d'être ici en dessous de `xl` : seule la 1re
                        ligne d'ingrédient est juste en dessous, les suivantes
                        en sont trop loin — un intitulé plus petit est répété
                        au-dessus du bloc allergènes de chaque ligne à la
                        place (cf. plus bas). */}
                    <div className="border-l-2 border-transparent pl-4 xl:border-l-0 xl:pl-0 flex items-center gap-4 mb-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-label-md text-label-md text-outline">INGRÉDIENTS</span>
                      </div>
                      <div className="w-20 shrink-0" />
                      <div className="grid shrink-0">
                        <select
                          aria-hidden
                          className="editorial-input invisible col-start-1 row-start-1"
                          style={{ width: 'auto' }}
                          tabIndex={-1}
                        >
                          <option value=""></option>
                          {units.map((u) => (
                            <option key={u.id} value={u.name}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        <span className="col-start-1 row-start-1 self-center text-center px-3 pointer-events-none font-label-md text-label-md text-outline uppercase">
                          Unité
                        </span>
                      </div>
                      <div className="hidden xl:contents">
                        <div className="flex-1 min-w-0">
                          <span className="font-label-md text-label-md text-outline">ALLERGÈNES</span>
                        </div>
                        <div className="flex-1 min-w-0" />
                        <button aria-hidden type="button" tabIndex={-1} className="p-1 invisible shrink-0">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                    <div className="space-y-6">
                      {st.ings.map((g, ii) => (
                        // Liseré + resserrement de l'écart interne (repris de
                        // l'encart ExecutionView) : sous `xl`, les 2 lignes
                        // d'un même ingrédient (repli flex-wrap) doivent se
                        // distinguer du bloc suivant. `space-y-6` (au lieu de
                        // l'ancien `space-y-4`, identique au `gap-4` interne)
                        // creuse l'écart entre ingrédients ; `gap-y-1.5`
                        // resserre celui entre les 2 lignes d'un même
                        // ingrédient — sans toucher au `gap-x-4` horizontal
                        // entre les champs d'une même ligne.
                        <div key={g.key} className="border-l-2 border-outline-variant/50 pl-4 xl:border-l-0 xl:pl-0">
                        <div className="flex flex-wrap xl:flex-nowrap items-center gap-x-4 gap-y-1.5">
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
                                  patchIng(si, ii, { name, allergen: parseAllergens(refAllergenMap[refKey]) });
                                } else {
                                  patchIng(si, ii, { name });
                                }
                              }}
                              className={`editorial-input text-on-surface w-full${unknownRefClass(knownIngredients, g.name)}`}
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
                            <option value=""></option>
                            {units.map((u) => (
                              <option key={u.id} value={u.name}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                          <div className="basis-full xl:hidden" />
                          <div className="flex-1 min-w-0">
                            <span className="xl:hidden block font-label-md text-[10px] uppercase tracking-widest text-outline mb-1">
                              Allergènes
                            </span>
                            <div className="flex flex-wrap items-center gap-1">
                              {g.allergen.map((a) => (
                                <span
                                  key={a}
                                  className="inline-flex items-center gap-0.5 bg-secondary-fixed text-on-secondary-fixed rounded-full pl-2 pr-0.5 py-0.5 text-[12px]"
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
                                  className="editorial-input text-on-surface cursor-pointer italic"
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
                          </div>
                          <div className="flex-1 min-w-0">
                            {/* Miroir invisible du libellé « Allergènes » de la
                                colonne voisine : sans lui, le champ commentaire
                                (sans libellé au-dessus) remonte plus haut que
                                le select/les puces d'allergènes en dessous de
                                `xl`, malgré `items-center`. */}
                            <span aria-hidden className="xl:hidden block invisible font-label-md text-[10px] uppercase tracking-widest mb-1">
                              Allergènes
                            </span>
                            <textarea
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
                              className="editorial-input text-on-surface w-full resize-y"
                              rows={1}
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
                              g.allergen[0]
                                ? `Ajouter cet ingrédient (allergène : ${g.allergen[0]}) à la base de référence`
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
                    <label className="font-label-md text-label-md text-outline mb-2">
                      DESCRIPTION{' '}
                      <span className="italic normal-case font-body-md text-on-surface-variant">
                        (Afin de faciliter le découpage en sous-étape, commencer vos lignes par -)
                      </span>
                    </label>
                    {st.subSteps === null ? (
                      // Mode texte libre : description + bouton d'éclatement.
                      <>
                        <textarea
                          value={st.description}
                          onChange={(e) => patchStep(si, { description: e.target.value })}
                          className="w-full bg-surface-container-low border border-outline-variant p-4 font-body-md text-body-md focus:border-primary outline-none transition-colors"
                          placeholder="Décrivez les gestes techniques avec précision..."
                          rows={8}
                        />
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => splitToSubsteps(si)}
                            className="flex items-center gap-2 text-secondary font-label-md text-label-md hover:underline"
                          >
                            <span className="material-symbols-outlined">format_list_bulleted</span> Éclater en sous-étapes{' '}
                            <span className="italic normal-case font-body-md text-on-surface-variant">
                              (Permet de suivre plus précisément le déroulé de la recette lors de l&apos;exécution)
                            </span>
                          </button>
                        </div>
                      </>
                    ) : (
                      // Mode liste : sous-étapes éditables, réordonnables, avec
                      // ajout à la volée et retour possible au texte libre.
                      <div className="space-y-3">
                        {st.subSteps.map((t, idx) => (
                          <div
                            key={idx}
                            className={`flex items-start gap-2 ${dragSub?.si === si && dragSub.idx === idx ? 'opacity-50' : ''}`}
                            onDragOver={(e) => {
                              if (!dragSub || dragSub.si !== si) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(e) => {
                              if (!dragSub || dragSub.si !== si) return;
                              e.preventDefault();
                              moveSubstep(si, dragSub.idx, idx);
                              setDragSub(null);
                            }}
                          >
                            <span
                              className="material-symbols-outlined text-outline-variant select-none cursor-grab active:cursor-grabbing p-1 -m-1 mt-2 shrink-0"
                              title="Glisser pour déplacer"
                              draggable
                              onDragStart={(e) => {
                                setDragSub({ si, idx });
                                e.dataTransfer.effectAllowed = 'move';
                              }}
                              onDragEnd={() => setDragSub(null)}
                            >
                              drag_indicator
                            </span>
                            <textarea
                              value={t}
                              onChange={(e) => patchSubstep(si, idx, e.target.value)}
                              onKeyDown={(e) => {
                                // Entrée → nouvelle sous-étape juste après, focus dessus.
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  addSubstep(si, idx);
                                  setTimeout(() => {
                                    const areas = document.querySelectorAll<HTMLTextAreaElement>(`[data-substep-step="${si}"]`);
                                    areas[idx + 1]?.focus();
                                  }, 0);
                                }
                              }}
                              data-substep-step={si}
                              className="flex-1 min-h-[3.5rem] bg-surface-container-low border border-outline-variant p-3 font-body-md text-body-md focus:border-primary outline-none transition-colors"
                              placeholder="Sous-étape…"
                              rows={2}
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              title="Supprimer"
                              onClick={() => delSubstep(si, idx)}
                              className="p-1 text-error hover:opacity-70 shrink-0 mt-1"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </div>
                        ))}
                        <div className="flex flex-wrap items-center gap-6">
                          <button
                            type="button"
                            onClick={() => addSubstep(si)}
                            className="flex items-center gap-2 text-secondary font-label-md text-label-md hover:underline"
                          >
                            <span className="material-symbols-outlined">add</span> Ajouter une sous-étape
                          </button>
                          <button
                            type="button"
                            onClick={() => mergeSubsteps(si)}
                            className="flex items-center gap-2 text-on-surface-variant font-label-md text-label-md hover:underline"
                          >
                            <span className="material-symbols-outlined">notes</span> Revenir au texte libre
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {st.photos.map((p, pi) => (
                      <div key={pi} className="space-y-1.5">
                        <div className="relative aspect-square border border-dashed border-outline-variant overflow-hidden">
                          <ImageSlot
                            src={p?.url ?? null}
                            originalSrc={p?.original_url}
                            aiRetouched={p?.ai_retouched}
                            onChange={(url) => patchPhoto(si, pi, url)}
                            onOriginalChange={(url) => patchPhotoOriginal(si, pi, url)}
                            onClear={() => patchPhoto(si, pi, null)}
                            shape="rect"
                            maxWidth={800}
                            aspectRatio={1}
                            placeholder={`Visuel ${pi + 1} — taille idéale : 800 × 800 px`}
                            className="w-full h-full"
                          />
                        </div>
                        {p && (
                          <label className="flex items-start gap-1.5 text-[11px] leading-tight text-on-surface-variant cursor-pointer">
                            <input
                              type="checkbox"
                              checked={p.ai_retouched}
                              onChange={(e) => patchPhotoAi(si, pi, e.target.checked)}
                              className="w-3.5 h-3.5 mt-0.5 rounded border-outline accent-primary cursor-pointer shrink-0"
                            />
                            Indication photo retravaillée avec l&apos;IA
                          </label>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <label className="font-label-md text-label-md text-outline uppercase mb-2 block">Lien vidéo (YouTube, Vimeo…)</label>
                    <input
                      value={st.videoUrl}
                      onChange={(e) => patchStep(si, { videoUrl: e.target.value })}
                      type="url"
                      className="w-full bg-surface-container-low border border-outline-variant p-4 font-body-md text-body-md focus:border-primary outline-none transition-colors"
                      placeholder="https://… (optionnel)"
                    />
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
        {/* Ancre « Conseils de la recette/dégustation » du sommaire : elle
            couvre cette section et la suivante (dégustation et conservation),
            qui se suivent immédiatement. */}
        <section id="sec-conseils" className="scroll-mt-28 space-y-8">
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
        <section id="sec-planning" className="scroll-mt-28 space-y-8">
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
        <section id="sec-difficulte" className="scroll-mt-28 space-y-8">
          <div className="flex justify-between items-end border-b border-primary pb-4">
            <h2 className="font-headline-lg text-headline-lg text-primary">Difficulté &amp; temps</h2>
            <span className="text-sm text-on-surface-variant italic">Le temps saisi manuellement prime ; vide, la somme des étapes est utilisée</span>
          </div>

          <div className="flex flex-col items-center text-center border-b border-outline-variant pb-4 max-w-[220px] mx-auto">
            <label className="font-label-md text-label-md text-outline uppercase">Difficulté</label>
            <div className="flex justify-center gap-2 mt-4">
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
            {level > 0 && (
              <span className="font-label-md text-label-md text-on-surface mt-2">
                {difficulties.find((d) => d.level === level)?.name}
              </span>
            )}
          </div>

          {/* Ligne 1 : somme des temps des étapes (lecture seule, informative) */}
          <div className="space-y-3">
            <span className="font-label-md text-label-md text-outline uppercase block text-center">Somme des temps des étapes</span>
            <div className="flex flex-wrap justify-evenly items-start gap-x-10 gap-y-8">
              {(
                [
                  ['TEMPS DE PRÉP', stepSums.prep],
                  ['ATTENTE', stepSums.wait],
                  ['CUISSON', stepSums.cook],
                  ['DURÉE TOTALE', stepSums.total],
                ] as const
              ).map(([label, val]) => (
                <div key={label} className="flex flex-col border-b border-outline-variant pb-4">
                  <label className="font-label-md text-label-md text-outline">{label}</label>
                  <div className="flex items-baseline gap-2">
                    <span className="font-headline-md text-headline-md text-on-surface-variant inline-block" style={{ width: '5.5rem' }}>
                      {val || 0}
                    </span>
                    <span className="text-sm text-on-surface-variant">min</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ligne 2 : temps saisis manuellement (éditables, prioritaires en consultation) */}
          <div className="space-y-3">
            <span className="font-label-md text-label-md text-outline uppercase block text-center">Temps saisi manuellement</span>
            <div className="flex flex-wrap justify-evenly items-start gap-x-10 gap-y-8">
              {(
                [
                  ['TEMPS DE PRÉP', prep, setPrep],
                  ['ATTENTE', wait, setWait],
                  ['CUISSON', cook, setCook],
                  ['DURÉE TOTALE', total, setTotal],
                ] as const
              ).map(([label, val, set]) => (
                <div key={label} className="flex flex-col border-b border-outline-variant pb-4">
                  <label className="font-label-md text-label-md text-outline">{label}</label>
                  <div className="flex items-baseline gap-2">
                    <input
                      value={val}
                      onChange={(e) => set(e.target.value)}
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
          </div>
        </section>

        {/* Récapitulatif des ingrédients (aperçu) */}
        <section id="sec-ingredients" className="scroll-mt-28 space-y-8">
          <div className="flex justify-between items-end border-b border-primary pb-4">
            <h2 className="font-headline-lg text-headline-lg text-primary">Récapitulatif des ingrédients</h2>
            <span className="text-sm text-on-surface-variant italic">Généré automatiquement depuis les étapes</span>
          </div>
          <div className="max-w-2xl">
            {ingredientsRecap.length === 0 ? (
              <p className="text-on-surface-variant italic text-sm">Les ingrédients saisis dans les étapes apparaîtront ici automatiquement.</p>
            ) : (
              // Nom en `minmax(0,1fr)` : une colonne `max-content` ne peut pas
              // rétrécir, un nom long débordait donc de l'écran sur mobile.
              <div className="grid grid-cols-[minmax(0,1fr)_max-content] gap-x-4 sm:gap-x-10">
                {ingredientsRecap.map((m, k) => {
                  const conv = ingredientConversionText(conversions, units, resolveIngredientRefId(m.name, ingredientRefIds), m.unit, m.qty);
                  return (
                    <div key={k} className="border-b border-outline-variant/30 py-1.5" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1' }}>
                      <span className="font-body-md text-body-md text-on-surface break-words">
                        {m.name}
                        {m.note && <span className="block text-on-surface-variant text-[12px] italic">{m.note}</span>}
                        {m.stepIndices.length === 1 ? (
                          <button
                            type="button"
                            onClick={() => goToStep(m.stepIndices[0])}
                            className="flex items-center gap-1 text-primary text-[12px] hover:underline mt-0.5"
                          >
                            <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                            1 étape — {steps[m.stepIndices[0]]?.title || `Étape ${m.stepIndices[0] + 1}`}
                          </button>
                        ) : (
                          <span className="block text-on-surface-variant text-[12px]">{m.stepIndices.length} étapes</span>
                        )}
                      </span>
                      <span className="font-label-md text-label-md text-primary whitespace-nowrap text-center">
                        {[m.qty, m.unit].filter(Boolean).join(' ')}
                        {conv && <span className="text-on-surface-variant font-body-md text-[12px]"> ({conv})</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="pt-10 border-t-2 border-primary">
          <p className="text-sm text-center text-on-surface-variant">En publiant, vous acceptez les conditions de partage de la communauté Maryse-Club.</p>
        </section>
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

      {/* Popup de choix des allergènes d'un ingrédient (max 3). Bascule chaque
          allergène de la table de référence ; les modifications sont live. */}
      {allergenPopup &&
        (() => {
          const { si, ii } = allergenPopup;
          const ing = steps[si]?.ings[ii];
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
                  {ing.name.trim() || 'Ingrédient'} — {selected.length}/{MAX_ALLERGENS} sélectionné(s)
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

      {/* Enregistrement en cours (écriture puis navigation ou bascule en mode
          édition) : overlay « Le Fouet » plein écran, cf. CLAUDE.md. */}
      <LoadingOverlay visible={busy || leaving} label={leaving ? 'Retour au profil…' : 'Enregistrement de la recette…'} />
    </>
  );
}
