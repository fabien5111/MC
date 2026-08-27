'use client';

// Écran d'une fournée (porté de recette.html mode planifié + execution.html) :
// deux modes sur la même donnée — Préparer (avant, au calme : ajuster,
// éditer) et Cuisiner (pendant : jalons à cocher, tempo). Pas d'écran de
// mise en place intercalé : c'est le mode Préparer qui sert à tout vérifier
// avant de passer aux fourneaux, Cuisiner s'ouvre directement sur le
// déroulé. La case d'une étape est unique (`batch_steps.done`) : la cocher
// dans un mode la coche instantanément dans l'autre, il n'y a plus de
// session séparée à garder synchronisée — voir CLAUDE.md « Fournées ».
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useReadOnly, useWriteGuard } from '@/components/ImpersonationProvider';
import { useDialog } from '@/components/Dialog';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { AiPhotoBadge } from '@/components/AiPhotoBadge';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';
import { StepPhotoGallery } from '@/components/recipe/StepPhotoGallery';
import { ShoppingWidget } from '@/components/recipe/ShoppingWidget';
import { BatchNotes } from '@/components/recipe/BatchNotes';
import { BatchReview } from '@/components/batch/BatchReview';
import type { MyRecipeReview } from '@/lib/reviews-data';
import { BatchIngredientsEditor } from '@/components/recipe/BatchIngredientsEditor';
import { BatchStepDonePanel } from '@/components/recipe/BatchStepDonePanel';
import { StepExpandDialog } from '@/components/recipe/StepExpandDialog';
import { RecipeToc, type TocSections, type TocAction } from '@/components/recipe/RecipeToc';
import { AllergenPictosView } from '@/components/recipe/AllergenPictosView';
import { formatTime, formatDate } from '@/lib/format';
import { UNITS_LBL, matchAllergenPictos } from '@/lib/recipe-view';
import { ingredientConversionText, shortUnitLbl, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';
import type { Unit } from '@/lib/profile';
import type { AllergenRef } from '@/lib/recipes';
import {
  fmtNum,
  BATCH_STATUS_LBL,
  batchDayLabel,
  batchFactor,
  batchIngredientExcluded,
  batchStepIsExpansion,
  batchStepIsStepReplacement,
  batchStepReplaced,
  batchSubstepExcluded,
  expansionSource,
  groupBatchStepsByDay,
  mergeAllBatchIngredients,
  mergeBatchIngredients,
  mergedRowQtyText,
  remainingStepTimes,
  stepFullyDone,
  stepReplacementSource,
  substepIngredientsBySubstep,
  type BatchFull,
  type BatchIngredientRow,
  type BatchJalon,
  type BatchStepRow,
  type BatchSubstepRow,
} from '@/lib/recipe-plan';

const MIN = 60000;
const numify = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const fmtHeure = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtJour = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
function fmtDuree(ms: number): string {
  const min = Math.max(0, Math.round(ms / MIN));
  const j = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return [j ? j + ' j' : '', h ? h + ' h' : '', m || (!j && !h) ? m + ' min' : ''].filter(Boolean).join(' ');
}
const stepDur = (s: BatchStepRow) => {
  const t = remainingStepTimes(s);
  return (t.prep_time || 0) + (t.wait_time || 0) + (t.cook_time || 0);
};
const jalonDur = (j: BatchJalon) => j.steps.reduce((n, s) => n + stepDur(s), 0);
const jalonLabel = (j: BatchJalon) => (j.offset > 0 ? `Jour J − ${j.offset}` : 'Jour J');
const jalonAnchorId = (ji: number) => `sec-jalon-${ji}`;
const LBL_CLS = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

type Photo = { url: string; ai_retouched: boolean };
type BaseRecipeInfo = {
  id: string;
  updatedAt: string | null;
  heroImageUrl: string | null;
  heroImageAiRetouched: boolean;
  stepPhotosBySourceStepId: Record<number, Photo[]>;
  authorId: string | null;
  author: { username: string | null; fullName: string | null; avatarUrl: string | null } | null;
} | null;

// Rendement à l'échelle de base de la recette (avant ajustement de la
// fournée) — reconstruit depuis les colonnes copiées sur `batches`, jamais
// depuis la recette vivante (cf. CLAUDE.md « Fournées »).
function batchYieldInfo(batch: BatchFull): { label: string; value: string } | null {
  if (batch.measure_type === 'units' && batch.yield_qty) {
    const u = UNITS_LBL[batch.yield_unit || ''] || batch.yield_unit || '';
    return { label: 'Quantité produite', value: `${batch.yield_qty} ${u}`.trim() };
  }
  if (batch.measure_type === 'mold') {
    const v = [batch.yield_desc, batch.mold_type_name || batch.yield_unit || ''].filter(Boolean).join(' — ');
    return v ? { label: 'Quantité produite', value: v } : null;
  }
  if (batch.measure_type === 'dimensions' && batch.yield_desc) {
    return { label: 'Quantité produite', value: batch.yield_desc };
  }
  return null;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function defaultMode(batch: BatchFull): 'preparer' | 'cuisiner' {
  if (batch.status !== 'planifiee') return 'cuisiner'; // fournée close : consultation de ce qui a été fait
  if (batch.date_debut) return 'cuisiner';
  if (batch.planned_date && batch.planned_date <= todayIso()) return 'cuisiner';
  return 'preparer';
}

export function BatchView({
  batch: initialBatch,
  baseRecipe,
  units,
  unitTips,
  conversions,
  ingredientDensities,
  shoppingLists,
  allergenRefs,
  lecture,
  initialMode,
  myReview,
}: {
  batch: BatchFull;
  baseRecipe: BaseRecipeInfo;
  units: Unit[];
  unitTips: Record<string, string>;
  conversions: ConversionRef[];
  // Masse volumique par nom d'ingrédient — repli de `estimateWeightGrams`
  // (StepExpandDialog) quand la ligne n'a pas de `ref_id` propre, cf.
  // lib/recipes.ts `getIngredientDensities`.
  ingredientDensities: { name: string; density_g_per_ml: number }[];
  shoppingLists: { id: number; name: string }[];
  allergenRefs: AllergenRef[];
  lecture: boolean;
  // Avis (note + commentaire) courant du membre pour la recette d'origine —
  // `null` si aucun avis n'a encore été déposé, quelle que soit la fournée.
  // cf. CLAUDE.md « Avis sur une recette ».
  myReview: MyRecipeReview | null;
  // Fournée qui vient d'être lancée (BatchWidget) : on atterrit sur Préparer,
  // jamais sur Cuisiner, même si la date de dégustation tombe aujourd'hui —
  // l'ajustement se fait au calme avant de passer aux fourneaux.
  initialMode?: 'preparer' | 'cuisiner';
}) {
  const router = useRouter();
  const dialog = useDialog();
  const writeGuard = useWriteGuard();
  const impersonationReadOnly = useReadOnly();
  const [batch, setBatch] = useState(initialBatch);
  useEffect(() => setBatch(initialBatch), [initialBatch]);
  const [mode, setMode] = useState<'preparer' | 'cuisiner'>(() => initialMode ?? defaultMode(initialBatch));
  const [busy, setBusy] = useState(false);
  // Distinct de `busy` : `router.refresh()` ne rend pas de promesse
  // attendable, donc `resumeBatch` doit garder le voile affiché jusqu'à ce
  // que la resynchronisation soit effective (cf. CLAUDE.md « busy couvre
  // aussi la resynchronisation »), sans quoi le spinner s'éteindrait avant
  // que le statut « en cours » ne soit revenu du serveur.
  const [resuming, startResume] = useTransition();

  // Force le haut de page à l'arrivée sur une fournée : `switchMode` gère
  // déjà le passage Préparer/Cuisiner en cours de session, mais l'arrivée
  // directe (lien depuis /en-cuisine, retour navigateur…) peut restaurer une
  // position de scroll d'une visite précédente de cette URL. Une seule fois
  // au montage, avant toute restauration native du navigateur.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const readOnly = batch.status !== 'planifiee' || lecture || impersonationReadOnly;
  // Avis sur la recette d'origine. Volontairement indépendant de `readOnly`
  // ET de `lecture` : une fournée terminée est toujours en lecture seule pour
  // ses étapes, et « Fournées terminées » (/en-cuisine) l'ouvre justement en
  // `?lecture=1` — s'y adosser rendait la carte invisible depuis son point
  // d'entrée principal. Donner son avis n'est pas modifier la fournée.
  // Seule l'impersonation lecture seule reste bloquante (garde réelle,
  // revérifiée côté serveur par la route avec la propriété de la fournée).
  const canReview = batch.status === 'terminee' && !batch.review_dismissed && !impersonationReadOnly;

  // Un avis sera effectivement proposable une fois la fournée marquée
  // terminée : mêmes conditions que `canReview` (sans le statut, qu'on
  // s'apprête justement à poser) plus l'unicité « un avis par recette et par
  // membre » — sinon la proposition automatique poserait une question dont la
  // réponse « oui » n'affiche rien (cf. CLAUDE.md « Avis sur une recette »).
  const reviewEligible = !!batch.recipe_id && !batch.review_dismissed && !impersonationReadOnly && (!myReview || myReview.batch_id === batch.id);

  // Écriture partagée « marquer comme terminée » : rail Préparer, rail
  // Cuisiner et proposition automatique une fois toutes les étapes cochées
  // (cf. `CuisinerView.proposeFinish`) l'appellent tous les trois, chacun
  // avec son propre message de confirmation.
  async function finishBatch(): Promise<boolean> {
    if (readOnly) return false;
    const fin = new Date().toISOString();
    setBusy(true);
    const { error } = await createClient().from('batches').update({ status: 'terminee', date_fin: fin }).eq('id', batch.id);
    setBusy(false);
    if (error) {
      dialog.alert('Erreur : ' + error.message);
      return false;
    }
    setBatch((b) => ({ ...b, status: 'terminee', date_fin: fin }));
    router.refresh();
    return true;
  }

  async function markTerminee() {
    if (!(await dialog.confirm('Terminer cette fournée ?'))) return;
    const ok = await finishBatch();
    if (ok) window.scrollTo(0, 0);
  }

  // Bandeau de vigilance (décision « recette de base modifiée depuis ») : la
  // fournée n'est jamais resynchronisée après sa création, donc une
  // correction ultérieure de la recette de base ne lui parvient pas — ce
  // bandeau le signale plutôt que de laisser la divergence silencieuse.
  // Affiché uniquement en mode Préparer : en Cuisiner, la décision est déjà
  // prise et le rappeler n'aide plus, seulement distrait.
  const baseModifiedSince = !!(baseRecipe?.updatedAt && new Date(baseRecipe.updatedAt) > new Date(batch.created_at || 0));

  async function enterCuisiner() {
    setMode('cuisiner');
    if (!batch.date_debut && batch.status === 'planifiee' && !readOnly) {
      const now = new Date().toISOString();
      const { error } = await createClient().from('batches').update({ date_debut: now }).eq('id', batch.id);
      if (!error) setBatch((b) => ({ ...b, date_debut: now }));
    }
  }

  // Bascule Préparer/Cuisiner, appelée par les deux pastilles du haut comme
  // par le bouton du rail : elle inscrit le mode dans l'URL (`history.
  // replaceState`, pas `router.replace`) pour qu'un rafraîchissement retombe
  // sur le mode affiché plutôt que sur `defaultMode()` — sans ce marquage,
  // dès qu'on est passé une fois en Cuisiner (`date_debut` posé), un F5
  // ramenait toujours à Cuisiner même après être revenu sur Préparer. Pas de
  // navigation Next (pas de resynchronisation serveur) : ce n'est qu'un
  // changement de vue locale, pas une écriture à refléter ailleurs.
  function switchMode(m: 'preparer' | 'cuisiner') {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', m);
      window.history.replaceState(null, '', url);
      window.scrollTo(0, 0);
    }
    if (m === 'cuisiner') enterCuisiner();
    else setMode('preparer');
  }

  async function deleteBatch() {
    if (!writeGuard('Suppression de la fournée')) return;
    if (!(await dialog.confirm('Supprimer définitivement cette fournée ? Cette action est irréversible.'))) return;
    setBusy(true);
    const { error } = await createClient().from('batches').delete().eq('id', batch.id);
    if (error) {
      dialog.alert('Erreur : ' + error.message);
      setBusy(false);
      return;
    }
    router.push('/en-cuisine');
  }

  // Reprendre une fournée abandonnée : repasse `status` à `planifiee` (et
  // efface `date_fin`), ce qui suffit à rouvrir toutes les écritures — la
  // fournée redevient une fournée « en cours » ordinaire, sans distinction
  // avec une qui n'aurait jamais été abandonnée. Pas de symétrique pour
  // « terminée » : seul l'abandon est présenté comme réversible (l'idée de
  // « terminée » implique un jugement délibéré, pas une interruption).
  async function resumeBatch() {
    if (!writeGuard('Reprise de la fournée')) return;
    setBusy(true);
    const { error } = await createClient().from('batches').update({ status: 'planifiee', date_fin: null }).eq('id', batch.id);
    setBusy(false);
    if (error) {
      dialog.alert('Erreur : ' + error.message);
      return;
    }
    setBatch((b) => ({ ...b, status: 'planifiee', date_fin: null }));
    startResume(() => router.refresh());
  }

  // « Ne plus afficher » la carte d'avis, pour cette fournée seulement : une
  // autre fournée terminée de la même recette continuera de la proposer (la
  // marque est sur `batches`, pas sur la recette). Masquage optimiste — la
  // carte disparaît dès l'écriture aboutie, sans attendre le rendu serveur
  // (cf. CLAUDE.md « Suppression optimiste dans une liste ») ; c'est aussi
  // pour ça que la mutation est portée ICI et non par `BatchReview`, qui se
  // démonte aussitôt et emporterait sa transition avec lui.
  async function dismissReview() {
    if (!writeGuard('Masquage de la carte d’avis')) return;
    setBusy(true);
    // `review_dismissed` absente de lib/database.types.ts tant que la
    // migration n'a pas été régénérée (npm run gen:types).
    const { error } = await (createClient() as any).from('batches').update({ review_dismissed: true }).eq('id', batch.id);
    setBusy(false);
    if (error) {
      dialog.alert('Erreur : ' + error.message);
      return;
    }
    setBatch((b) => ({ ...b, review_dismissed: true }));
    startResume(() => router.refresh());
  }

  const dateTxt = batch.planned_date
    ? new Date(batch.planned_date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const all = batch.batch_steps;
  const done = all.filter((s) => s.done).length;

  return (
    <>
      <div className="max-w-[900px] mx-auto px-margin-mobile py-6 pb-32">
        <LoadingOverlay visible={busy || resuming} label="Enregistrement…" />

        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
          <h1 className="font-headline-lg text-headline-lg-mobile text-primary">{batch.recipe_title || 'Fournée'}</h1>
          <span className="flex items-center gap-3">
            <span className={`font-label-md text-[12px] px-3 py-1 rounded-full text-white ${BATCH_STATUS_LBL[batch.status]?.cls || 'bg-secondary'}`}>
              {BATCH_STATUS_LBL[batch.status]?.label || batch.status}
            </span>
            {batch.status === 'abandonnee' && !lecture && !impersonationReadOnly && (
              <button
                type="button"
                onClick={resumeBatch}
                className="flex items-center gap-1 font-label-md text-[12px] text-primary"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                <span className="hover:underline">Reprendre cette fournée</span>
              </button>
            )}
          </span>
        </div>
        <p className="text-on-surface-variant text-sm mb-4">
          {[
            dateTxt ? `Fournée du ${dateTxt}` : '',
            mode === 'preparer' ? (batch.factor && Number(batch.factor) !== 1 ? `× ${String(batch.factor).replace('.', ',')}` : batch.adjust_label || '') : '',
          ]
            .filter(Boolean)
            .join(' — ')}
        </p>

        {mode === 'preparer' && baseModifiedSince && (
          <div className="mb-6 border border-secondary/50 bg-secondary/5 rounded-lg px-4 py-3 flex items-start gap-3">
            <span className="material-symbols-outlined text-secondary text-[20px] shrink-0">info</span>
            <p className="font-body-md text-sm text-on-surface">
              La recette de base a été modifiée depuis la création de cette fournée
              {baseRecipe?.updatedAt ? ` (le ${formatDate(baseRecipe.updatedAt)})` : ''}. Cette fournée garde son propre
              contenu, indépendant de ce changement.{' '}
              {baseRecipe && (
                <Link href={`/recette/${baseRecipe.id}`} className="underline underline-offset-2 hover:opacity-70">
                  Voir la recette de base
                </Link>
              )}
            </p>
          </div>
        )}
        {!baseRecipe && batch.recipe_id === null && (
          <div className="mb-6 border border-outline-variant bg-surface-container-low rounded-lg px-4 py-3 flex items-start gap-3">
            <span className="material-symbols-outlined text-on-surface-variant text-[20px] shrink-0">menu_book</span>
            <p className="font-body-md text-sm text-on-surface-variant">
              La recette de base n&apos;est plus accessible (supprimée ou dépubliée). Cette fournée reste complète et
              utilisable — seules ses photos ne s&apos;affichent plus.
            </p>
          </div>
        )}

        {/* Avis sur la recette d'origine : affiché au-dessus des onglets
            Préparer/Cuisiner (donc visible quel que soit l'onglet ouvert par
            défaut à l'arrivée sur une fournée terminée), pas seulement en
            mode Cuisiner. */}
        {canReview && (
          <BatchReview batchId={batch.id} recipeId={batch.recipe_id} myReview={myReview} onDismiss={dismissReview} />
        )}

        <div className="flex items-center gap-2 mb-6">
          <button
            type="button"
            onClick={() => switchMode('preparer')}
            className={`rounded-pill border px-4 py-2 font-label-md text-label-md ${mode === 'preparer' ? 'border-primary bg-primary text-white' : 'border-outline-variant text-on-surface-variant hover:text-primary'}`}
          >
            Préparer
          </button>
          <button
            type="button"
            onClick={() => switchMode('cuisiner')}
            className={`rounded-pill border px-4 py-2 font-label-md text-label-md ${mode === 'cuisiner' ? 'border-primary bg-primary text-white' : 'border-outline-variant text-on-surface-variant hover:text-primary'}`}
          >
            Cuisiner
          </button>
          {all.length > 0 && (
            <span className="ml-auto font-label-md text-[12px] text-on-surface-variant">
              {done} / {all.length} étapes
            </span>
          )}
        </div>

        {mode === 'preparer' ? (
          <PreparerView
            batch={batch}
            baseRecipe={baseRecipe}
            units={units}
            unitTips={unitTips}
            conversions={conversions}
            ingredientDensities={ingredientDensities}
            shoppingLists={shoppingLists}
            allergenRefs={allergenRefs}
            readOnly={readOnly}
            onDelete={deleteBatch}
            onSwitchMode={switchMode}
            onMarkTerminee={markTerminee}
          />
        ) : (
          <CuisinerView
            batch={batch}
            setBatch={setBatch}
            readOnly={readOnly}
            conversions={conversions}
            units={units}
            setBusy={setBusy}
            onSwitchMode={switchMode}
            onMarkTerminee={markTerminee}
            finishBatch={finishBatch}
            reviewEligible={reviewEligible}
          />
        )}
      </div>
    </>
  );
}

// ── Mode Préparer ─────────────────────────────────────────────────────────
function PreparerView({
  batch,
  baseRecipe,
  units,
  unitTips,
  conversions,
  ingredientDensities,
  shoppingLists,
  allergenRefs,
  readOnly,
  onDelete,
  onSwitchMode,
  onMarkTerminee,
}: {
  batch: BatchFull;
  baseRecipe: BaseRecipeInfo;
  units: Unit[];
  unitTips: Record<string, string>;
  conversions: ConversionRef[];
  ingredientDensities: { name: string; density_g_per_ml: number }[];
  shoppingLists: { id: number; name: string }[];
  allergenRefs: AllergenRef[];
  readOnly: boolean;
  onDelete: () => void;
  onSwitchMode: (m: 'preparer' | 'cuisiner') => void;
  onMarkTerminee: () => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  // Étape en cours de remplacement par une recette (fenêtre ouverte) — même
  // motif que `expanding` dans BatchIngredientsEditor.
  const [replacingStep, setReplacingStep] = useState<BatchStepRow | null>(null);
  const { mutate: mutateReplace, busy: busyReplace, refresh: refreshReplace } = useMutation();
  const yInfo = batchYieldInfo(batch);
  const factor = batchFactor(batch);
  const adjustedYield = ((): string | null => {
    if (batch.measure_type === 'units' && batch.yield_qty) {
      if (factor === 1) return null;
      const q = parseFloat(String(batch.yield_qty).replace(',', '.'));
      if (isNaN(q)) return null;
      const u = UNITS_LBL[batch.yield_unit || ''] || batch.yield_unit || '';
      return `${fmtNum(q * factor)} ${u}`.trim();
    }
    return batch.adjust_label || null;
  })();

  const sortedSteps = [...batch.batch_steps].sort((a, b) => a.order_index - b.order_index);
  const merged = mergeBatchIngredients(batch);
  // Liste totale : garde les ingrédients d'une étape déjà réalisée (seuls les
  // retirés/remplacés disparaissent) — contrairement à `merged`, qui exclut
  // aussi le « déjà pris en compte » pour rester une liste de courses fidèle
  // à ce qu'il reste à acheter.
  const allIngredients = mergeAllBatchIngredients(batch);
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const allergens = (() => {
    const seen = new Map<string, { key: string; name: string }>();
    batch.batch_ingredients.forEach((it) => {
      if (it.ingredient_refs?.allergens) {
        const k = norm(it.ingredient_refs.allergens.name);
        if (k) seen.set(k, { key: k, name: it.ingredient_refs.allergens.name });
      }
      if (it.allergen) {
        it.allergen.split(/[,;/]/).forEach((part) => {
          const clean = part.trim();
          const k = norm(clean);
          if (k && !seen.has(k)) seen.set(k, { key: k, name: clean });
        });
      }
    });
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  })();
  const allergenItems = matchAllergenPictos(allergens.map((a) => a.name), allergenRefs);

  const dayOptions = useMemo(() => {
    const used = batch.batch_steps.flatMap((s) => [Math.max(0, s.day_offset || 0), Math.max(0, s.base_day_offset ?? 0)]);
    const max = Math.max(0, ...used) + 2;
    return Array.from({ length: max + 1 }, (_, i) => i);
  }, [batch.batch_steps]);
  const dLabel = (offset: number) => (batch.planned_date ? batchDayLabel(offset, batch.planned_date) : `JOUR J${offset > 0 ? ' − ' + offset : ''}`);

  // Défait le remplacement d'une étape par une recette : les étapes insérées
  // (et tout ce qu'elles portent) sont retirées, puis l'étape reprend sa
  // place — elle n'a jamais été modifiée entre-temps, seulement marquée.
  // Même motif que `cancelExpansion` dans BatchIngredientsEditor (utensiles
  // conservés s'ils servent encore ailleurs, ou s'ils appartiennent à la
  // recette de base de la fournée elle-même).
  async function cancelStepReplacement(step: BatchStepRow) {
    const subRecipeId = step.replaced_by_recipe_id;
    const stepIds = batch.batch_steps.filter((s) => s.source_replaced_step_id === step.id).map((s) => s.id);
    const stillUsed =
      batch.batch_steps.some((s) => s.id !== step.id && s.replaced_by_recipe_id === subRecipeId) ||
      batch.batch_ingredients.some((it) => it.expanded_into_recipe_id === subRecipeId);
    const dropUtensils = !!subRecipeId && !stillUsed && subRecipeId !== batch.recipe_id;
    const supabase = createClient();
    await mutateReplace(
      async () => {
        if (stepIds.length || dropUtensils) {
          const results = await Promise.all([
            ...(stepIds.length
              ? [supabase.from('batch_ingredients').delete().in('batch_step_id', stepIds), supabase.from('batch_substeps').delete().in('batch_step_id', stepIds)]
              : []),
            ...(dropUtensils ? [supabase.from('batch_utensils').delete().eq('batch_id', batch.id).eq('source_recipe_id', subRecipeId)] : []),
          ]);
          const failed = results.find((r) => r.error);
          if (failed) return failed;
        }
        if (stepIds.length) {
          const del = await supabase.from('batch_steps').delete().in('id', stepIds);
          if (del.error) return del;
        }
        // `replaced_by_recipe_id` absente de lib/database.types.ts tant que la
        // migration n'a pas été régénérée (npm run gen:types).
        return (supabase as any).from('batch_steps').update({ replaced_by_recipe_id: null }).eq('id', step.id);
      },
      {
        confirm:
          `Annuler le remplacement de « ${step.title || 'cette étape'} » ?\n\n` +
          (stepIds.length ? `${stepIds.length} étape${stepIds.length > 1 ? 's' : ''} seront retirées du déroulé. ` : '') +
          "L'étape revient dans le déroulé normal.",
        errorLabel: 'Annulation impossible',
      },
    );
  }

  // Planning de préparation (aperçu jour par jour, même pattern que la fiche
  // recette — cf. `sec-planning` sur /recette/[id]). Un jalon « Dégustation »
  // est toujours ajouté au jour J pour clôturer la frise, même quand toute la
  // fournée tient en une seule journée : le bloc est alors masqué à
  // l'impression (`no-print`) puisqu'il n'apporte plus rien, mais reste à
  // l'écran par cohérence avec le reste de la fiche.
  const planningDays = (() => {
    const jalons = groupBatchStepsByDay(batch.batch_steps);
    const rows = jalons.map((j) => ({
      offset: j.offset,
      items: j.steps.map((s) => {
        const ingredientsOfStep = batch.batch_ingredients.filter((it) => it.batch_step_id === s.id);
        return {
          key: s.id,
          title: s.title || '',
          fully: stepFullyDone(s, ingredientsOfStep, s.batch_substeps),
          added: batchStepIsExpansion(s),
        };
      }),
    }));
    let jourJ = rows.find((r) => r.offset === 0);
    if (!jourJ) {
      jourJ = { offset: 0, items: [] };
      rows.push(jourJ);
    }
    jourJ.items = [...jourJ.items, { key: -1, title: 'Dégustation', fully: false, added: false }];
    return rows;
  })();

  // Sommaire de navigation (rail fixe à gauche, cf. RecipeToc) : mêmes
  // sections que la fiche recette, plus « Liste de courses » (positionnée
  // désormais sous les ingrédients, cf. plus bas) — une section absente de
  // la fournée n'a rien à faire dans la liste, sous peine de lien mort.
  const tocSections: TocSections = {
    before: [
      { id: 'sec-technique', label: 'Bloc technique', icon: 'straighten', level: 1 },
      ...(sortedSteps.length > 0 ? [{ id: 'sec-planning', label: 'Planning de préparation', icon: 'calendar_month', level: 1 as const }] : []),
      ...(batch.recipe_description ? [{ id: 'sec-description', label: 'Description', icon: 'edit_note', level: 1 as const }] : []),
      ...(batch.recipe_tips ? [{ id: 'sec-conseils', label: 'Conseils de la recette', icon: 'lightbulb', level: 1 as const }] : []),
      ...(batch.recipe_serving_advice ? [{ id: 'sec-degustation', label: 'Dégustation et conservation', icon: 'restaurant', level: 1 as const }] : []),
      ...(batch.batch_utensils.length > 0 ? [{ id: 'sec-ustensiles', label: 'Ustensiles', icon: 'blender', level: 1 as const }] : []),
      ...(batch.batch_ingredients.length > 0 ? [{ id: 'sec-ingredients-complets', label: 'Liste totale des ingrédients', icon: 'checklist', level: 1 as const }] : []),
      ...(batch.batch_ingredients.length > 0 ? [{ id: 'sec-courses', label: 'Liste de courses', icon: 'shopping_cart', level: 1 as const }] : []),
      ...(batch.batch_ingredients.length > 0 ? [{ id: 'sec-ingredients', label: 'Ingrédients ajustés', icon: 'egg_alt', level: 1 as const }] : []),
      ...(sortedSteps.length > 0 ? [{ id: 'sec-etapes', label: 'Étapes', icon: 'format_list_numbered', level: 1 as const }] : []),
    ],
    after: [],
  };
  const tocSteps = sortedSteps.map((s, i) => ({ key: String(s.id), title: s.title || `Étape ${i + 1}` }));
  const actions: TocAction[] = [
    { id: 'switch-cuisiner', icon: 'skillet', label: 'Passer en mode Cuisiner', variant: 'outline-strong', onClick: () => onSwitchMode('cuisiner') },
    ...(readOnly
      ? []
      : [
          { id: 'terminer', icon: 'flag', label: 'Marquer comme terminé', variant: 'filled' as const, onClick: onMarkTerminee },
          { id: 'delete', icon: 'delete', label: 'Supprimer la fournée', variant: 'outline-danger' as const, onClick: onDelete },
        ]),
  ];

  return (
    <div className="flex flex-col gap-8">
      <LoadingOverlay visible={busyReplace} label="Modification en cours…" />
      {replacingStep && (
        <StepExpandDialog
          batch={batch}
          step={replacingStep}
          conversions={conversions}
          units={units}
          ingredientDensities={ingredientDensities}
          onClose={() => setReplacingStep(null)}
          onDone={refreshReplace}
        />
      )}
      <RecipeToc sections={tocSections} steps={tocSteps} actions={actions} mobile="drawer" mobileInset="none" />

      <p className="font-body-md text-[12px] text-on-surface-variant">
        Sur cette fiche : <span className="text-green-700">en vert</span> ce que vous avez ajouté (dont les étapes venues
        d&apos;un ingrédient que vous fabriquez vous-même), <span className="text-error line-through">barré en rouge</span> ce
        que vous avez retiré ou remplacé par une recette, <span className="text-on-surface-variant line-through">barré en gris</span>{' '}
        ce que vous avez déjà réalisé, et « recette : … » rappelle la valeur d&apos;origine.
      </p>

      <BatchNotes batchId={batch.id} notes={batch.user_note} />

      {/* Bloc technique */}
      <div id="sec-technique" className="scroll-mt-28 bg-surface-container-low p-6 rounded-xl space-y-6">
        <div className="flex flex-wrap justify-evenly items-start gap-y-6 gap-x-4">
          {yInfo && (
            <div className="flex flex-col gap-1 items-center text-center">
              <span className={LBL_CLS}>{yInfo.label}</span>
              <span className="font-headline-md text-headline-md text-primary">{adjustedYield || yInfo.value}</span>
              {adjustedYield && <span className="font-body-md text-[12px] text-on-surface-variant">Recette de base : {yInfo.value}</span>}
            </div>
          )}
          {batch.difficulty_name && (
            <div className="flex flex-col gap-1 items-center text-center">
              <span className={LBL_CLS}>Difficulté</span>
              <span className="font-label-md text-label-md text-on-surface">{batch.difficulty_name}</span>
            </div>
          )}
        </div>
        {batch.yield_notes && (
          <div>
            <button
              type="button"
              onClick={() => setNotesOpen((v) => !v)}
              aria-expanded={notesOpen}
              className="flex items-center gap-1.5 font-label-md text-[12px] text-on-surface-variant hover:text-primary"
            >
              <span className="material-symbols-outlined text-[16px]">{notesOpen ? 'expand_less' : 'expand_more'}</span>
              Complément d&apos;informations sur les quantités (recette de base)
            </button>
            {notesOpen && (
              <p className="mt-2 font-body-md text-sm italic text-on-surface-variant whitespace-pre-line">{batch.yield_notes}</p>
            )}
          </div>
        )}
        {allergenItems.length > 0 && (
          <AllergenPictosView items={allergenItems} className="justify-center pt-4 border-t border-outline-variant/40" iconClassName="w-8 h-8" />
        )}
      </div>

      {/* Planning de préparation — sans intérêt à l'impression quand toutes
          les étapes tombent le même jour (un seul jalon à afficher) : masqué
          dans ce cas, conservé à l'écran. Même bloc que la fiche recette. */}
      {sortedSteps.length > 0 && (
        <div id="sec-planning" className={`scroll-mt-28 ${planningDays.length <= 1 ? 'no-print ' : ''}py-10 border-y border-outline-variant`}>
          <h3 className="font-headline-md text-headline-md text-primary mb-8">Planning de préparation</h3>
          <div className="relative flex flex-col md:flex-row gap-8">
            <div className="hidden md:block absolute top-10 left-0 w-full h-[2px] bg-outline-variant" />
            {planningDays.map((d, i) => (
              <div key={d.offset} className="relative flex flex-col items-center text-center gap-4 z-10 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center font-bold">{i + 1}</div>
                <span className="font-label-md text-[12px] text-secondary">{dLabel(d.offset)}</span>
                {d.items.map((it) => (
                  <p
                    key={it.key}
                    className={`font-body-md text-body-md font-semibold ${it.fully ? 'text-on-surface-variant line-through' : it.added ? 'text-green-700' : ''}`}
                  >
                    {it.title}
                  </p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recette d'origine — absente si la recette de base n'est plus
          accessible (supprimée/dépubliée), même repli que le bandeau
          d'avertissement plus haut. Même pattern que la signature de la
          fiche recette (avatar + nom vers /u/[handle]). */}
      {baseRecipe && (
        <div className="flex items-center gap-4 flex-wrap font-label-md text-label-md text-on-surface-variant">
          <Link href={`/recette/${baseRecipe.id}`} className="text-primary underline underline-offset-2 hover:text-secondary">
            Voir la recette d&apos;origine
          </Link>
          {baseRecipe.authorId && (
            <span className="flex items-center gap-2">
              Par
              <Link
                className="flex items-center gap-2 hover:text-primary transition-colors"
                href={`/u/${baseRecipe.author?.username || baseRecipe.authorId}`}
              >
                <span className="w-6 h-6 rounded-full overflow-hidden border border-outline-variant block bg-surface-container">
                  {baseRecipe.author?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                    <img src={baseRecipe.author.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant flex items-center justify-center w-full h-full">
                      person
                    </span>
                  )}
                </span>
                <span className="border-b border-primary">{baseRecipe.author?.fullName || 'Auteur'}</span>
              </Link>
            </span>
          )}
        </div>
      )}

      {batch.recipe_description && (
        <div id="sec-description" className="scroll-mt-28 bg-primary p-8 text-white rounded-xl">
          <h3 className="font-headline-md text-headline-md mb-3 flex items-center gap-3">
            <span className="material-symbols-outlined">auto_awesome</span>En quelques mots
          </h3>
          <p className="font-body-lg text-body-lg italic opacity-90 leading-relaxed">{batch.recipe_description}</p>
        </div>
      )}

      {baseRecipe?.heroImageUrl && (
        <div className="relative w-full aspect-[16/9] overflow-hidden rounded-xl border border-outline-variant">
          {/* eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin */}
          <img src={baseRecipe.heroImageUrl} alt={batch.recipe_title || ''} className="w-full h-full object-cover" />
          {baseRecipe.heroImageAiRetouched && <AiPhotoBadge />}
        </div>
      )}

      {batch.recipe_tips && (
        <div id="sec-conseils" className="scroll-mt-28 bg-primary p-8 text-white rounded-xl">
          <h3 className="font-headline-md text-headline-md mb-3 flex items-center gap-3">
            <span className="material-symbols-outlined">auto_awesome</span>Conseils et astuces de la recette
          </h3>
          <p className="font-body-lg text-body-lg italic opacity-90 leading-relaxed whitespace-pre-line">{batch.recipe_tips}</p>
        </div>
      )}

      {batch.recipe_serving_advice && (
        <div id="sec-degustation" className="scroll-mt-28 bg-surface-container-low border border-outline-variant p-8 rounded-xl">
          <h3 className="font-headline-md text-headline-md text-primary mb-3 flex items-center gap-3">
            <span className="material-symbols-outlined">restaurant</span>Dégustation et conservation
          </h3>
          <p className="font-body-lg text-body-lg italic text-on-surface-variant leading-relaxed whitespace-pre-line">{batch.recipe_serving_advice}</p>
        </div>
      )}

      {batch.batch_utensils.length > 0 && (
        <div id="sec-ustensiles" className="scroll-mt-28">
          <h3 className="font-headline-md text-headline-md text-primary mb-4">Ustensiles nécessaires</h3>
          <ul className="grid grid-cols-1 gap-y-2">
            {[...batch.batch_utensils]
              .sort((a, b) => a.order_index - b.order_index)
              .map((u) => (
                <li key={u.id} className="py-2 border-b border-outline-variant/30 font-body-md text-body-md">
                  {u.url ? (
                    <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-secondary">
                      {u.name}
                    </a>
                  ) : (
                    u.name
                  )}
                  {u.comment && <span className="text-on-surface-variant text-sm italic"> — {u.comment}</span>}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Liste totale des ingrédients — vue d'ensemble en lecture seule,
          référence complète de la fournée (`mergeAllBatchIngredients`) :
          contrairement à la liste de courses juste en dessous (`merged`),
          une étape déjà réalisée n'y retire pas ses ingrédients — seuls les
          retirés ou remplacés par une sous-recette disparaissent. Distincte
          de la section « Ingrédients ajustés » plus bas, qui reste groupée
          par étape pour porter l'édition (coefficient, remplacement, ajout).
          Affichée dès qu'il y a des ingrédients dans la fournée, même si
          tout est déjà réalisé. */}
      {batch.batch_ingredients.length > 0 && (
        <div id="sec-ingredients-complets" className="scroll-mt-28">
          <h3 className="font-headline-md text-headline-md text-primary mb-4">Liste totale des ingrédients</h3>
          <ul className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 sm:gap-x-10 print:gap-x-10">
            {allIngredients.map((r) => {
              const qtyTxt = mergedRowQtyText(r);
              const tip = r.unit ? unitTips[r.unit.toLowerCase().trim()] : undefined;
              const conv = ingredientConversionText(conversions, units, r.ref_id, r.unit, qtyTxt);
              return (
                <li
                  key={r.name + '|' + r.unit}
                  className="border-b border-outline-variant/30 py-2"
                  style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'center' }}
                >
                  <span className={`font-label-md text-label-md whitespace-nowrap ${r.added ? 'text-green-700' : 'text-primary'}`}>
                    {qtyTxt}
                    {qtyTxt && r.unit ? ' ' : ''}
                    {r.unit ? (tip ? <span className="unit-tip" title={tip}>{r.unit}</span> : r.unit) : null}
                    {conv && <span className="text-on-surface-variant font-body-md text-[12px]"> ({conv})</span>}
                  </span>
                  <span className={`font-body-md text-body-md break-words ${r.added ? 'text-green-700' : ''}`}>
                    {r.name}
                    {r.comment && <span className="text-on-surface-variant text-sm italic"> — {r.comment}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Liste de courses — sous la liste totale des ingrédients : c'est sa
          suite directe une fois qu'on a fini de les ajuster, pas une
          information à retrouver plus haut sur la fiche. Même condition
          d'affichage que la liste totale ci-dessus (cf. commentaire). */}
      {batch.batch_ingredients.length > 0 && (
        <div id="sec-courses" className="scroll-mt-28">
          <ShoppingWidget
            recipeTitle={batch.recipe_title || 'Fournée'}
            ingredients={merged.map((r) => ({ name: r.name, qty: mergedRowQtyText(r), unit: r.unit, comment: r.comment, ref_id: r.ref_id, url: null, allergen: null }))}
            lists={shoppingLists}
            isLoggedIn
            conversions={conversions}
            units={units}
          />
        </div>
      )}

      {/* Ingrédients ajustés, groupés par étape : porte l'édition (coefficient,
          remplacement par une recette, ajout par étape), déjà consultable en
          lecture seule dans la liste totale ci-dessus et dans le déroulé des
          étapes plus bas — repliée par défaut pour ne pas doubler ces deux
          vues à l'écran. */}
      {batch.batch_ingredients.length > 0 && (
        <div id="sec-ingredients" className="scroll-mt-28">
          <details className="group">
            <summary className="flex items-center justify-between gap-3 mb-4 cursor-pointer list-none">
              <h3 className="font-headline-md text-headline-md text-primary">Ingrédients ajustés</h3>
              <span className="material-symbols-outlined text-on-surface-variant group-open:rotate-180 transition-transform">expand_more</span>
            </summary>
            <BatchIngredientsEditor batch={batch} units={units} unitTips={unitTips} conversions={conversions} />
          </details>
        </div>
      )}

      {sortedSteps.length > 0 && (
        <div id="sec-etapes" className="scroll-mt-28 space-y-12">
          <h3 className="font-headline-md text-headline-md text-primary">Étapes</h3>
          {sortedSteps.map((s, i) => {
            const ingredientsOfStep = batch.batch_ingredients.filter((it) => it.batch_step_id === s.id);
            const fully = stepFullyDone(s, ingredientsOfStep, s.batch_substeps);
            // Une étape remplacée est barrée en rouge comme une suppression
            // (même convention que l'ingrédient remplacé, cf. bandeau de
            // légende plus haut) : elle ne sera jamais réalisée telle quelle.
            // Une étape insérée (par éclatement d'ingrédient OU par
            // remplacement d'une autre étape) reste en vert, « Ajoutée ».
            const replaced = batchStepReplaced(s);
            const added = batchStepIsExpansion(s) || batchStepIsStepReplacement(s);
            const insertedFrom = batchStepIsExpansion(s) ? expansionSource(batch, s) : stepReplacementSource(batch, s);
            const stepTitle = (
              <div className="flex flex-col gap-1">
                <h4
                  className={`font-headline-md text-headline-md flex items-center gap-2 ${
                    replaced ? 'text-error line-through' : fully ? 'text-on-surface-variant line-through' : added ? 'text-green-700' : 'text-primary'
                  }`}
                >
                  <span>
                    {i + 1}. {s.title || 'Étape ' + (i + 1)}
                  </span>
                  {!s.done && !replaced && (
                    <button
                      type="button"
                      onClick={() => setReplacingStep(s)}
                      title="Remplacer cette étape par une recette (la fabriquer à partir d'une autre recette)"
                      className="no-print font-normal text-primary hover:opacity-70"
                    >
                      <span className="material-symbols-outlined text-[18px] align-middle">swap_horiz</span>
                    </button>
                  )}
                </h4>
                {added && (
                  <span className="font-body-md text-[12px] text-green-700 font-normal">
                    Ajouté —{' '}
                    {insertedFrom ? (
                      <Link href={`/recette/${insertedFrom.id}`} className="underline underline-offset-2 hover:opacity-70">
                        {insertedFrom.title}
                      </Link>
                    ) : (
                      'sous-recette'
                    )}
                  </span>
                )}
                {replaced && (
                  <span className="font-body-md text-[12px] text-error flex items-center gap-1.5 flex-wrap font-normal">
                    <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
                    Remplacée — fabriquée à partir de{' '}
                    {s.replaced_recipe ? (
                      <Link href={`/recette/${s.replaced_recipe.id}`} className="underline underline-offset-2 hover:opacity-70">
                        {s.replaced_recipe.title}
                      </Link>
                    ) : (
                      <span className="italic">une recette qui n’est plus accessible</span>
                    )}
                    <button
                      type="button"
                      onClick={() => cancelStepReplacement(s)}
                      title="Annuler le remplacement et retirer les étapes ajoutées"
                      className="no-print text-primary hover:opacity-70"
                    >
                      <span className="material-symbols-outlined text-[16px] align-middle">undo</span>
                    </button>
                  </span>
                )}
              </div>
            );
            const times = remainingStepTimes(s);
            const stepTotal = (times.prep_time || 0) + (times.wait_time || 0) + (times.cook_time || 0);
            const badges = [
              s.done ? 'PRÉPARATION DÉJÀ RÉALISÉE' : '',
              times.prep_time ? `PRÉP ${formatTime(times.prep_time).toUpperCase()}` : '',
              times.wait_time ? `ATTENTE ${formatTime(times.wait_time).toUpperCase()}` : '',
              times.cook_time ? `CUISSON ${formatTime(times.cook_time).toUpperCase()}${s.cook_temp ? ' · ' + s.cook_temp + ' °C' : ''}` : s.cook_temp ? `CUISSON ${s.cook_temp} °C` : '',
            ].filter(Boolean);
            const stepMeta = (
              <div className="flex items-center gap-4 text-on-surface-variant font-label-md text-[12px] flex-wrap">
                {badges.map((b, k) => (
                  <span key={k} className="h-7 inline-flex items-center bg-surface-variant px-3">
                    {b}
                  </span>
                ))}
                {stepTotal > 0 && <span className="h-7 inline-flex items-center bg-primary text-white px-3">TOTAL {formatTime(stepTotal).toUpperCase()}</span>}
              </div>
            );
            const photos = baseRecipe && s.source_step_id ? baseRecipe.stepPhotosBySourceStepId[s.source_step_id] || [] : [];
            return (
              <div key={s.id} id={`etape-${s.id}`} className="scroll-mt-28 flex flex-col gap-6">
                <BatchStepDonePanel
                  collapsible={fully || replaced}
                  title={stepTitle}
                  meta={stepMeta}
                  step={s}
                  ingredients={ingredientsOfStep}
                  substeps={s.batch_substeps}
                  plannedDate={batch.planned_date}
                  dayOptions={dayOptions}
                >
                  <StepPhotoGallery photos={photos} />
                  {s.video_url && <StepVideoPlayer url={s.video_url} />}
                  {s.tips && (
                    <details className="group border border-outline-variant">
                      <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
                        <span className="font-label-md text-label-md text-primary">Conseils &amp; Astuces de l&apos;étape</span>
                        <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
                      </summary>
                      <div className="p-4 bg-white font-body-md text-body-md italic whitespace-pre-line">{s.tips}</div>
                    </details>
                  )}
                </BatchStepDonePanel>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Mode Cuisiner ────────────────────────────────────────────────────────
function CuisinerView({
  batch,
  setBatch,
  readOnly,
  conversions,
  units,
  setBusy,
  onSwitchMode,
  onMarkTerminee,
  finishBatch,
  reviewEligible,
}: {
  batch: BatchFull;
  setBatch: React.Dispatch<React.SetStateAction<BatchFull>>;
  readOnly: boolean;
  conversions: ConversionRef[];
  units: UnitRef[];
  setBusy: (b: boolean) => void;
  onSwitchMode: (m: 'preparer' | 'cuisiner') => void;
  // Rail Cuisiner : même écriture que le rail Préparer, cf. BatchView.
  onMarkTerminee: () => void;
  // Écriture nue (sans confirmation), pour la proposition automatique
  // ci-dessous qui pose déjà sa propre question.
  finishBatch: () => Promise<boolean>;
  // Un avis est-il encore possible sur cette fournée une fois terminée ?
  reviewEligible: boolean;
}) {
  const dialog = useDialog();
  const router = useRouter();
  const commentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const globalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  const [manuallyOpenedJalons, setManuallyOpenedJalons] = useState<Set<number>>(new Set());
  const expandJalon = useCallback((ji: number) => {
    setManuallyOpenedJalons((prev) => (prev.has(ji) ? prev : new Set(prev).add(ji)));
  }, []);

  useEffect(() => {
    if (readOnly || batch.status !== 'planifiee') return;
    async function acquire() {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLock.current = await navigator.wakeLock.request('screen');
      } catch {
        // refus (économie d'énergie…) : on continue sans
      }
    }
    acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      wakeLock.current?.release?.().catch(() => {});
      wakeLock.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.status, readOnly]);

  async function updateStep(id: number, patch: Partial<Pick<BatchStepRow, 'done' | 'done_at' | 'commentaire'>>) {
    if (readOnly) return;
    setBatch((prev) => ({ ...prev, batch_steps: prev.batch_steps.map((s) => (s.id !== id ? s : { ...s, ...patch })) }));
    const { error } = await createClient().from('batch_steps').update(patch).eq('id', id);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  // Propose de terminer la fournée une fois toutes les étapes cochées, puis —
  // si la réponse est oui — de laisser un avis sur la recette (cf. CLAUDE.md
  // « Avis sur une recette »). `finishBatch` est appelé nu (sans reconfirmer,
  // la question du dessus en tient déjà lieu) ; `onMarkTerminee`, lui, garde
  // sa propre confirmation pour l'usage depuis le rail.
  async function proposeFinish() {
    const wantsFinish = await dialog.confirm('Toutes les étapes sont cochées ! Souhaitez-vous marquer cette fournée comme terminée ?');
    if (!wantsFinish) {
      dialog.alert('Pas de souci : vous pourrez la marquer comme terminée à tout moment depuis le menu.');
      return;
    }
    const ok = await finishBatch();
    if (!ok || !reviewEligible) return;
    const wantsReview = await dialog.confirm('Souhaitez-vous laisser une note et un commentaire sur cette recette ?');
    if (wantsReview) {
      setTimeout(() => document.getElementById('sec-avis')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } else {
      dialog.alert('Pas de souci, vous pourrez laisser votre avis plus tard depuis cette fournée.');
    }
  }

  function toggleStep(id: number, checked: boolean) {
    updateStep(id, { done: checked, done_at: checked ? new Date().toISOString() : null });
    if (checked) {
      setTimeout(() => document.querySelector('[data-step-pending]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      const allDone = batch.batch_steps.length > 0 && batch.batch_steps.every((s) => (s.id === id ? true : s.done));
      if (allDone && batch.status === 'planifiee' && !readOnly) proposeFinish();
    }
  }

  function onStepComment(id: number, value: string) {
    setBatch((prev) => ({ ...prev, batch_steps: prev.batch_steps.map((s) => (s.id !== id ? s : { ...s, commentaire: value })) }));
    clearTimeout(commentTimers.current['s' + id]);
    commentTimers.current['s' + id] = setTimeout(async () => {
      const { error } = await createClient().from('batch_steps').update({ commentaire: value }).eq('id', id);
      if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
    }, 800);
  }

  async function updateSubstep(id: number, patch: Partial<Pick<BatchSubstepRow, 'done' | 'commentaire'>>) {
    if (readOnly) return;
    setBatch((prev) => ({
      ...prev,
      batch_steps: prev.batch_steps.map((s) => ({ ...s, batch_substeps: s.batch_substeps.map((su) => (su.id !== id ? su : { ...su, ...patch })) })),
    }));
    const { error } = await createClient().from('batch_substeps').update(patch).eq('id', id);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  function toggleSub(id: number, checked: boolean) {
    updateSubstep(id, { done: checked });
  }

  function onSubComment(id: number, value: string) {
    updateSubstep(id, { commentaire: value });
  }

  async function updateIngredient(id: number, patch: Partial<Pick<BatchIngredientRow, 'done' | 'real_quantity' | 'commentaire'>>) {
    if (readOnly) return;
    setBatch((prev) => ({ ...prev, batch_ingredients: prev.batch_ingredients.map((it) => (it.id !== id ? it : { ...it, ...patch })) }));
    const { error } = await createClient().from('batch_ingredients').update(patch).eq('id', id);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  function onIngComment(id: number, value: string) {
    setBatch((prev) => ({ ...prev, batch_ingredients: prev.batch_ingredients.map((it) => (it.id !== id ? it : { ...it, commentaire: value })) }));
    clearTimeout(commentTimers.current['i' + id]);
    commentTimers.current['i' + id] = setTimeout(async () => {
      const { error } = await createClient().from('batch_ingredients').update({ commentaire: value }).eq('id', id);
      if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
    }, 800);
  }

  function onGlobalComment(value: string) {
    setBatch((prev) => ({ ...prev, commentaire_global: value }));
    clearTimeout(globalTimer.current ?? undefined);
    globalTimer.current = setTimeout(async () => {
      const { error } = await createClient().from('batches').update({ commentaire_global: value }).eq('id', batch.id);
      if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
    }, 800);
  }

  // Seul l'abandon reste géré ici : « terminer » passe désormais par
  // `onMarkTerminee` (BatchView), partagé avec le rail Préparer et la
  // proposition automatique de `proposeFinish` ci-dessus.
  async function abandonBatch(message: string) {
    if (readOnly) return;
    if (!(await dialog.confirm(message))) return;
    const fin = new Date().toISOString();
    setBusy(true);
    const { error } = await createClient().from('batches').update({ status: 'abandonnee', date_fin: fin }).eq('id', batch.id);
    setBusy(false);
    if (error) {
      dialog.alert('Erreur : ' + error.message);
      return;
    }
    setBatch((prev) => ({ ...prev, status: 'abandonnee', date_fin: fin }));
    wakeLock.current?.release?.().catch(() => {});
    window.scrollTo(0, 0);
    router.refresh();
  }

  const jalons = useMemo(() => groupBatchStepsByDay(batch.batch_steps), [batch.batch_steps]);

  useEffect(() => {
    const m = /^#etape-(\d+)$/.exec(location.hash);
    if (!m) return;
    const stepId = Number(m[1]);
    const ji = jalons.findIndex((j) => j.steps.some((s) => s.id === stepId));
    if (ji === -1) return;
    expandJalon(ji);
    setTimeout(() => document.getElementById(`etape-${stepId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deg = batch.degustation_at
    ? new Date(batch.degustation_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;
  const meta = deg ? `Dégustation prévue ${deg}` : '';

  const showResume = batch.status !== 'planifiee';
  const tocSteps = useMemo(() => jalons.map((j, ji) => ({ key: String(ji), title: jalonLabel(j) })), [jalons]);
  const tocSections: TocSections = useMemo(
    () => ({ before: [], after: showResume ? [{ id: 'sec-resume', label: 'Résumé de la fournée', icon: 'insights', level: 1 }] : [] }),
    [showResume],
  );
  // Symétrique du bouton « Passer en mode Cuisiner » du rail Préparer : le
  // rail reste visible pendant le défilement, contrairement aux deux
  // pastilles du haut de page. Fin de session (terminer/annuler) et sortie
  // y rejoignent les mêmes actions — même mécanisme que « Supprimer la
  // fournée » côté Préparer, visible à la fois dans le rail desktop et le
  // tiroir mobile : ça remplace l'ancienne barre fixe en bas d'écran, propre
  // à cette vue et absente du reste de l'application.
  const tocActions: TocAction[] = [
    { id: 'switch-preparer', icon: 'tune', label: 'Passer en mode Préparer', variant: 'outline-strong', onClick: () => onSwitchMode('preparer') },
    ...(readOnly
      ? []
      : [
          { id: 'terminer', icon: 'flag', label: 'Marquer comme terminé', variant: 'filled' as const, onClick: onMarkTerminee },
          {
            id: 'annuler',
            icon: 'cancel',
            label: 'Annuler ma fournée',
            variant: 'outline-danger' as const,
            onClick: () => abandonBatch('Annuler cette fournée ?\nLa progression restera consultable dans l’historique.'),
          },
        ]),
    {
      id: 'quitter',
      icon: 'logout',
      label: 'Quitter',
      variant: 'outline',
      onClick: () => {
        setBusy(true);
        router.push('/en-cuisine');
      },
    },
  ];

  return (
    <>
      {/* Toujours monté, même sans jalon : le menu porte aussi la fin de
          session (terminer/annuler) et la sortie, qui doivent rester
          atteignables même pour une fournée sans étape. */}
      <RecipeToc sections={tocSections} steps={tocSteps} actions={tocActions} onNavigateToStep={expandJalon} mobile="drawer" mobileInset="none" />

      {meta && <p className="text-on-surface-variant text-sm mb-6">{meta}</p>}

      {batch.notes && (
        <div className="mb-6 p-3 bg-secondary/5 border-l-4 border-secondary rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-secondary mb-1">Ma note</p>
          <div className="font-body-md text-sm whitespace-pre-line">{batch.notes}</div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <CuisinerBody
          batch={batch}
          jalons={jalons}
          readOnly={readOnly}
          manuallyOpenedJalons={manuallyOpenedJalons}
          conversions={conversions}
          units={units}
          onToggleStep={toggleStep}
          onToggleSub={toggleSub}
          onSubComment={onSubComment}
          onToggleIng={(id, checked) => updateIngredient(id, { done: checked })}
          onIngReal={(id, value) => updateIngredient(id, { real_quantity: numify(value) })}
          onIngComment={onIngComment}
          onStepComment={onStepComment}
        />
      </div>

      {batch.status !== 'planifiee' && <SummaryPanel batch={batch} lecture={readOnly} onGlobalComment={onGlobalComment} />}
    </>
  );
}

function CuisinerBody({
  batch,
  jalons,
  readOnly,
  manuallyOpenedJalons,
  conversions,
  units,
  onToggleStep,
  onToggleSub,
  onSubComment,
  onToggleIng,
  onIngReal,
  onIngComment,
  onStepComment,
}: {
  batch: BatchFull;
  jalons: BatchJalon[];
  readOnly: boolean;
  manuallyOpenedJalons: Set<number>;
  conversions: ConversionRef[];
  units: UnitRef[];
  onToggleStep: (id: number, checked: boolean) => void;
  onToggleSub: (id: number, checked: boolean) => void;
  onSubComment: (id: number, value: string) => void;
  onToggleIng: (id: number, checked: boolean) => void;
  onIngReal: (id: number, value: string) => void;
  onIngComment: (id: number, value: string) => void;
  onStepComment: (id: number, value: string) => void;
}) {
  const all = jalons.flatMap((j) => j.steps);
  const done = all.filter((s) => s.done).length;
  const curIdx = jalons.findIndex((j) => j.steps.some((s) => !s.done));
  let pendingMarked = false;

  function jalonDate(j: BatchJalon): Date | null {
    if (!batch.degustation_at) return null;
    const d = new Date(batch.degustation_at);
    d.setDate(d.getDate() - (j.offset || 0));
    return d;
  }
  function jalonTarget(j: BatchJalon): Date | null {
    const d = jalonDate(j);
    return d ? new Date(d.getTime() - jalonDur(j) * MIN) : null;
  }
  function tempoChip() {
    if (batch.status !== 'planifiee' || !batch.degustation_at) return null;
    const j = jalons.find((x) => x.steps.some((s) => !s.done));
    if (!j) return null;
    const target = jalonTarget(j);
    if (!target) return null;
    const doneMin = j.steps.filter((s) => s.done).reduce((n, s) => n + stepDur(s), 0);
    const expected = new Date(target.getTime() + doneMin * MIN);
    const diff = Math.round((Date.now() - expected.getTime()) / MIN);
    if (diff < -720) return <span className="font-label-md text-[12px] px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant">À démarrer le {fmtJour(target)} vers {fmtHeure(target)}</span>;
    if (diff > 15) return <span className="font-label-md text-[12px] px-3 py-1 rounded-full bg-error text-white">En retard d&apos;environ {formatTime(diff)}</span>;
    if (diff < -15) return <span className="font-label-md text-[12px] px-3 py-1 rounded-full bg-green-700 text-white">En avance d&apos;environ {formatTime(-diff)}</span>;
    return <span className="font-label-md text-[12px] px-3 py-1 rounded-full bg-secondary text-white">Dans les temps</span>;
  }

  return (
    <>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div className="flex justify-between text-[12px] font-label-md text-on-surface-variant mb-1">
            <span>Progression</span>
            <span>{done} / {all.length} étapes</span>
          </div>
          <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${all.length ? Math.round((done / all.length) * 100) : 0}%` }} />
          </div>
        </div>
        {tempoChip()}
      </div>

      {jalons.map((j, ji) => {
        const jDone = j.steps.every((s) => s.done);
        const isCurrent = ji === curIdx;
        const dt = jalonDate(j);
        const target = jalonTarget(j);
        return (
          <details
            key={ji}
            id={jalonAnchorId(ji)}
            open={isCurrent || (readOnly && !jDone) || manuallyOpenedJalons.has(ji)}
            className={`scroll-mt-28 rounded-xl border ${isCurrent ? 'border-primary shadow-md' : 'border-outline-variant'} bg-surface-container-lowest overflow-hidden`}
          >
            <summary className={`flex items-center gap-4 p-4 cursor-pointer list-none ${isCurrent ? 'bg-primary/5' : 'bg-surface-container-low'}`}>
              <span className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${jDone ? 'bg-green-700 text-white' : isCurrent ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}`}>
                {jDone ? <span className="material-symbols-outlined text-[22px]">check</span> : ji + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-label-md text-label-md text-primary block">
                  {j.offset > 0 ? `Jour J − ${j.offset}` : 'Jour J'}
                  {dt ? ` (${fmtJour(dt)})` : ''}
                </span>
                <span className="text-[12px] text-on-surface-variant">
                  {target ? `À démarrer vers ${fmtHeure(target)} · ` : ''}
                  {formatTime(jalonDur(j))} de travail · {j.steps.filter((s) => s.done).length}/{j.steps.length} étape{j.steps.length > 1 ? 's' : ''}
                </span>
              </span>
              <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
            </summary>
            <div className="p-4 flex flex-col gap-4">
              {j.steps.map((s) => {
                const isPending = !pendingMarked && !s.done;
                if (isPending) pendingMarked = true;
                return (
                  <StepCookCard
                    key={s.id}
                    step={s}
                    ingredients={batch.batch_ingredients.filter((it) => it.batch_step_id === s.id && !batchIngredientExcluded(s, it))}
                    readOnly={readOnly}
                    isPending={isPending}
                    conversions={conversions}
                    units={units}
                    onToggleStep={onToggleStep}
                    onToggleSub={onToggleSub}
                    onSubComment={onSubComment}
                    onToggleIng={onToggleIng}
                    onIngReal={onIngReal}
                    onIngComment={onIngComment}
                    onStepComment={onStepComment}
                  />
                );
              })}
            </div>
          </details>
        );
      })}
    </>
  );
}

function StepCookCard({
  step: s,
  ingredients,
  readOnly,
  isPending,
  conversions,
  units,
  onToggleStep,
  onToggleSub,
  onSubComment,
  onToggleIng,
  onIngReal,
  onIngComment,
  onStepComment,
}: {
  step: BatchStepRow & { batch_substeps: BatchSubstepRow[] };
  ingredients: BatchIngredientRow[];
  readOnly: boolean;
  isPending: boolean;
  conversions: ConversionRef[];
  units: UnitRef[];
  onToggleStep: (id: number, checked: boolean) => void;
  onToggleSub: (id: number, checked: boolean) => void;
  onSubComment: (id: number, value: string) => void;
  onToggleIng: (id: number, checked: boolean) => void;
  onIngReal: (id: number, value: string) => void;
  onIngComment: (id: number, value: string) => void;
  onStepComment: (id: number, value: string) => void;
}) {
  const times = remainingStepTimes(s);
  const badges = [
    s.done ? 'PRÉPARATION DÉJÀ RÉALISÉE' : '',
    times.prep_time ? `PRÉP ${formatTime(times.prep_time).toUpperCase()}` : '',
    times.wait_time ? `ATTENTE ${formatTime(times.wait_time).toUpperCase()}` : '',
    times.cook_time ? `CUISSON ${formatTime(times.cook_time).toUpperCase()}${s.cook_temp ? ' · ' + s.cook_temp + ' °C' : ''}` : s.cook_temp ? `CUISSON ${s.cook_temp} °C` : '',
  ].filter(Boolean);
  const substeps = [...s.batch_substeps].filter((su) => !batchSubstepExcluded(s, su)).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  // Ingrédients de l'étape que le texte de chaque sous-étape semble nommer
  // (cf. lib/recipe-plan.ts), chacun affiché à sa seule première sous-étape —
  // le lait versé en début d'étape n'est pas une nouvelle quantité à chaque
  // sous-étape suivante qui le mentionne encore.
  const subIngredientsBySubstep = substepIngredientsBySubstep(substeps, ingredients);

  // Coche automatiquement le titre de l'étape dès qu'on vient de cocher le
  // dernier ingrédient ou la dernière sous-étape restants — jamais en continu
  // (un `useEffect` recalculé à chaque rendu recochait l'étape aussitôt après
  // qu'on l'ait décochée à la main, puisque ses ingrédients/sous-étapes
  // restaient cochés, eux). Se déclenche donc uniquement depuis les gestes de
  // coche ci-dessous, jamais l'inverse : décocher un ingrédient ou une
  // sous-étape ne décoche pas l'étape (cf. CLAUDE.md « une étape n'est jamais
  // retirée du déroulé »).
  function maybeAutoCheckStep(justDoneIngredientIds: Set<number>, justDoneSubstepIds: Set<number>) {
    if (readOnly || s.done) return;
    if (ingredients.length === 0 && substeps.length === 0) return;
    const allIngDone = ingredients.every((it) => it.done || justDoneIngredientIds.has(it.id));
    const allSubDone = substeps.every((su) => su.done || justDoneSubstepIds.has(su.id));
    if (allIngDone && allSubDone) onToggleStep(s.id, true);
  }

  return (
    <div id={`etape-${s.id}`} className={`scroll-mt-28 border border-outline-variant rounded-lg bg-white overflow-hidden${s.done ? ' opacity-70' : ''}`} data-step-pending={isPending ? '' : undefined}>
      <label className="flex items-start gap-4 p-4 cursor-pointer select-none">
        <input type="checkbox" checked={s.done} disabled={readOnly} onChange={(ev) => onToggleStep(s.id, ev.target.checked)} className="w-8 h-8 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5" />
        <span className="flex-1 min-w-0">
          <span className={`font-headline-md text-[16px] text-primary block${s.done ? ' line-through' : ''}`}>{s.title}</span>
          <span className="text-[12px] font-label-md text-on-surface-variant">{badges.join(' · ')}</span>
        </span>
      </label>

      {s.tips && (
        <div className="mx-4 mb-3 p-3 bg-primary/5 border-l-4 border-primary rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-primary mb-1">Conseils &amp; astuces</p>
          <div className="font-body-md text-sm italic whitespace-pre-line">{s.tips}</div>
        </div>
      )}

      {ingredients.length > 0 && (
        <ul className="px-4 pb-2">
          {ingredients.map((ing) => {
            const prevTxt = [ing.quantity != null ? fmtNum(ing.quantity) : ing.quantity_text || '', ing.unit ? shortUnitLbl(ing.unit) : ''].filter(Boolean).join(' ');
            const conv = ingredientConversionText(conversions, units, ing.ref_id, ing.unit, ing.quantity ?? ing.quantity_text);
            const struck = ing.done ? ' line-through opacity-50' : '';
            const checkbox = (
              <input
                type="checkbox"
                checked={ing.done}
                disabled={readOnly}
                onChange={(ev) => {
                  const checked = ev.target.checked;
                  onToggleIng(ing.id, checked);
                  if (checked) maybeAutoCheckStep(new Set([ing.id]), new Set());
                }}
                className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0"
              />
            );
            const realInput = (
              <input
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                placeholder="réel"
                disabled={readOnly}
                defaultValue={ing.real_quantity != null ? ing.real_quantity : ''}
                onBlur={(ev) => onIngReal(ing.id, ev.target.value)}
                className="border border-outline-variant rounded px-2 py-1.5 font-body-md text-sm text-center w-14 sm:w-20 shrink-0"
              />
            );
            const commentInput = (
              <input
                type="text"
                placeholder="note (ex : trop sec, viser +10 g)"
                disabled={readOnly}
                defaultValue={ing.commentaire || ''}
                onBlur={(ev) => onIngComment(ing.id, ev.target.value)}
                className="border border-outline-variant rounded px-2 py-1.5 font-body-md text-sm flex-1 min-w-0 sm:min-w-[10rem]"
              />
            );
            return (
              <li key={ing.id} className="flex flex-col gap-1.5 py-2.5 border-b border-outline-variant/30">
                <label className="flex items-center gap-3">
                  {checkbox}
                  <span className={`font-body-md text-[14px] flex-1 min-w-0${struck}`}>
                    {ing.name}
                    {ing.comment && <span className="italic text-on-surface-variant"> ({ing.comment})</span>}
                  </span>
                </label>
                <span className={`font-label-md text-label-md text-on-surface-variant ml-9${struck}`}>
                  prévu {prevTxt} {conv && <span className="text-[14px]">({conv})</span>}
                </span>
                <div className="flex items-center gap-2 sm:gap-3 ml-9">
                  {realInput}
                  <span className="text-sm text-on-surface-variant shrink-0">{ing.unit ? shortUnitLbl(ing.unit) : ''}</span>
                  {commentInput}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {substeps.length > 0 ? (
        <ul className={`px-4 pb-3 flex flex-col gap-4${ingredients.length > 0 ? ' pt-3 border-t-2 border-outline-variant' : ''}`}>
          {substeps.map((su) => {
            const subIngredients = subIngredientsBySubstep.get(su.id) || [];
            return (
              <li key={su.id} className="flex flex-col gap-1.5">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={su.done}
                    disabled={readOnly}
                    onChange={(ev) => {
                      const checked = ev.target.checked;
                      onToggleSub(su.id, checked);
                      if (checked) {
                        subIngredients.forEach((it) => onToggleIng(it.id, true));
                        maybeAutoCheckStep(new Set(subIngredients.map((it) => it.id)), new Set([su.id]));
                      }
                    }}
                    className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
                  />
                  <span className={`font-body-md text-[14px] leading-relaxed${su.done ? ' line-through opacity-50' : ''}`}>{su.texte}</span>
                </label>
                {subIngredients.length > 0 && (
                  <ul className="ml-9 flex flex-col gap-1">
                    {subIngredients.map((it) => {
                      const qtyTxt = [it.quantity != null ? fmtNum(it.quantity) : it.quantity_text || '', it.unit ? shortUnitLbl(it.unit) : ''].filter(Boolean).join(' ');
                      const conv = ingredientConversionText(conversions, units, it.ref_id, it.unit, it.quantity ?? it.quantity_text);
                      return (
                        <li key={it.id}>
                          <span className={`text-[12px] font-label-md text-on-surface-variant${su.done ? ' line-through opacity-50' : ''}`}>
                            {it.name}
                            {qtyTxt && <> — {qtyTxt}</>}
                            {conv && <> ({conv})</>}
                            {it.comment && <span className="italic"> ({it.comment})</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <input type="text" placeholder="note sur cette sous-étape" disabled={readOnly} defaultValue={su.commentaire || ''} onBlur={(ev) => onSubComment(su.id, ev.target.value)} className="ml-9 border border-outline-variant rounded px-2 py-1.5 font-body-md text-sm" />
              </li>
            );
          })}
        </ul>
      ) : (
        s.description && <div className="px-4 pb-3 font-body-md text-[14px] leading-relaxed text-on-surface whitespace-pre-line">{s.description}</div>
      )}

      {s.video_url && (
        <div className="px-4 pb-3">
          <StepVideoPlayer url={s.video_url} />
        </div>
      )}

      {s.user_note && (
        <div className="mx-4 mb-3 p-3 bg-secondary/5 border-l-4 border-secondary rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-secondary mb-1">Ma note</p>
          <div className="font-body-md text-sm whitespace-pre-line">{s.user_note}</div>
        </div>
      )}

      <div className="px-4 pb-4">
        <textarea
          rows={2}
          placeholder="Ce qui s'est passé sur cette étape (sauvegardé automatiquement)…"
          disabled={readOnly}
          value={s.commentaire || ''}
          onChange={(ev) => onStepComment(s.id, ev.target.value)}
          className="w-full border border-outline-variant rounded px-3 py-2 font-body-md text-sm bg-surface-container-low focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}

function SummaryPanel({ batch, lecture, onGlobalComment }: { batch: BatchFull; lecture: boolean; onGlobalComment: (v: string) => void }) {
  function jalonDate(offset: number): Date | null {
    if (!batch.degustation_at) return null;
    const d = new Date(batch.degustation_at);
    d.setDate(d.getDate() - offset);
    return d;
  }
  const jalons = groupBatchStepsByDay(batch.batch_steps);
  const all = batch.batch_steps;
  const done = all.filter((s) => s.done).length;
  const duree = batch.date_fin && batch.date_debut ? fmtDuree(+new Date(batch.date_fin) - +new Date(batch.date_debut)) : '—';
  const jalonRows = jalons.map((j, ji) => {
    const label = j.offset > 0 ? `Jour J − ${j.offset}` : 'Jour J';
    if (!j.steps.length) return null;
    if (!j.steps.every((s) => s.done)) return <li key={ji}>{label} : <span className="text-on-surface-variant">non terminé</span></li>;
    const dates = j.steps.filter((s) => s.done_at).map((s) => new Date(s.done_at!).getTime());
    if (!dates.length) return <li key={ji}>{label} : terminé</li>;
    const last = new Date(Math.max(...dates));
    const deadline = jalonDate(j.offset);
    const diff = deadline ? Math.round((+last - +deadline) / MIN) : null;
    return (
      <li key={ji}>
        {label} : terminé le {fmtJour(last)} à {fmtHeure(last)}
        {diff != null && (diff <= 0 ? <> — <span className="text-green-700 font-bold">dans les temps</span></> : <> — <span className="text-error font-bold">en retard de {formatTime(diff)}</span></>)}
      </li>
    );
  });
  const ecarts = batch.batch_ingredients
    .filter((it) => (it.real_quantity != null && it.real_quantity !== it.quantity) || it.commentaire)
    .map((it) => {
      const u = it.unit ? ' ' + it.unit : '';
      return {
        key: it.id,
        nom: it.name,
        prev: (it.quantity != null ? fmtNum(it.quantity) : it.quantity_text || '') + u,
        reel: it.real_quantity != null ? fmtNum(it.real_quantity) + u : null,
        commentaire: it.commentaire,
      };
    });
  const comms = batch.batch_steps.filter((s) => s.commentaire).map((s) => ({ key: s.id, titre: s.title, texte: s.commentaire! }));

  return (
    <div id="sec-resume" className="scroll-mt-28 mt-6 border border-outline-variant rounded-xl bg-surface-container-lowest p-6 flex flex-col gap-5">
      <h2 className="font-headline-md text-headline-md text-primary">Résumé de la fournée</h2>
      <div className="flex flex-wrap gap-10">
        <div>
          <p className={LBL_CLS}>Durée totale</p>
          <p className="font-headline-md text-[22px] text-primary">{duree}</p>
        </div>
        <div>
          <p className={LBL_CLS}>Étapes réalisées</p>
          <p className="font-headline-md text-[22px] text-primary">{done} / {all.length}</p>
        </div>
      </div>
      <div>
        <p className={`${LBL_CLS} mb-1`}>Respect des jalons</p>
        <ul className="text-sm flex flex-col gap-1">{jalonRows.length ? jalonRows : <li>—</li>}</ul>
      </div>
      {ecarts.length > 0 && (
        <div>
          <p className={`${LBL_CLS} mb-1`}>Ajustements d&apos;ingrédients</p>
          <ul className="text-sm flex flex-col gap-1">
            {ecarts.map((e) => (
              <li key={e.key}>
                {e.nom} : prévu {e.prev}
                {e.reel && <> → utilisé <span className="font-bold text-primary">{e.reel}</span></>}
                {e.commentaire && <span className="italic text-on-surface-variant"> — {e.commentaire}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {comms.length > 0 && (
        <div>
          <p className={`${LBL_CLS} mb-1`}>Commentaires d&apos;étapes</p>
          <ul className="text-sm flex flex-col gap-1">
            {comms.map((c) => (
              <li key={c.key}>
                <span className="font-bold">{c.titre} :</span> {c.texte}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className={`${LBL_CLS} mb-1`}>Commentaire global</p>
        <textarea
          rows={3}
          disabled={lecture}
          value={batch.commentaire_global || ''}
          onChange={(ev) => onGlobalComment(ev.target.value)}
          placeholder="Bilan de la fournée (sauvegardé automatiquement)…"
          className="w-full border border-outline-variant rounded px-3 py-2 font-body-md text-sm bg-surface-container-low focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}
