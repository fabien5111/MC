'use client';

// Écran d'exécution guidé par jalons (porté de execution.html) : mise en place
// optionnelle, jalons en accordéon avec étapes à cocher (sous-étapes,
// ingrédients avec quantité réellement utilisée + commentaire), tempo vs heure
// de dégustation, wake lock, résumé de fin de session.
//
// Écritures ciblées par ligne (execution_steps/execution_substeps/
// execution_ingredients/execution_utensils), plus de blob JSON à réécrire en
// entier à chaque interaction. Chaque ligne fige nom/unité/quantité prévue au
// démarrage (colonnes `planned_*`) — jamais resynchronisées depuis le plan
// ensuite (cf. CLAUDE.md « Recettes planifiées ») : les ajustements de
// quantité et commentaires saisis ici restent attachés à cette session,
// retrouvables via `plan_ingredient_id` / `plan_step_id` même si le plan
// évolue par la suite.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useReadOnly } from '@/components/ImpersonationProvider';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';
import { RecipeToc, type TocSections } from '@/components/recipe/RecipeToc';
import { formatTime } from '@/lib/format';
import type { Execution } from '@/lib/executions';
import {
  groupExecutionSteps,
  mergeExecutionIngredientsForMep,
  remainingStepTimes,
  fmtNum,
  type ExecJalon,
  type ExecutionStepRow,
  type ExecutionIngredientRow,
  type ExecutionSubstepRow,
} from '@/lib/recipe-plan';
import { ingredientConversionText, type ConversionRef, type UnitRef } from '@/lib/ingredient-conversions';

const MIN = 60000;
const numify = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
// Tempo : une étape conservée pour sa seule cuisson ne compte plus sa
// préparation ni son attente, déjà écoulées avant la session (remainingStepTimes).
const stepDur = (s: ExecutionStepRow) => {
  const p = s.plan_steps;
  if (!p) return 0;
  const t = remainingStepTimes(p);
  return (t.prep_time || 0) + (t.wait_time || 0) + (t.cook_time || 0);
};
const jalonDur = (j: ExecJalon) => j.steps.reduce((n, s) => n + stepDur(s), 0);
const fmtHeure = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtJour = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const STATUS_LBL: Record<string, string> = { en_cours: 'En cours', terminee: 'Terminée', abandonnee: 'Abandonnée' };
const LBL_CLS = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';
// Ancre + libellé d'un jalon dans le sommaire du rail — distincts des étapes de
// l'éditeur (`stepAnchorId`) : les jalons n'ont pas de titre propre, seulement
// un décalage de jour, contrairement aux étapes de recette.
const jalonAnchorId = (ji: number) => `sec-jalon-${ji}`;
const jalonLabel = (j: ExecJalon) => (j.offset > 0 ? `Jour J − ${j.offset}` : 'Jour J');

function fmtDuree(ms: number): string {
  const min = Math.max(0, Math.round(ms / MIN));
  const j = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  return [j ? j + ' j' : '', h ? h + ' h' : '', m || (!j && !h) ? m + ' min' : ''].filter(Boolean).join(' ');
}

