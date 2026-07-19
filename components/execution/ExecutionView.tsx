'use client';

// Écran d'exécution guidé par jalons (porté de execution.html) : mise en place
// optionnelle, jalons en accordéon avec étapes à cocher (sous-étapes,
// ingrédients avec quantité réellement utilisée), tempo vs heure de
// dégustation, wake lock, résumé de fin de session. Persistance immédiate du
// snapshot JSON à chaque interaction (autonome — n'affecte plus jamais la
// recette ni le planning une fois créé).
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { formatTime } from '@/lib/format';
import type { Execution } from '@/lib/executions';
import type { ExecutionSnapshot, ExecStep, ExecJalon, ExecSousEtape } from '@/lib/recipe-plan';
import type { Json } from '@/lib/database.types';

const MIN = 60000;
const numify = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const fmtNum = (n: number): string => String(+(+n).toFixed(2)).replace('.', ',');
const stepDur = (e: ExecStep) => (e.prep || 0) + (e.attente || 0) + (e.cuisson || 0);
const jalonDur = (j: ExecJalon) => (j.etapes || []).reduce((n, e) => n + stepDur(e), 0);
const fmtHeure = (d: Date) => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtJour = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const STATUS_LBL: Record<string, string> = { en_cours: 'En cours', terminee: 'Terminée', abandonnee: 'Abandonnée' };
const LBL_CLS = 'font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant';

