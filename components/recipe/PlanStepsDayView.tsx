'use client';

// Bascule d'affichage des étapes d'une recette planifiée : vue séquentielle
// (inchangée, reçue en `children` déjà rendue côté serveur) ou vue par jour
// (nouvelle, ci-dessous) — numéro d'étape, nom, durées, sans le détail
// (ingrédients/sous-étapes/photos, déjà dans la vue séquentielle).
//
// Le glisser-déposer ne réordonne qu'au sein d'un même jour : il permute les
// valeurs d'`order_index` déjà occupées par les étapes de ce jour entre elles,
// sans toucher aux étapes des autres jours — `order_index` est global à tout
// le plan (contrairement à celui des sous-étapes), mais l'appariement
// ingrédients ↔ étape se fait par `plan_ingredients.step_id` (FK), jamais par
// `order_index` (cf. CLAUDE.md), donc cette permutation ne casse rien
// ailleurs. Changer de jour reste le sélecteur existant de
// PlanStepDonePanel — pas de glisser entre jours ici.
import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatTime } from '@/lib/format';
import { dayLabel } from '@/lib/recipe-view';
import { planDayLabel, groupStepsByDay } from '@/lib/recipe-plan';

export type DayViewStep = {
  id: number;
  number: number;
  title: string | null;
  day_offset: number;
  order_index: number;
  prep_time: number | null;
  wait_time: number | null;
  cook_time: number | null;
  cook_temp: number | null;
  fully_done: boolean;
};

export function PlanStepsDayView({ steps, plannedDate, children }: { steps: DayViewStep[]; plannedDate: string | null; children: ReactNode }) {
  const { mutate, busy } = useMutation();
  const [mode, setMode] = useState<'sequentielle' | 'jours'>('sequentielle');
  const [stepList, setStepList] = useState(steps);
  useEffect(() => setStepList(steps), [steps]);
  const [dragId, setDragId] = useState<number | null>(null);

  const groups = groupStepsByDay(stepList);
  const dayText = (offset: number) => (plannedDate ? planDayLabel(offset, plannedDate) : dayLabel(offset));

  async function moveStep(dayOffset: number, fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const group = groups.find((g) => g.offset === dayOffset);
    if (!group) return;
    const values = group.steps.map((s) => s.order_index).sort((a, b) => a - b);
    const sorted = [...group.steps];
    const [moved] = sorted.splice(fromIdx, 1);
    sorted.splice(toIdx, 0, moved);
    const reassigned = sorted.map((s, i) => ({ ...s, order_index: values[i] }));
    const prev = stepList;
    setStepList((all) => all.map((s) => reassigned.find((r) => r.id === s.id) ?? s));
    const supabase = createClient();
    const ok = await mutate(
      async () => {
        const results = await Promise.all(reassigned.map((s) => supabase.from('plan_steps').update({ order_index: s.order_index }).eq('id', s.id)));
        const failed = results.find((r) => r.error);
        return failed ? { error: failed.error } : { error: null };
      },
      { errorLabel: 'Réorganisation impossible' },
    );
    if (!ok) setStepList(prev);
  }

  const tabCls = (active: boolean) =>
    `px-4 py-2 rounded-full font-label-md text-label-md border ${active ? 'bg-primary text-white border-primary' : 'border-outline-variant text-on-surface-variant hover:text-primary'}`;

  return (
    <>
      <LoadingOverlay visible={busy} label="Réorganisation en cours…" />
      <div className="no-print flex items-center gap-2 mb-6">
        <button type="button" onClick={() => setMode('sequentielle')} className={tabCls(mode === 'sequentielle')}>
          Vue séquentielle
        </button>
        <button type="button" onClick={() => setMode('jours')} className={tabCls(mode === 'jours')}>
          Vue par jour
        </button>
      </div>

      <div className={`plan-view-sequentielle${mode !== 'sequentielle' ? ' hidden' : ''}`}>{children}</div>

      {mode === 'jours' && (
        <div className="plan-view-jours flex flex-col gap-8 mb-16">
          {groups.map((g) => (
            <div key={g.offset} className="border border-outline-variant rounded-xl bg-surface-container-lowest p-6">
              <h3 className="font-headline-md text-headline-md text-primary mb-4">{dayText(g.offset)}</h3>
              <ul className="flex flex-col">
                {g.steps.map((s, idx) => {
                  const stepTotal = (s.prep_time || 0) + (s.wait_time || 0) + (s.cook_time || 0);
                  const badges = [
                    s.prep_time ? `PRÉP ${formatTime(s.prep_time).toUpperCase()}` : '',
                    s.wait_time ? `ATTENTE ${formatTime(s.wait_time).toUpperCase()}` : '',
                    s.cook_time
                      ? `CUISSON ${formatTime(s.cook_time).toUpperCase()}${s.cook_temp ? ' · ' + s.cook_temp + ' °C' : ''}`
                      : s.cook_temp
                        ? `CUISSON ${s.cook_temp} °C`
                        : '',
                  ].filter(Boolean);
                  return (
                    <li
                      key={s.id}
                      onDragOver={(e) => {
                        if (dragId === null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        if (dragId === null) return;
                        e.preventDefault();
                        const fromIdx = g.steps.findIndex((x) => x.id === dragId);
                        moveStep(g.offset, fromIdx, idx);
                        setDragId(null);
                      }}
                      className={`flex items-center gap-3 py-2.5 border-b border-outline-variant/30 last:border-0 flex-wrap${dragId === s.id ? ' opacity-50' : ''}`}
                    >
                      <span
                        draggable
                        onDragStart={(e) => {
                          setDragId(s.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => setDragId(null)}
                        title="Glisser pour réordonner cette étape dans sa journée"
                        className="material-symbols-outlined text-[18px] text-outline-variant hover:text-secondary cursor-grab active:cursor-grabbing select-none shrink-0"
                      >
                        drag_indicator
                      </span>
                      <span className={`font-label-md text-label-md text-primary shrink-0${s.fully_done ? ' line-through opacity-60' : ''}`}>{s.number}.</span>
                      <span className={`font-body-md flex-1 min-w-[160px]${s.fully_done ? ' line-through text-on-surface-variant' : ''}`}>
                        {s.title || 'Étape ' + s.number}
                      </span>
                      <div className="flex gap-2 flex-wrap">
                        {badges.map((b, k) => (
                          <span key={k} className="font-label-md text-[11px] bg-surface-variant px-2.5 py-1 whitespace-nowrap">
                            {b}
                          </span>
                        ))}
                        {stepTotal > 0 && (
                          <span className="font-label-md text-[11px] bg-primary text-white px-2.5 py-1 whitespace-nowrap">TOTAL {formatTime(stepTotal).toUpperCase()}</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