export function ExecutionView({
  exec: initialExec,
  prevComments,
  lecture,
  conversions,
  units,
}: {
  exec: Execution;
  prevComments: Record<number, { date: string; texte: string }[]>;
  lecture: boolean;
  conversions: ConversionRef[];
  units: UnitRef[];
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [exec, setExec] = useState(initialExec);
  const [deleting, setDeleting] = useState(false);
  // Une impersonation en lecture seule rend l'écran d'exécution consultatif,
  // exactement comme une exécution terminée (aucune écriture émise).
  const impersonationReadOnly = useReadOnly();
  const readOnly = exec.status !== 'en_cours' || lecture || impersonationReadOnly;
  const commentTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const globalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);
  // Jalons dépliés depuis le sommaire du rail : un <details> normalement
  // replié (jalon ni courant ni en retard) doit rester ouvert une fois qu'on
  // y a navigué, sans quoi le sommaire scrollerait vers un contenu invisible.
  const [manuallyOpenedJalons, setManuallyOpenedJalons] = useState<Set<number>>(new Set());
  const expandJalon = useCallback((ji: number) => {
    setManuallyOpenedJalons((prev) => (prev.has(ji) ? prev : new Set(prev).add(ji)));
  }, []);

  // ── Wake Lock : empêche la mise en veille pendant une session en cours ──
  useEffect(() => {
    if (readOnly || exec.status !== 'en_cours') return;
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
  }, [exec.status, readOnly]);

  async function updateStep(id: number, patch: Partial<Pick<ExecutionStepRow, 'done' | 'done_at' | 'commentaire'>>) {
    if (readOnly) return;
    setExec((prev) => ({ ...prev, execution_steps: prev.execution_steps.map((s) => (s.id !== id ? s : { ...s, ...patch })) }));
    const { error } = await createClient().from('execution_steps').update(patch).eq('id', id);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  function toggleStep(id: number, checked: boolean) {
    updateStep(id, { done: checked, done_at: checked ? new Date().toISOString() : null });
    if (checked) {
      setTimeout(() => document.querySelector('[data-step-pending]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  }

  function onStepComment(id: number, value: string) {
    setExec((prev) => ({ ...prev, execution_steps: prev.execution_steps.map((s) => (s.id !== id ? s : { ...s, commentaire: value })) }));
    clearTimeout(commentTimers.current[id]);
    commentTimers.current[id] = setTimeout(async () => {
      const { error } = await createClient().from('execution_steps').update({ commentaire: value }).eq('id', id);
      if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
    }, 800);
  }

  async function updateSubstep(id: number, patch: Partial<Pick<ExecutionSubstepRow, 'done' | 'commentaire'>>) {
    if (readOnly) return;
    setExec((prev) => ({
      ...prev,
      execution_steps: prev.execution_steps.map((s) => ({ ...s, execution_substeps: s.execution_substeps.map((su) => (su.id !== id ? su : { ...su, ...patch })) })),
    }));
    const { error } = await createClient().from('execution_substeps').update(patch).eq('id', id);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  function toggleSub(id: number, checked: boolean) {
    updateSubstep(id, { done: checked });
  }

  function onSubComment(id: number, value: string) {
    updateSubstep(id, { commentaire: value });
  }

  async function updateIngredient(id: number, patch: Partial<Pick<ExecutionIngredientRow, 'done' | 'real_quantity' | 'commentaire'>>) {
    if (readOnly) return;
    setExec((prev) => ({ ...prev, execution_ingredients: prev.execution_ingredients.map((it) => (it.id !== id ? it : { ...it, ...patch })) }));
    const { error } = await createClient().from('execution_ingredients').update(patch).eq('id', id);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  function onIngComment(id: number, value: string) {
    setExec((prev) => ({ ...prev, execution_ingredients: prev.execution_ingredients.map((it) => (it.id !== id ? it : { ...it, commentaire: value })) }));
    const key = -id; // distinct de la clé des commentaires d'étape (id positif)
    clearTimeout(commentTimers.current[key]);
    commentTimers.current[key] = setTimeout(async () => {
      const { error } = await createClient().from('execution_ingredients').update({ commentaire: value }).eq('id', id);
      if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
    }, 800);
  }

  // Mise en place : les lignes fusionnées (mêmes nom + unité, éventuellement
  // réparties sur plusieurs étapes) se cochent ensemble.
  async function toggleMepIngredients(ids: number[], checked: boolean) {
    if (readOnly) return;
    setExec((prev) => ({ ...prev, execution_ingredients: prev.execution_ingredients.map((it) => (ids.includes(it.id) ? { ...it, mep_done: checked } : it)) }));
    const { error } = await createClient().from('execution_ingredients').update({ mep_done: checked }).in('id', ids);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  async function toggleMepUtensil(id: number, checked: boolean) {
    if (readOnly) return;
    setExec((prev) => ({ ...prev, execution_utensils: prev.execution_utensils.map((u) => (u.id !== id ? u : { ...u, mep_done: checked })) }));
    const { error } = await createClient().from('execution_utensils').update({ mep_done: checked }).eq('id', id);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  async function mepDone() {
    setExec((prev) => ({ ...prev, mep_done: true }));
    window.scrollTo(0, 0);
    const { error } = await createClient().from('executions').update({ mep_done: true }).eq('id', exec.id);
    if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
  }

  function onGlobalComment(value: string) {
    setExec((prev) => ({ ...prev, commentaire_global: value }));
    clearTimeout(globalTimer.current ?? undefined);
    globalTimer.current = setTimeout(async () => {
      const { error } = await createClient().from('executions').update({ commentaire_global: value }).eq('id', exec.id);
      if (error) dialog.alert('Sauvegarde impossible : ' + error.message);
    }, 800);
  }

  async function endSession(status: 'terminee' | 'abandonnee', message: string) {
    if (readOnly) return;
    if (!(await dialog.confirm(message))) return;
    const fin = new Date().toISOString();
    const { error } = await createClient().from('executions').update({ status, date_fin: fin }).eq('id', exec.id);
    if (error) {
      dialog.alert('Erreur : ' + error.message);
      return;
    }
    setExec((prev) => ({ ...prev, status, date_fin: fin }));
    wakeLock.current?.release?.().catch(() => {});
    window.scrollTo(0, 0);
    // Uniquement en fin de session (pas à chaque écriture, très fréquente) :
    // les vues serveur listant les exécutions doivent refléter le nouveau statut.
    router.refresh();
  }

  // Suppression d'une session en cours — démarrée par erreur, ou devenue
  // caduque après une modification du plan (jour déplacé, ingrédient changé :
  // cf. PlanStepDonePanel / PlanIngredientsEditor, qui proposent la même
  // suppression juste après une telle écriture). La page n'a plus de session
  // à afficher ensuite : retour au planning, seul repère stable après coup.
  async function deleteSession() {
    if (readOnly) return;
    if (!(await dialog.confirm('Supprimer cette session en cours ? Cette action est irréversible.'))) return;
    setDeleting(true);
    const { error } = await createClient().from('executions').delete().eq('id', exec.id);
    if (error) {
      dialog.alert('Erreur : ' + error.message);
      setDeleting(false);
      return;
    }
    router.push('/en-cuisine');
  }

  const jalons = useMemo(() => groupExecutionSteps(exec.execution_steps), [exec.execution_steps]);

  // Lien direct vers une étape (ex. depuis la vue par jour de Profil >
  // Planning, cf. PlanningDayView) : `#etape-<id>` déplie le jalon qui la
  // contient (replié par défaut s'il n'est ni courant ni en retard) puis
  // scrolle jusqu'à elle. Une seule fois au montage — pas à chaque évolution
  // de `jalons`, sinon une simple coche ailleurs sur la page reviendrait
  // recentrer l'écran sur cette étape.
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

  const deg = exec.degustation_at
    ? new Date(exec.degustation_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;
  const nbEtapes = exec.execution_steps.length;
  const meta = [deg ? `Dégustation prévue ${deg}` : '', `${jalons.length} jalon${jalons.length > 1 ? 's' : ''} · ${nbEtapes} étape${nbEtapes > 1 ? 's' : ''}`]
    .filter(Boolean)
    .join(' — ');

  // `readOnly` couvre à la fois « exécution close », « mode lecture » et
  // « impersonation en lecture seule ».
  const showMep = !readOnly && !exec.mep_done && (exec.execution_utensils.length > 0 || exec.execution_ingredients.length > 0);

  // Sommaire du rail : sans intérêt pendant la mise en place (les jalons ne
  // sont pas encore dans le DOM), ni s'il n'y a aucun jalon. Le résumé n'y
  // figure que lorsqu'il est réellement affiché (session close).
  const showResume = exec.status !== 'en_cours' && !showMep;
  const tocSteps = useMemo(() => jalons.map((j, ji) => ({ key: String(ji), title: jalonLabel(j) })), [jalons]);
  const tocSections: TocSections = useMemo(
    () => ({
      before: [],
      after: showResume ? [{ id: 'sec-resume', label: 'Résumé de la session', icon: 'insights', level: 1 }] : [],
    }),
    [showResume],
  );

  return (
    <>
      <LoadingOverlay visible={deleting} label="Suppression en cours…" />
      {/* Le tiroir mobile compte double ici : c'est l'écran où l'on cuisine,
          donc celui où le téléphone est le support normal et où le déroulé est
          le plus long. `mobileInset` suit la barre d'actions fixe ci-dessous,
          qui n'existe qu'en session ouverte. */}
      {!showMep && jalons.length > 0 && (
        <RecipeToc
          sections={tocSections}
          steps={tocSteps}
          onNavigateToStep={expandJalon}
          mobile="drawer"
          mobileInset={readOnly ? 'none' : 'action-bar'}
        />
      )}
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <h1 className="font-headline-lg text-headline-lg-mobile text-primary">{exec.planning?.recipe_title || 'Session de préparation'}</h1>
        <span className="font-label-md text-[12px] px-3 py-1 rounded-full bg-secondary/90 text-white">{STATUS_LBL[exec.status] || exec.status}</span>
      </div>
      <p className="text-on-surface-variant text-sm mb-6">{meta}</p>

      {/* Note globale du plan (planning.notes), relue en direct comme les notes
          d'étape : elle est écrite pour cette préparation, elle doit être sous
          les yeux pendant qu'on la mène. */}
      {exec.planning?.notes && (
        <div className="mb-6 p-3 bg-secondary/5 border-l-4 border-secondary rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-secondary mb-1">Ma note</p>
          <div className="font-body-md text-sm whitespace-pre-line">{exec.planning.notes}</div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {showMep ? (
          <MiseEnPlace exec={exec} onToggleIngredients={toggleMepIngredients} onToggleUtensil={toggleMepUtensil} onDone={mepDone} conversions={conversions} units={units} />
        ) : (
          <ExecutionBody
            exec={exec}
            jalons={jalons}
            readOnly={readOnly}
            prevComments={prevComments}
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

      {exec.status !== 'en_cours' && !showMep && (
        <SummaryPanel exec={exec} lecture={lecture || impersonationReadOnly} onGlobalComment={onGlobalComment} />
      )}

      {!readOnly && !showMep && (
        <div className="fixed bottom-0 inset-x-0 bg-surface/95 backdrop-blur-md border-t border-outline-variant p-3 z-40" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          <div className="max-w-[900px] mx-auto flex gap-3">
            <button
              type="button"
              onClick={() => endSession('terminee', 'Terminer la session ?')}
              className="flex-1 bg-primary text-on-primary py-3.5 rounded-full font-label-md text-label-md flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">flag</span> Terminer
            </button>
            <button
              type="button"
              onClick={() => endSession('abandonnee', 'Abandonner la session ?\nLa progression restera consultable dans l’historique.')}
              className="border border-error text-error px-6 py-3.5 rounded-full font-label-md text-label-md"
            >
              Abandonner
            </button>
            <button
              type="button"
              onClick={deleteSession}
              title="Supprimer cette session"
              aria-label="Supprimer cette session"
              className="border border-error text-error px-4 py-3.5 rounded-full font-label-md text-label-md"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function MiseEnPlace({
  exec,
  onToggleIngredients,
  onToggleUtensil,
  onDone,
  conversions,
  units,
}: {
  exec: Execution;
  onToggleIngredients: (ids: number[], checked: boolean) => void;
  onToggleUtensil: (id: number, checked: boolean) => void;
  onDone: () => void;
  conversions: ConversionRef[];
  units: UnitRef[];
}) {
  const mepIngredients = useMemo(() => mergeExecutionIngredientsForMep(exec.execution_ingredients), [exec.execution_ingredients]);
  return (
    <div className="border border-primary rounded-xl bg-surface-container-lowest p-6">
      <h2 className="font-headline-md text-headline-md text-primary mb-1">Mise en place</h2>
      <p className="text-on-surface-variant text-sm mb-6">Vérifiez que tout est prêt — ou passez directement à la recette.</p>
      {exec.execution_utensils.length > 0 && (
        <>
          <p className={`${LBL_CLS} mb-1`}>Ustensiles</p>
          <ul className="mb-6">
            {exec.execution_utensils.map((u) => (
              <li key={u.id} className="flex items-center gap-3 py-2.5 border-b border-outline-variant/30">
                <input
                  type="checkbox"
                  checked={u.mep_done}
                  onChange={(e) => onToggleUtensil(u.id, e.target.checked)}
                  className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0"
                />
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
                <input
                  type="checkbox"
                  checked={it.done}
                  onChange={(e) => onToggleIngredients(it.ids, e.target.checked)}
                  className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0"
                />
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

function ExecutionBody({
  exec,
  jalons,
  readOnly,
  prevComments,
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
  exec: Execution;
  jalons: ExecJalon[];
  readOnly: boolean;
  prevComments: Record<number, { date: string; texte: string }[]>;
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

  // Tempo du jalon courant : heure attendue = cible + durées des étapes déjà faites.
  function jalonDate(j: ExecJalon): Date | null {
    if (!exec.degustation_at) return null;
    const d = new Date(exec.degustation_at);
    d.setDate(d.getDate() - (j.offset || 0));
    return d;
  }
  function jalonTarget(j: ExecJalon): Date | null {
    const d = jalonDate(j);
    return d ? new Date(d.getTime() - jalonDur(j) * MIN) : null;
  }
  function tempoChip() {
    if (exec.status !== 'en_cours' || !exec.degustation_at) return null;
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
              <span
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 ${jDone ? 'bg-green-700 text-white' : isCurrent ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant'}`}
              >
                {jDone ? <span className="material-symbols-outlined text-[22px]">check</span> : ji + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-label-md text-label-md text-primary block">
                  {j.offset > 0 ? `Jour J − ${j.offset}` : 'Jour J'}
                  {dt ? ' — ' + fmtJour(dt) : ''}
                </span>
                <span className="text-[12px] text-on-surface-variant">
                  {target ? `À démarrer vers ${fmtHeure(target)} · ` : ''}
                  {formatTime(jalonDur(j))} de travail · {j.steps.filter((s) => s.done).length}/{j.steps.length} étape
                  {j.steps.length > 1 ? 's' : ''}
                </span>
              </span>
              <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
            </summary>
            <div className="p-4 flex flex-col gap-4">
              {j.steps.map((s) => {
                const isPending = !pendingMarked && !s.done;
                if (isPending) pendingMarked = true;
                return (
                  <StepCard
                    key={s.id}
                    step={s}
                    ingredients={exec.execution_ingredients.filter((it) => it.execution_step_id === s.id)}
                    readOnly={readOnly}
                    isPending={isPending}
                    prevComments={(s.plan_step_id != null && prevComments[s.plan_step_id]) || []}
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

function StepCard({
  step: s,
  ingredients,
  readOnly,
  isPending,
  prevComments,
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
  step: ExecutionStepRow;
  ingredients: ExecutionIngredientRow[];
  readOnly: boolean;
  isPending: boolean;
  prevComments: { date: string; texte: string }[];
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
  const plan = s.plan_steps;
  // Les temps affichés sont ceux qui restent : une étape « déjà faite, cuisson
  // à faire » n'annonce ni préparation ni attente (remainingStepTimes).
  const times = plan ? remainingStepTimes(plan) : null;
  const badges = [
    plan?.already_done ? 'PRÉPARATION DÉJÀ RÉALISÉE' : '',
    times?.prep_time ? `PRÉP ${formatTime(times.prep_time).toUpperCase()}` : '',
    times?.wait_time ? `ATTENTE ${formatTime(times.wait_time).toUpperCase()}` : '',
    times?.cook_time ? `CUISSON ${formatTime(times.cook_time).toUpperCase()}${plan?.cook_temp ? ' · ' + plan.cook_temp + ' °C' : ''}` : plan?.cook_temp ? `CUISSON ${plan.cook_temp} °C` : '',
  ].filter(Boolean);
  const substeps = [...s.execution_substeps].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));

  return (
    <div
      id={`etape-${s.id}`}
      className={`scroll-mt-28 border border-outline-variant rounded-lg bg-white overflow-hidden${s.done ? ' opacity-70' : ''}`}
      data-step-pending={isPending ? '' : undefined}
    >
      <label className="flex items-start gap-4 p-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={s.done}
          disabled={readOnly}
          onChange={(ev) => onToggleStep(s.id, ev.target.checked)}
          className="w-8 h-8 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
        />
        <span className="flex-1 min-w-0">
          <span className={`font-headline-md text-[20px] text-primary block${s.done ? ' line-through' : ''}`}>{s.titre}</span>
          <span className="text-[12px] font-label-md text-on-surface-variant">{badges.join(' · ')}</span>
        </span>
      </label>

      {ingredients.length > 0 && (
        <ul className="px-4 pb-2">
          {ingredients.map((ing) => {
            const prevTxt = [ing.planned_quantity != null ? fmtNum(ing.planned_quantity) : ing.planned_text || '', ing.unit].filter(Boolean).join(' ');
            const conv = ingredientConversionText(conversions, units, ing.plan_ingredients?.ref_id, ing.unit, ing.planned_quantity ?? ing.planned_text);
            const struck = ing.done ? ' line-through opacity-50' : '';
            const checkbox = (
              <input
                type="checkbox"
                checked={ing.done}
                disabled={readOnly}
                onChange={(ev) => onToggleIng(ing.id, ev.target.checked)}
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
            // Avec conversion, la ligne condensée devient illisible (nom,
            // quantité prévue, équivalence, quantité réelle et note sur une
            // seule ligne qui se replie n'importe où) : on l'étale sur 3
            // lignes — nom ; prévu + équivalence ; réel + note.
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
                <input
                  type="checkbox"
                  checked={su.done}
                  disabled={readOnly}
                  onChange={(ev) => onToggleSub(su.id, ev.target.checked)}
                  className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
                />
                <span className={`font-body-md text-body-md leading-relaxed${su.done ? ' line-through opacity-50' : ''}`}>{su.texte}</span>
              </label>
              <input
                type="text"
                placeholder="note sur cette sous-étape"
                disabled={readOnly}
                defaultValue={su.commentaire || ''}
                onBlur={(ev) => onSubComment(su.id, ev.target.value)}
                className="ml-9 border border-outline-variant rounded px-2 py-1.5 font-body-md text-sm"
              />
            </li>
          ))}
        </ul>
      ) : (
        plan?.description && <div className="px-4 pb-3 font-body-md text-body-md leading-relaxed text-on-surface whitespace-pre-line">{plan.description}</div>
      )}

      {plan?.video_url && (
        <div className="px-4 pb-3">
          <StepVideoPlayer url={plan.video_url} />
        </div>
      )}

      {plan?.tips && (
        <div className="mx-4 mb-3 p-3 bg-primary/5 border-l-4 border-primary rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-primary mb-1">Conseils &amp; astuces</p>
          <div className="font-body-md text-sm italic whitespace-pre-line">{plan.tips}</div>
        </div>
      )}

      {/* Note personnelle portée par le plan : relue en direct (et non figée au
          démarrage), pour qu'une note écrite la veille apparaisse pendant la
          cuisson d'une session déjà lancée. À ne pas confondre avec le
          commentaire de session ci-dessous, qui relate le jour J. */}
      {plan?.user_note && (
        <div className="mx-4 mb-3 p-3 bg-secondary/5 border-l-4 border-secondary rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-secondary mb-1">Ma note</p>
          <div className="font-body-md text-sm whitespace-pre-line">{plan.user_note}</div>
        </div>
      )}

      {prevComments.length > 0 && (
        <div className="mx-4 mb-3 p-3 bg-surface-container-low border border-outline-variant/60 rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-on-surface-variant mb-1">Sessions précédentes</p>
          {prevComments.map((c, k) => (
            <p key={k} className="text-sm italic">
              « {c.texte} » <span className="text-on-surface-variant not-italic">— {new Date(c.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span>
            </p>
          ))}
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

function SummaryPanel({ exec, lecture, onGlobalComment }: { exec: Execution; lecture: boolean; onGlobalComment: (v: string) => void }) {
  function jalonDate(offset: number): Date | null {
    if (!exec.degustation_at) return null;
    const d = new Date(exec.degustation_at);
    d.setDate(d.getDate() - offset);
    return d;
  }
  const jalons = groupExecutionSteps(exec.execution_steps);
  const all = exec.execution_steps;
  const done = all.filter((s) => s.done).length;
  const duree = exec.date_fin ? fmtDuree(+new Date(exec.date_fin) - +new Date(exec.date_debut)) : '—';
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
  const ecarts = exec.execution_ingredients
    .filter((it) => (it.real_quantity != null && it.real_quantity !== it.planned_quantity) || it.commentaire)
    .map((it) => {
      const u = it.unit ? ' ' + it.unit : '';
      return {
        key: it.id,
        nom: it.name,
        prev: (it.planned_quantity != null ? fmtNum(it.planned_quantity) : it.planned_text || '') + u,
        reel: it.real_quantity != null ? fmtNum(it.real_quantity) + u : null,
        commentaire: it.commentaire,
      };
    });
  const comms = exec.execution_steps.filter((s) => s.commentaire).map((s) => ({ key: s.id, titre: s.titre, texte: s.commentaire! }));

  return (
    <div id="sec-resume" className="scroll-mt-28 mt-6 border border-outline-variant rounded-xl bg-surface-container-lowest p-6 flex flex-col gap-5">
      <h2 className="font-headline-md text-headline-md text-primary">Résumé de la session</h2>
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
          value={exec.commentaire_global || ''}
          onChange={(ev) => onGlobalComment(ev.target.value)}
          placeholder="Bilan de la session (sauvegardé automatiquement)…"
          className="w-full border border-outline-variant rounded px-3 py-2 font-body-md text-sm bg-surface-container-low focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}