// Sous-étapes : la description est découpée sur les tirets « - » (un par ligne).
function subSteps(description: string): string[] {
  return description
    .split(/(?:^|(?<=\s))[-•]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function withStep(snapshot: ExecutionSnapshot, ji: number, ei: number, patch: (e: ExecStep) => ExecStep): ExecutionSnapshot {
  return { ...snapshot, jalons: snapshot.jalons.map((j, i) => (i !== ji ? j : { ...j, etapes: j.etapes.map((e, k) => (k !== ei ? e : patch(e))) })) };
}

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
}: {
  exec: Execution;
  prevComments: Record<number, { date: string; texte: string }[]>;
  lecture: boolean;
}) {
  const router = useRouter();
  const [exec, setExec] = useState(initialExec);
  const readOnly = exec.status !== 'en_cours' || lecture;
  const commentTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const globalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

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

  async function persistSnapshot(next: ExecutionSnapshot) {
    setExec((prev) => ({ ...prev, snapshot: next }));
    const { error } = await createClient().from('executions').update({ snapshot: next as unknown as Json }).eq('id', exec.id);
    if (error) alert('Sauvegarde impossible : ' + error.message);
  }

  function toggleStep(ji: number, ei: number, checked: boolean) {
    const next = withStep(exec.snapshot, ji, ei, (e) => ({ ...e, faite: checked, date_faite: checked ? new Date().toISOString() : null }));
    persistSnapshot(next);
    if (checked) {
      setTimeout(() => document.querySelector('[data-step-pending]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  }

  function toggleSub(ji: number, ei: number, si: number, checked: boolean) {
    const next = withStep(exec.snapshot, ji, ei, (e) => {
      let sousEtapes: ExecSousEtape[] = Array.isArray(e.sous_etapes) && e.sous_etapes[si] ? e.sous_etapes : subSteps(e.description).map((t) => ({ texte: t, fait: false }));
      sousEtapes = sousEtapes.map((s, k) => (k !== si ? s : { ...s, fait: checked }));
      return { ...e, sous_etapes: sousEtapes };
    });
    persistSnapshot(next);
  }

  function toggleIng(ji: number, ei: number, ii: number, checked: boolean) {
    const next = withStep(exec.snapshot, ji, ei, (e) => ({ ...e, ingredients: e.ingredients.map((ing, k) => (k !== ii ? ing : { ...ing, fait: checked })) }));
    persistSnapshot(next);
  }

  function setIngReal(ji: number, ei: number, ii: number, value: string) {
    const next = withStep(exec.snapshot, ji, ei, (e) => ({
      ...e,
      ingredients: e.ingredients.map((ing, k) => (k !== ii ? ing : { ...ing, quantite_reelle: numify(value) })),
    }));
    persistSnapshot(next);
  }

  function onStepComment(ji: number, ei: number, value: string) {
    const next = withStep(exec.snapshot, ji, ei, (e) => ({ ...e, commentaire: value }));
    setExec((prev) => ({ ...prev, snapshot: next }));
    const key = `${ji}-${ei}`;
    clearTimeout(commentTimers.current[key]);
    commentTimers.current[key] = setTimeout(async () => {
      const { error } = await createClient().from('executions').update({ snapshot: next as unknown as Json }).eq('id', exec.id);
      if (error) alert('Sauvegarde impossible : ' + error.message);
    }, 800);
  }

  function toggleMep(kind: 'ustensiles' | 'ingredients', i: number, checked: boolean) {
    const mep = exec.snapshot.mise_en_place;
    const next: ExecutionSnapshot = { ...exec.snapshot, mise_en_place: { ...mep, [kind]: mep[kind].map((it, k) => (k !== i ? it : { ...it, fait: checked })) } };
    persistSnapshot(next);
  }

  function mepDone() {
    const next: ExecutionSnapshot = { ...exec.snapshot, mise_en_place: { ...exec.snapshot.mise_en_place, passee: true } };
    persistSnapshot(next);
    window.scrollTo(0, 0);
  }

  function onGlobalComment(value: string) {
    setExec((prev) => ({ ...prev, commentaire_global: value }));
    clearTimeout(globalTimer.current ?? undefined);
    globalTimer.current = setTimeout(async () => {
      const { error } = await createClient().from('executions').update({ commentaire_global: value }).eq('id', exec.id);
      if (error) alert('Sauvegarde impossible : ' + error.message);
    }, 800);
  }

  async function endSession(status: 'terminee' | 'abandonnee', message: string) {
    if (!confirm(message)) return;
    const fin = new Date().toISOString();
    const { error } = await createClient().from('executions').update({ status, date_fin: fin }).eq('id', exec.id);
    if (error) {
      alert('Erreur : ' + error.message);
      return;
    }
    setExec((prev) => ({ ...prev, status, date_fin: fin }));
    wakeLock.current?.release?.().catch(() => {});
    window.scrollTo(0, 0);
  }

  const s = exec.snapshot;
  const deg = exec.degustation_at
    ? new Date(exec.degustation_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null;
  const nbEtapes = (s.jalons || []).reduce((n, j) => n + (j.etapes || []).length, 0);
  const meta = [deg ? `Dégustation prévue ${deg}` : '', `${(s.jalons || []).length} jalon${(s.jalons || []).length > 1 ? 's' : ''} · ${nbEtapes} étape${nbEtapes > 1 ? 's' : ''}`]
    .filter(Boolean)
    .join(' — ');

  const showMep = exec.status === 'en_cours' && !lecture && !s.mise_en_place?.passee && ((s.mise_en_place?.ustensiles || []).length > 0 || (s.mise_en_place?.ingredients || []).length > 0);

  return (
    <>
      <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
        <h1 className="font-headline-lg text-headline-lg-mobile text-primary">{s.titre || 'Session de préparation'}</h1>
        <span className="font-label-md text-[12px] px-3 py-1 rounded-full bg-secondary/90 text-white">{STATUS_LBL[exec.status] || exec.status}</span>
      </div>
      <p className="text-on-surface-variant text-sm mb-6">{meta}</p>

      <div className="flex flex-col gap-6">
        {showMep ? (
          <MiseEnPlace snapshot={s} onToggle={toggleMep} onDone={mepDone} />
        ) : (
          <ExecutionBody exec={exec} readOnly={readOnly} prevComments={prevComments} onToggleStep={toggleStep} onToggleSub={toggleSub} onToggleIng={toggleIng} onIngReal={setIngReal} onStepComment={onStepComment} />
        )}
      </div>

      {exec.status !== 'en_cours' && !showMep && <SummaryPanel exec={exec} lecture={lecture} onGlobalComment={onGlobalComment} />}

      {exec.status === 'en_cours' && !lecture && !showMep && (
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
          </div>
        </div>
      )}
    </>
  );
}

function MiseEnPlace({
  snapshot,
  onToggle,
  onDone,
}: {
  snapshot: ExecutionSnapshot;
  onToggle: (kind: 'ustensiles' | 'ingredients', i: number, checked: boolean) => void;
  onDone: () => void;
}) {
  const mep = snapshot.mise_en_place;
  const items = (kind: 'ustensiles' | 'ingredients', arr: typeof mep.ustensiles) =>
    arr.map((it, i) => (
      <li key={i} className="flex items-center gap-3 py-2.5 border-b border-outline-variant/30">
        <input
          type="checkbox"
          checked={!!it.fait}
          onChange={(e) => onToggle(kind, i, e.target.checked)}
          className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0"
        />
        <span className={`font-body-md flex-1${it.fait ? ' line-through opacity-50' : ''}`}>{it.nom}</span>
        {it.quantite != null && it.quantite !== '' && (
          <span className={`font-label-md text-label-md text-primary whitespace-nowrap${it.fait ? ' line-through opacity-50' : ''}`}>
            {[typeof it.quantite === 'number' ? fmtNum(it.quantite) : it.quantite, it.unite].filter(Boolean).join(' ')}
          </span>
        )}
      </li>
    ));
  return (
    <div className="border border-primary rounded-xl bg-surface-container-lowest p-6">
      <h2 className="font-headline-md text-headline-md text-primary mb-1">Mise en place</h2>
      <p className="text-on-surface-variant text-sm mb-6">Vérifiez que tout est prêt — ou passez directement à la recette.</p>
      {(mep.ustensiles || []).length > 0 && (
        <>
          <p className={`${LBL_CLS} mb-1`}>Ustensiles</p>
          <ul className="mb-6">{items('ustensiles', mep.ustensiles)}</ul>
        </>
      )}
      {(mep.ingredients || []).length > 0 && (
        <>
          <p className={`${LBL_CLS} mb-1`}>Ingrédients</p>
          <ul className="mb-6">{items('ingredients', mep.ingredients)}</ul>
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
  readOnly,
  prevComments,
  onToggleStep,
  onToggleSub,
  onToggleIng,
  onIngReal,
  onStepComment,
}: {
  exec: Execution;
  readOnly: boolean;
  prevComments: Record<number, { date: string; texte: string }[]>;
  onToggleStep: (ji: number, ei: number, checked: boolean) => void;
  onToggleSub: (ji: number, ei: number, si: number, checked: boolean) => void;
  onToggleIng: (ji: number, ei: number, ii: number, checked: boolean) => void;
  onIngReal: (ji: number, ei: number, ii: number, value: string) => void;
  onStepComment: (ji: number, ei: number, value: string) => void;
}) {
  const s = exec.snapshot;
  const jalons = s.jalons || [];
  const all = jalons.flatMap((j) => j.etapes || []);
  const done = all.filter((e) => e.faite).length;
  const curIdx = jalons.findIndex((j) => (j.etapes || []).some((e) => !e.faite));
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
    const j = jalons.find((x) => (x.etapes || []).some((e) => !e.faite));
    if (!j) return null;
    const target = jalonTarget(j);
    if (!target) return null;
    const doneMin = j.etapes.filter((e) => e.faite).reduce((n, e) => n + stepDur(e), 0);
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
        const jDone = (j.etapes || []).every((e) => e.faite);
        const isCurrent = ji === curIdx;
        const dt = jalonDate(j);
        const target = jalonTarget(j);
        return (
          <details
            key={ji}
            open={isCurrent || (readOnly && !jDone)}
            className={`rounded-xl border ${isCurrent ? 'border-primary shadow-md' : 'border-outline-variant'} bg-surface-container-lowest overflow-hidden`}
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
                  {formatTime(jalonDur(j))} de travail · {(j.etapes || []).filter((e) => e.faite).length}/{(j.etapes || []).length} étape
                  {(j.etapes || []).length > 1 ? 's' : ''}
                </span>
              </span>
              <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
            </summary>
            <div className="p-4 flex flex-col gap-4">
              {(j.etapes || []).map((e, ei) => {
                const isPending = !pendingMarked && !e.faite;
                if (isPending) pendingMarked = true;
                return (
                  <StepCard
                    key={e.id}
                    ji={ji}
                    ei={ei}
                    step={e}
                    readOnly={readOnly}
                    isPending={isPending}
                    prevComments={prevComments[e.id] || []}
                    onToggleStep={onToggleStep}
                    onToggleSub={onToggleSub}
                    onToggleIng={onToggleIng}
                    onIngReal={onIngReal}
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
  ji,
  ei,
  step: e,
  readOnly,
  isPending,
  prevComments,
  onToggleStep,
  onToggleSub,
  onToggleIng,
  onIngReal,
  onStepComment,
}: {
  ji: number;
  ei: number;
  step: ExecStep;
  readOnly: boolean;
  isPending: boolean;
  prevComments: { date: string; texte: string }[];
  onToggleStep: (ji: number, ei: number, checked: boolean) => void;
  onToggleSub: (ji: number, ei: number, si: number, checked: boolean) => void;
  onToggleIng: (ji: number, ei: number, ii: number, checked: boolean) => void;
  onIngReal: (ji: number, ei: number, ii: number, value: string) => void;
  onStepComment: (ji: number, ei: number, value: string) => void;
}) {
  const badges = [
    e.prep ? `PRÉP ${formatTime(e.prep).toUpperCase()}` : '',
    e.attente ? `ATTENTE ${formatTime(e.attente).toUpperCase()}` : '',
    e.cuisson ? `CUISSON ${formatTime(e.cuisson).toUpperCase()}${e.temperature ? ' · ' + e.temperature + ' °C' : ''}` : e.temperature ? `CUISSON ${e.temperature} °C` : '',
  ].filter(Boolean);

  const parts: { texte: string; fait: boolean }[] | null = Array.isArray(e.sous_etapes) && e.sous_etapes.length ? e.sous_etapes : e.description && subSteps(e.description).length > 1 ? subSteps(e.description).map((t) => ({ texte: t, fait: false })) : null;

  return (
    <div className={`border border-outline-variant rounded-lg bg-white overflow-hidden${e.faite ? ' opacity-70' : ''}`} data-step-pending={isPending ? '' : undefined}>
      <label className="flex items-start gap-4 p-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={e.faite}
          disabled={readOnly}
          onChange={(ev) => onToggleStep(ji, ei, ev.target.checked)}
          className="w-8 h-8 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
        />
        <span className="flex-1 min-w-0">
          <span className={`font-headline-md text-[20px] text-primary block${e.faite ? ' line-through' : ''}`}>{e.titre}</span>
          <span className="text-[12px] font-label-md text-on-surface-variant">{badges.join(' · ')}</span>
        </span>
      </label>

      {e.ingredients.length > 0 && (
        <ul className="px-4 pb-2">
          {e.ingredients.map((ing, ii) => {
            const prevTxt = [typeof ing.quantite_prevue === 'number' ? fmtNum(ing.quantite_prevue) : ing.quantite_prevue || '', ing.unite].filter(Boolean).join(' ');
            const struck = ing.fait ? ' line-through opacity-50' : '';
            return (
              <li key={ii} className="flex items-center gap-3 py-2.5 border-b border-outline-variant/30">
                <input
                  type="checkbox"
                  checked={ing.fait}
                  disabled={readOnly}
                  onChange={(ev) => onToggleIng(ji, ei, ii, ev.target.checked)}
                  className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0"
                />
                <span className={`font-body-md flex-1 min-w-0${struck}`}>{ing.nom}</span>
                <span className={`font-label-md text-label-md text-on-surface-variant whitespace-nowrap${struck}`}>prévu {prevTxt}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  inputMode="decimal"
                  placeholder="réel"
                  disabled={readOnly}
                  defaultValue={ing.quantite_reelle != null ? ing.quantite_reelle : ''}
                  onBlur={(ev) => onIngReal(ji, ei, ii, ev.target.value)}
                  className="border border-outline-variant rounded px-2 py-1.5 font-body-md text-sm text-center"
                  style={{ width: '5rem' }}
                />
                <span className="text-sm text-on-surface-variant">{ing.unite || ''}</span>
              </li>
            );
          })}
        </ul>
      )}

      {parts ? (
        <ul className="px-4 pb-3 flex flex-col gap-4">
          {parts.map((p, si) => (
            <li key={si} className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={!!p.fait}
                disabled={readOnly}
                onChange={(ev) => onToggleSub(ji, ei, si, ev.target.checked)}
                className="w-6 h-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0 mt-0.5"
              />
              <span className={`font-body-md text-body-md leading-relaxed${p.fait ? ' line-through opacity-50' : ''}`}>{p.texte}</span>
            </li>
          ))}
        </ul>
      ) : (
        e.description && <div className="px-4 pb-3 font-body-md text-body-md leading-relaxed text-on-surface whitespace-pre-line">{e.description}</div>
      )}

      {e.tips && (
        <div className="mx-4 mb-3 p-3 bg-primary/5 border-l-4 border-primary rounded">
          <p className="font-label-md text-[11px] uppercase tracking-widest text-primary mb-1">Conseils &amp; astuces</p>
          <div className="font-body-md text-sm italic whitespace-pre-line">{e.tips}</div>
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
          placeholder="Commentaire sur cette étape (sauvegardé automatiquement)…"
          disabled={readOnly}
          value={e.commentaire || ''}
          onChange={(ev) => onStepComment(ji, ei, ev.target.value)}
          className="w-full border border-outline-variant rounded px-3 py-2 font-body-md text-sm bg-surface-container-low focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}

function SummaryPanel({ exec, lecture, onGlobalComment }: { exec: Execution; lecture: boolean; onGlobalComment: (v: string) => void }) {
  function jalonDate(j: ExecJalon): Date | null {
    if (!exec.degustation_at) return null;
    const d = new Date(exec.degustation_at);
    d.setDate(d.getDate() - (j.offset || 0));
    return d;
  }
  const s = exec.snapshot;
  const all = (s.jalons || []).flatMap((j) => j.etapes || []);
  const done = all.filter((e) => e.faite).length;
  const duree = exec.date_fin ? fmtDuree(+new Date(exec.date_fin) - +new Date(exec.date_debut)) : '—';
  const jalonRows = (s.jalons || []).map((j, ji) => {
    const label = j.offset > 0 ? `Jour J − ${j.offset}` : 'Jour J';
    if (!(j.etapes || []).length) return null;
    if (!(j.etapes || []).every((e) => e.faite)) return <li key={ji}>{label} : <span className="text-on-surface-variant">non terminé</span></li>;
    const dates = j.etapes.filter((e) => e.date_faite).map((e) => new Date(e.date_faite!).getTime());
    if (!dates.length) return <li key={ji}>{label} : terminé</li>;
    const last = new Date(Math.max(...dates));
    const deadline = jalonDate(j);
    const diff = deadline ? Math.round((+last - +deadline) / MIN) : null;
    return (
      <li key={ji}>
        {label} : terminé le {fmtJour(last)} à {fmtHeure(last)}
        {diff != null && (diff <= 0 ? <> — <span className="text-green-700 font-bold">dans les temps</span></> : <> — <span className="text-error font-bold">en retard de {formatTime(diff)}</span></>)}
      </li>
    );
  });
  const ecarts: { key: string; nom: string; prev: string; reel: string }[] = [];
  (s.jalons || []).forEach((j) =>
    (j.etapes || []).forEach((e) =>
      (e.ingredients || []).forEach((i, k) => {
        if (i.quantite_reelle != null && numify(i.quantite_prevue) !== i.quantite_reelle) {
          const u = i.unite ? ' ' + i.unite : '';
          ecarts.push({ key: `${e.id}-${k}`, nom: i.nom, prev: (typeof i.quantite_prevue === 'number' ? fmtNum(i.quantite_prevue) : i.quantite_prevue) + u, reel: fmtNum(i.quantite_reelle) + u });
        }
      }),
    ),
  );
  const comms: { key: string; titre: string; texte: string }[] = [];
  (s.jalons || []).forEach((j) =>
    (j.etapes || []).forEach((e) => {
      if (e.commentaire) comms.push({ key: String(e.id), titre: e.titre, texte: e.commentaire });
    }),
  );

  return (
    <div className="mt-6 border border-outline-variant rounded-xl bg-surface-container-lowest p-6 flex flex-col gap-5">
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
          <p className={`${LBL_CLS} mb-1`}>Écarts de quantités</p>
          <ul className="text-sm flex flex-col gap-1">
            {ecarts.map((e) => (
              <li key={e.key}>
                {e.nom} : prévu {e.prev} → utilisé <span className="font-bold text-primary">{e.reel}</span>
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
