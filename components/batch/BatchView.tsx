'use client';

// Écran d'une fournée (porté de recette.html mode planifié + execution.html) :
// deux modes sur la même donnée — Préparer (avant, au calme : ajuster,
// éditer) et Cuisiner (pendant : jalons à cocher, mise en place, tempo). La
// case d'une étape est unique (`batch_steps.done`) : la cocher dans un mode
// la coche instantanément dans l'autre, il n'y a plus de session séparée à
// garder synchronisée — voir CLAUDE.md « Fournées ».
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { BatchIngredientsEditor } from '@/components/recipe/BatchIngredientsEditor';
import { BatchStepDonePanel } from '@/components/recipe/BatchStepDonePanel';
import { RecipeToc, type TocSections } from '@/components/recipe/RecipeToc';
import { formatTime, formatDate } from '@/lib/format';
import { UNITS_LBL } from '@/lib/recipe-view';
import { ingredientConversionText, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';
import type { Unit } from '@/lib/profile';
import {
  fmtNum,
  batchDayLabel,
  batchFactor,
  batchIngredientExcluded,
  batchStepIsExpansion,
  batchSubstepExcluded,
  expansionSource,
  groupBatchStepsByDay,
  mergeBatchIngredients,
  mergedRowQtyText,
  mergeIngredientsForMep,
  remainingStepTimes,
  stepFullyDone,
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
const fmtJour = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
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
const STATUS_LBL: Record<string, { label: string; cls: string }> = {
  planifiee: { label: 'En cours', cls: 'bg-secondary' },
  terminee: { label: 'Terminée', cls: 'bg-green-700' },
  abandonnee: { label: 'Abandonnée', cls: 'bg-error' },
};
const LBL_CLS = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

type Photo = { url: string; ai_retouched: boolean };
type BaseRecipeInfo = {
  id: string;
  updatedAt: string | null;
  heroImageUrl: string | null;
  heroImageAiRetouched: boolean;
  stepPhotosBySourceStepId: Record<number, Photo[]>;
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
  shoppingLists,
  lecture,
}: {
  batch: BatchFull;
  baseRecipe: BaseRecipeInfo;
  units: Unit[];
  unitTips: Record<string, string>;
  conversions: ConversionRef[];
  shoppingLists: { id: number; name: string }[];
  lecture: boolean;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const writeGuard = useWriteGuard();
  const impersonationReadOnly = useReadOnly();
  const [batch, setBatch] = useState(initialBatch);
  useEffect(() => setBatch(initialBatch), [initialBatch]);
  const [mode, setMode] = useState<'preparer' | 'cuisiner'>(() => defaultMode(initialBatch));
  const [busy, setBusy] = useState(false);

  const readOnly = batch.status !== 'planifiee' || lecture || impersonationReadOnly;

  // Bandeau de vigilance (décision « recette de base modifiée depuis ») : la
  // fournée n'est jamais resynchronisée après sa création, donc une
  // correction ultérieure de la recette de base ne lui parvient pas — ce
  // bandeau le signale plutôt que de laisser la divergence silencieuse.
  const baseModifiedSince = !!(baseRecipe?.updatedAt && new Date(baseRecipe.updatedAt) > new Date(batch.created_at || 0));

  async function enterCuisiner() {
    setMode('cuisiner');
    if (!batch.date_debut && batch.status === 'planifiee' && !readOnly) {
      const now = new Date().toISOString();
      const { error } = await createClient().from('batches').update({ date_debut: now }).eq('id', batch.id);
      if (!error) setBatch((b) => ({ ...b, date_debut: now }));
    }
  }

  const dateTxt = batch.planned_date
    ? new Date(batch.planned_date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const all = batch.batch_steps;
  const done = all.filter((s) => s.done).length;

  return (
    <>
      <header className="bg-surface/80 backdrop-blur-md border-b border-outline-variant/30 sticky top-0 z-50">
        <div className="max-w-[900px] mx-auto flex justify-between items-center px-margin-mobile py-3">
          <Link className="maryse-logo-font text-3xl text-primary leading-none" href="/">
            Je pâtisse !
          </Link>
          <Link href="/en-cuisine" className="font-label-md text-label-md text-on-surface-variant hover:text-primary flex items-center gap-1">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span> Mes fournées
          </Link>
        </div>
      </header>

      <div className="max-w-[900px] mx-auto px-margin-mobile py-6 pb-32">
        <LoadingOverlay visible={busy} label="Enregistrement…" />

        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1">
          <h1 className="font-headline-lg text-headline-lg-mobile text-primary">{batch.recipe_title || 'Fournée'}</h1>
          <span className={`font-label-md text-[12px] px-3 py-1 rounded-full text-white ${STATUS_LBL[batch.status]?.cls || 'bg-secondary'}`}>
            {STATUS_LBL[batch.status]?.label || batch.status}
          </span>
        </div>
        <p className="text-on-surface-variant text-sm mb-4">
          {[dateTxt ? `Fournée du ${dateTxt}` : '', batch.factor && Number(batch.factor) !== 1 ? `× ${String(batch.factor).replace('.', ',')}` : batch.adjust_label || '']
            .filter(Boolean)
            .join(' — ')}
        </p>

        {baseModifiedSince && (
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

        <div className="flex items-center gap-2 mb-6">
          <button
            type="button"
            onClick={() => setMode('preparer')}
            className={`rounded-pill border px-4 py-2 font-label-md text-label-md ${mode === 'preparer' ? 'border-primary bg-primary text-white' : 'border-outline-variant text-on-surface-variant hover:text-primary'}`}
          >
            Préparer
          </button>
          <button
            type="button"
            onClick={enterCuisiner}
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
          <PreparerView batch={batch} baseRecipe={baseRecipe} units={units} unitTips={unitTips} conversions={conversions} shoppingLists={shoppingLists} />
        ) : (
          <CuisinerView batch={batch} setBatch={setBatch} readOnly={readOnly} conversions={conversions} units={units} setBusy={setBusy} />
        )}

        {mode === 'preparer' && !readOnly && (
          <div className="mt-10 flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={async () => {
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
              }}
              className="border border-error text-error px-5 py-2 rounded-full font-label-md text-label-md hover:bg-error/5"
            >
              Supprimer la fournée
            </button>
          </div>
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
  shoppingLists,
}: {
  batch: BatchFull;
  baseRecipe: BaseRecipeInfo;
  units: Unit[];
  unitTips: Record<string, string>;
  conversions: ConversionRef[];
  shoppingLists: { id: number; name: string }[];
}) {
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

  const dayOptions = useMemo(() => {
    const used = batch.batch_steps.flatMap((s) => [Math.max(0, s.day_offset || 0), Math.max(0, s.base_day_offset ?? 0)]);
    const max = Math.max(0, ...used) + 2;
    return Array.from({ length: max + 1 }, (_, i) => i);
  }, [batch.batch_steps]);
  const dLabel = (offset: number) => (batch.planned_date ? batchDayLabel(offset, batch.planned_date) : `JOUR J${offset > 0 ? ' − ' + offset : ''}`);

  return (
    <div className="flex flex-col gap-8">
      <p className="font-body-md text-[12px] text-on-surface-variant">
        Sur cette fiche : <span className="text-green-700">en vert</span> ce que vous avez ajouté (dont les étapes venues
        d&apos;un ingrédient que vous fabriquez vous-même), <span className="text-error line-through">barré en rouge</span> ce
        que vous avez retiré ou remplacé par une recette, <span className="text-on-surface-variant line-through">barré en gris</span>{' '}
        ce que vous avez déjà réalisé, et « recette : … » rappelle la valeur d&apos;origine.
      </p>

      <BatchNotes batchId={batch.id} notes={batch.user_note} />

      {merged.length > 0 && (
        <ShoppingWidget
          recipeTitle={batch.recipe_title || 'Fournée'}
          ingredients={merged.map((r) => ({ name: r.name, qty: mergedRowQtyText(r), unit: r.unit, comment: r.comment, ref_id: r.ref_id }))}
          lists={shoppingLists}
          isLoggedIn
          conversions={conversions}
          units={units}
        />
      )}

      {/* Bloc technique */}
      <div className="bg-surface-container-low p-6 rounded-xl space-y-6">
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
        {batch.yield_notes && <p className="font-body-md text-sm italic text-on-surface-variant whitespace-pre-line">{batch.yield_notes}</p>}
        {allergens.length > 0 && (
          <p className="font-body-md text-sm text-on-surface-variant">
            <span className={LBL_CLS}>Allergènes : </span>
            {allergens.map((a) => a.name).join(', ')}
          </p>
        )}
      </div>

      {batch.recipe_description && (
        <div className="bg-primary p-8 text-white rounded-xl">
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

      {batch.batch_utensils.length > 0 && (
        <div>
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

      {batch.batch_ingredients.length > 0 && (
        <div>
          <h3 className="font-headline-md text-headline-md text-primary mb-4">Ingrédients</h3>
          <BatchIngredientsEditor batch={batch} units={units} unitTips={unitTips} conversions={conversions} />
        </div>
      )}

      {sortedSteps.length > 0 && (
        <div className="space-y-12">
          <h3 className="font-headline-md text-headline-md text-primary">Étapes</h3>
          {sortedSteps.map((s, i) => {
            const ingredientsOfStep = batch.batch_ingredients.filter((it) => it.batch_step_id === s.id);
            const fully = stepFullyDone(s, ingredientsOfStep, s.batch_substeps);
            const added = batchStepIsExpansion(s);
            const stepTitle = (
              <h4 className={`font-headline-md text-headline-md ${fully ? 'text-on-surface-variant line-through' : added ? 'text-green-700' : 'text-primary'}`}>
                {i + 1}. {s.title || 'Étape ' + (i + 1)}
                {added && (
                  <span className="block font-body-md text-[12px] text-green-700 font-normal mt-1">
                    Ajouté —{' '}
                    {(() => {
                      const from = expansionSource(batch, s);
                      return from ? (
                        <Link href={`/recette/${from.id}`} className="underline underline-offset-2 hover:opacity-70">
                          {from.title}
                        </Link>
                      ) : (
                        'sous-recette'
                      );
                    })()}
                  </span>
                )}
              </h4>
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
              <div className="flex gap-4 text-on-surface-variant font-label-md text-[12px] flex-wrap">
                {badges.map((b, k) => (
                  <span key={k} className="bg-surface-variant px-3 py-1">
                    {b}
                  </span>
                ))}
                {stepTotal > 0 && <span className="bg-primary text-white px-3 py-1">TOTAL {formatTime(stepTotal).toUpperCase()}</span>}
              </div>
            );
            const photos = baseRecipe && s.source_step_id ? baseRecipe.stepPhotosBySourceStepId[s.source_step_id] || [] : [];
            return (
              <div key={s.id} id={`etape-${s.id}`} className="scroll-mt-28 flex flex-col gap-6">
                <BatchStepDonePanel
                  collapsible={fully}
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

      {batch.recipe_tips && (
        <div className="bg-primary p-8 text-white rounded-xl">
          <h3 className="font-headline-md text-headline-md mb-3 flex items-center gap-3">
            <span className="material-symbols-outlined">auto_awesome</span>Conseils et astuces de la recette
          </h3>
          <p className="font-body-lg text-body-lg italic opacity-90 leading-relaxed whitespace-pre-line">{batch.recipe_tips}</p>
        </div>
      )}

      {batch.recipe_serving_advice && (
        <div className="bg-surface-container-low border border-outline-variant p-8 rounded-xl">
          <h3 className="font-headline-md text-headline-md text-primary mb-3 flex items-center gap-3">
            <span className="material-symbols-outlined">restaurant</span>Dégustation et conservation
          </h3>
          <p className="font-body-lg text-body-lg italic text-on-surface-variant leading-relaxed whitespace-pre-line">{batch.recipe_serving_advice}</p>
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
}: {
  batch: BatchFull;
  setBatch: React.Dispatch<React.SetStateAction<BatchFull>>;
  readOnly: boolean;
  conversions: ConversionRef[];
  units: UnitRef[];
  setBusy: (b: boolean) => void;
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

  function toggleStep(id: number, checked: boolean) {
    updateStep(id, { done: checked, done_at: checked ? new Date().toISOString() : null });
    if (checked) {
      setTimeout(() => document.querySelector('[data-step-pending]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
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

  async function toggleMepIngredients(ids: number[], checked: boolean) {
    if (readOnly) return;
    setBatch((prev) => ({ ...prev, batch_ingredients: prev.batch_ingredients.map((it) => (ids.includes(it.id) ? { ...it, mep_done: checked } : it)) }));
    const { error } = await createClient().from('batch_ingredients').update({ mep_done: checked }).in('id', ids);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  async function toggleMepUtensil(id: number, checked: boolean) {
    if (readOnly) return;
    setBatch((prev) => ({ ...prev, batch_utensils: prev.batch_utensils.map((u) => (u.id !== id ? u : { ...u, mep_done: checked })) }));
    const { error } = await createClient().from('batch_utensils').update({ mep_done: checked }).eq('id', id);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  async function mepDone() {
    setBatch((prev) => ({ ...prev, mep_done: true }));
    window.scrollTo(0, 0);
    const { error } = await createClient().from('batches').update({ mep_done: true }).eq('id', batch.id);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  function onGlobalComment(value: string) {
    setBatch((prev) => ({ ...prev, commentaire_global: value }));
    clearTimeout(globalTimer.current ?? undefined);
    globalTimer.current = setTimeout(async () => {
      const { error } = await createClient().from('batches').update({ commentaire_global: value }).eq('id', batch.id);
      if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
    }, 800);
  }

  async function endSession(status: 'terminee' | 'abandonnee', message: string) {
    if (readOnly) return;
    if (!(await dialog.confirm(message))) return;
    const fin = new Date().toISOString();
    setBusy(true);
    const { error } = await createClient().from('batches').update({ status, date_fin: fin }).eq('id', batch.id);
    setBusy(false);
    if (error) {
      dialog.alert('Erreur : ' + error.message);
      return;
    }
    setBatch((prev) => ({ ...prev, status, date_fin: fin }));
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
  const nbEtapes = batch.batch_steps.length;
  const meta = [deg ? `Dégustation prévue ${deg}` : '', `${jalons.length} jalon${jalons.length > 1 ? 's' : ''} · ${nbEtapes} étape${nbEtapes > 1 ? 's' : ''}`].filter(Boolean).join(' — ');

  const showMep = !readOnly && !batch.mep_done && (batch.batch_utensils.length > 0 || batch.batch_ingredients.length > 0);
  const showResume = batch.status !== 'planifiee' && !showMep;
  const tocSteps = useMemo(() => jalons.map((j, ji) => ({ key: String(ji), title: jalonLabel(j) })), [jalons]);
  const tocSections: TocSections = useMemo(
    () => ({ before: [], after: showResume ? [{ id: 'sec-resume', label: 'Résumé de la fournée', icon: 'insights', level: 1 }] : [] }),
    [showResume],
  );

  return (
    <>
      {!showMep && jalons.length > 0 && (
        <RecipeToc sections={tocSections} steps={tocSteps} onNavigateToStep={expandJalon} mobile="drawer" mobileInset={readOnly ? 'none' : 'action-bar'} />
      )}
      <p className="text-on-surface-variant text-sm mb-6">{meta}</p>

      {batch.notes && (
        <div className="mb-6 p-3 bg-secondary/5 border-l-4 border-secondary rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-secondary mb-1">Ma note</p>
          <div className="font-body-md text-sm whitespace-pre-line">{batch.notes}</div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {showMep ? (
          <MiseEnPlace batch={batch} onToggleIngredients={toggleMepIngredients} onToggleUtensil={toggleMepUtensil} onDone={mepDone} conversions={conversions} units={units} />
        ) : (
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
        )}
      </div>

      {batch.status !== 'planifiee' && !showMep && <SummaryPanel batch={batch} lecture={readOnly} onGlobalComment={onGlobalComment} />}

      {!readOnly && !showMep && (
        <div className="fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur-md border-t border-outline-variant p-3 z-40" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-[900px] mx-auto flex gap-3">
            <button type="button" onClick={() => endSession('terminee', 'Terminer cette fournée ?')} className="flex-1 bg-primary text-on-primary py-3.5 rounded-full font-label-md text-label-md flex items-center justify-center gap-2">
              <span className="material-symbols-outlined text-[18px]">flag</span> Terminer
            </button>
            <button
              type="button"
              onClick={() => endSession('abandonnee', 'Abandonner cette fournée ?\nLa progression restera consultable dans l’historique.')}
              className="border border-error text-error px-6 py-3.5 rounded-full font-label-md text-label-md"
            >
              Abandonner
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function MiseEnPlace({
  batch,
  onToggleIngredients,
  onToggleUtensil,
  onDone,
  conversions,
  units,
}: {
  batch: BatchFull;
  onToggleIngredients: (ids: number[], checked: boolean) => void;
  onToggleUtensil: (id: number, checked: boolean) => void;
  onDone: () => void;
  conversions: ConversionRef[];
  units: UnitRef[];
}) {
  const included = useMemo(() => {
    const stepById = new Map(batch.batch_steps.map((s) => [s.id, s]));
    return batch.batch_ingredients.filter((it) => !batchIngredientExcluded(it.batch_step_id != null ? (stepById.get(it.batch_step_id) ?? { done: false }) : { done: false }, it));
  }, [batch]);
  const mepIngredients = useMemo(() => mergeIngredientsForMep(included), [included]);
  return (
    <div className="border border-primary rounded-xl bg-surface-container-lowest p-6">
      <h2 className="font-headline-md text-headline-md text-primary mb-1">Mise en place</h2>
      <p className="text-on-surface-variant text-sm mb-6">Vérifiez que tout est prêt — ou passez directement à la recette.</p>
      {batch.batch_utensils.length > 0 && (
        <>
          <p className={`${LBL_CLS} mb-1`}>Ustensiles</p>
          <ul className="mb-6">
            {batch.batch_utensils.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5 border-b border-outline-variant/30">
                <input type="checkbox" checked={u.mep_done} onChange={(e) => onToggleUtensil(u.id, e.target.checked)} className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0" />
                <span className={`font-body-md flex-1${u.mep_done ? ' line-through opacity-50' : ''}`}>{u.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {mepIngredients.length > 0 && (
        <>
          <p className={`${LBL_CLS} mb-1`}>Ingrédients</p>
          <ul className="mb-6">
            {mepIngredients.map((it) => (
              <li key={it.key} className="flex items-center gap-3 py-2.5 border-b border-outline-variant/30">
                <input type="checkbox" checked={it.done} onChange={(e) => onToggleIngredients(it.ids, e.target.checked)} className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0" />
                <span className={`font-body-md flex-1${it.done ? ' line-through opacity-50' : ''}`}>{it.name}</span>
                {(it.quantity != null || it.quantityText) && (
                  <span className={`font-label-md text-label-md text-primary whitespace-nowrap${it.done ? ' line-through opacity-50' : ''}`}>
                    {[it.quantity != null ? fmtNum(it.quantity) : it.quantityText, it.unit].filter(Boolean).join(' ')}
                    {(() => {
                      const conv = ingredientConversionText(conversions, units, it.ref_id, it.unit, it.quantity ?? it.quantityText);
                      return conv ? <span className="text-on-surface-variant font-body-md text-[12px]"> ({conv})</span> : null;
                    })()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex gap-3">
        <button type="button" onClick={onDone} className="flex-1 bg-primary text-on-primary py-3.5 rounded-full font-label-md text-label-md">
          Commencer
        </button>
        <button type="button" onClick={onDone} className="border border-outline px-6 py-3.5 rounded-full font-label-md text-label-md text-on-surface-variant">
          Passer
        </button>
      </div>
    </div>
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
                  {dt ? ' — ' + fmtJour(dt) : ''}
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

  return (
    <div id={`etape-${s.id}`} className={`scroll-mt-28 border border-outline-variant rounded-lg bg-white overflow-hidden${s.done ? ' opacity-70' : ''}`} data-step-pending={isPending ? '' : undefined}>
      <label className="flex items-start gap-4 p-4 cursor-pointer select-none">
        <input type="checkbox" checked={s.done} disabled={readOnly} onChange={(ev) => onToggleStep(s.id, ev.target.checked)} className="w-8 h-8 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5" />
        <span className="flex-1 min-w-0">
          <span className={`font-headline-md text-[20px] text-primary block${s.done ? ' line-through' : ''}`}>{s.title}</span>
          <span className="text-[12px] font-label-md text-on-surface-variant">{badges.join(' · ')}</span>
        </span>
      </label>

      {ingredients.length > 0 && (
        <ul className="px-4 pb-2">
          {ingredients.map((ing) => {
            const prevTxt = [ing.quantity != null ? fmtNum(ing.quantity) : ing.quantity_text || '', ing.unit].filter(Boolean).join(' ');
            const conv = ingredientConversionText(conversions, units, ing.ref_id, ing.unit, ing.quantity ?? ing.quantity_text);
            const struck = ing.done ? ' line-through opacity-50' : '';
            const checkbox = (
              <input type="checkbox" checked={ing.done} disabled={readOnly} onChange={(ev) => onToggleIng(ing.id, ev.target.checked)} className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0" />
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
                className="border border-outline-variant rounded px-2 py-1.5 font-body-md text-sm text-center"
                style={{ width: '5rem' }}
              />
            );
            const commentInput = (
              <input
                type="text"
                placeholder="note (ex : trop sec, viser +10 g)"
                disabled={readOnly}
                defaultValue={ing.commentaire || ''}
                onBlur={(ev) => onIngComment(ing.id, ev.target.value)}
                className="border border-outline-variant rounded px-2 py-1.5 font-body-md text-sm flex-1 min-w-[10rem]"
              />
            );
            if (conv) {
              return (
                <li key={ing.id} className="flex flex-col gap-1.5 py-2.5 border-b border-outline-variant/30">
                  <label className="flex items-center gap-3">
                    {checkbox}
                    <span className={`font-body-md flex-1 min-w-0${struck}`}>{ing.name}</span>
                  </label>
                  <span className={`font-label-md text-label-md text-on-surface-variant ml-9${struck}`}>
                    prévu {prevTxt} <span className="text-[12px]">({conv})</span>
                  </span>
                  <div className="flex items-center gap-3 ml-9 flex-wrap">
                    {realInput}
                    <span className="text-sm text-on-surface-variant">{ing.unit || ''}</span>
                    {commentInput}
                  </div>
                </li>
              );
            }
            return (
              <li key={ing.id} className="flex items-center gap-3 py-2.5 border-b border-outline-variant/30 flex-wrap">
                {checkbox}
                <span className={`font-body-md flex-1 min-w-0${struck}`}>{ing.name}</span>
                <span className={`font-label-md text-label-md text-on-surface-variant whitespace-nowrap${struck}`}>prévu {prevTxt}</span>
                {realInput}
                <span className="text-sm text-on-surface-variant">{ing.unit || ''}</span>
                {commentInput}
              </li>
            );
          })}
        </ul>
      )}

      {substeps.length > 0 ? (
        <ul className="px-4 pb-3 flex flex-col gap-4">
          {substeps.map((su) => (
            <li key={su.id} className="flex flex-col gap-1.5">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked={su.done} disabled={readOnly} onChange={(ev) => onToggleSub(su.id, ev.target.checked)} className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5" />
                <span className={`font-body-md text-body-md leading-relaxed${su.done ? ' line-through opacity-50' : ''}`}>{su.texte}</span>
              </label>
              <input type="text" placeholder="note sur cette sous-étape" disabled={readOnly} defaultValue={su.commentaire || ''} onBlur={(ev) => onSubComment(su.id, ev.target.value)} className="ml-9 border border-outline-variant rounded px-2 py-1.5 font-body-md text-sm" />
            </li>
          ))}
        </ul>
      ) : (
        s.description && <div className="px-4 pb-3 font-body-md text-body-md leading-relaxed text-on-surface whitespace-pre-line">{s.description}</div>
      )}

      {s.video_url && (
        <div className="px-4 pb-3">
          <StepVideoPlayer url={s.video_url} />
        </div>
      )}

      {s.tips && (
        <div className="mx-4 mb-3 p-3 bg-primary/5 border-l-4 border-primary rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-primary mb-1">Conseils &amp; astuces</p>
          <div className="font-body-md text-sm italic whitespace-pre-line">{s.tips}</div>
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
