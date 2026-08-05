'use client';

// Vue par jour de l'onglet Planning (Profil) : les étapes de TOUTES les
// recettes planifiées de l'utilisateur, regroupées par date réelle (pas par
// day_offset, relatif à chaque recette) — cf. `groupPlanningStepsByDate`.
//
// Le glisser-déposer ne réordonne qu'au sein d'un même jour, entre étapes de
// recettes potentiellement différentes : il n'existe aucun ordre partagé
// entre plans avant ce geste (`plan_steps.order_index` n'ordonne qu'à
// l'intérieur d'un seul plan), d'où `day_order_index`, une colonne dédiée à
// cet ordre transverse, nulle tant qu'aucun glisser n'a eu lieu ce jour-là.
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatTime } from '@/lib/format';
import { groupPlanningStepsByDate } from '@/lib/recipe-plan';
import type { PlanningRow } from '@/lib/profile';
import type { RunningExecStep } from '@/lib/executions';

const dateLabel = (iso: string): string =>
  new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export function PlanningDayView({
  plans,
  runningExecSteps,
}: {
  plans: PlanningRow[];
  // Sessions en cours de l'utilisateur, indexées par plan_step_id — pour
  // faire pointer le lien de chaque étape vers sa session active plutôt que
  // vers la fiche recette planifiée, quand une session est en cours.
  runningExecSteps: Record<number, RunningExecStep[]>;
}) {
  const router = useRouter();
  const { mutate, busy } = useMutation();
  const [list, setList] = useState(plans);
  useEffect(() => setList(plans), [plans]);
  const [dragId, setDragId] = useState<number | null>(null);

  // Une étape cochée depuis l'écran d'exécution (autre page) n'a aucune
  // raison d'invalidater le cache de navigation client de cette page-ci —
  // resynchronisation explicite à chaque arrivée sur cette vue, quel que
  // soit le chemin (chargement direct, bascule d'onglet, retour arrière).
  // `useTransition` permet d'afficher le spinner pendant l'attente : sans
  // lui, l'écran affiche d'abord les données encore en cache puis se corrige
  // silencieusement à l'arrivée de la réponse, ce qui se voit comme un saut.
  const [refreshing, startRefresh] = useTransition();
  useEffect(() => {
    startRefresh(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = groupPlanningStepsByDate(list, runningExecSteps);

  // Réordonne les étapes d'UN jour (entre recettes potentiellement
  // différentes) : renumérote l'ensemble des étapes de ce jour plutôt que
  // d'intercaler une seule valeur (même principe que `moveSubstep` dans
  // PlanStepDonePanel), pour que `day_order_index` reste toujours défini pour
  // tout le monde une fois qu'on a touché à ce jour.
  async function moveStep(date: string, fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return;
    const group = groups.find((g) => g.date === date);
    if (!group) return;
    const sorted = [...group.items];
    const [moved] = sorted.splice(fromIdx, 1);
    sorted.splice(toIdx, 0, moved);
    const reassigned = sorted.map((it, i) => ({ stepId: it.stepId, day_order_index: i }));
    const prev = list;
    setList((all) =>
      all.map((p) => ({
        ...p,
        plan_steps: p.plan_steps.map((s) => {
          const r = reassigned.find((it) => it.stepId === s.id);
          return r ? { ...s, day_order_index: r.day_order_index } : s;
        }),
      })),
    );
    const supabase = createClient();
    const ok = await mutate(
      async () => {
        const results = await Promise.all(
          reassigned.map((it) => supabase.from('plan_steps').update({ day_order_index: it.day_order_index }).eq('id', it.stepId)),
        );
        const failed = results.find((r) => r.error);
        return failed ? { error: failed.error } : { error: null };
      },
      { errorLabel: 'Réorganisation impossible' },
    );
    if (!ok) setList(prev);
  }

  if (groups.length === 0) {
    return (
      <p className="text-on-surface-variant italic">
        Aucune étape à afficher — seules les recettes planifiées avec une date de dégustation apparaissent ici.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <LoadingOverlay visible={busy || refreshing} label={refreshing ? 'Actualisation…' : 'Réorganisation en cours…'} />
      {groups.map((g) => {
        // Journée entièrement traitée (peu importe la date, passée ou non) :
        // repliée par défaut derrière son en-tête, comme les autres volets
        // dépliables de l'appli (ingrédients, jalons d'exécution…) — pour ne
        // pas noyer les jours restants sous un historique qui grossit.
        const allDone = g.items.every((it) => it.already_done || it.sessionDone);
        return (
          <details key={g.date} open={!allDone} className="group border border-outline-variant rounded-xl bg-surface-container-lowest overflow-hidden">
            <summary className="flex items-center justify-between gap-3 p-6 cursor-pointer list-none">
              <h3 className="font-headline-md text-headline-md text-primary capitalize">{dateLabel(g.date)}</h3>
              <span className="flex items-center gap-3 shrink-0">
                {allDone && (
                  <span className="font-label-md text-[11px] bg-green-700 text-white px-2.5 py-1 rounded-full whitespace-nowrap">Terminée</span>
                )}
                <span className="material-symbols-outlined text-on-surface-variant group-open:rotate-180 transition-transform">expand_more</span>
              </span>
            </summary>
          <ul className="flex flex-col px-6 pb-6">
            {g.items.map((it, idx) => {
              const stepTotal = (it.prep_time || 0) + (it.wait_time || 0) + (it.cook_time || 0);
              const badges = [
                it.prep_time ? `PRÉP ${formatTime(it.prep_time).toUpperCase()}` : '',
                it.wait_time ? `ATTENTE ${formatTime(it.wait_time).toUpperCase()}` : '',
                it.cook_time
                  ? `CUISSON ${formatTime(it.cook_time).toUpperCase()}${it.cook_temp ? ' · ' + it.cook_temp + ' °C' : ''}`
                  : it.cook_temp
                    ? `CUISSON ${it.cook_temp} °C`
                    : '',
              ].filter(Boolean);
              return (
                <li
                  key={it.stepId}
                  onDragOver={(e) => {
                    if (dragId === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    if (dragId === null) return;
                    e.preventDefault();
                    const fromIdx = g.items.findIndex((x) => x.stepId === dragId);
                    moveStep(g.date, fromIdx, idx);
                    setDragId(null);
                  }}
                  className={`flex items-center gap-3 py-2.5 border-b border-outline-variant/30 last:border-0 flex-wrap${dragId === it.stepId ? ' opacity-50' : ''}`}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDragId(it.stepId);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDragId(null)}
                    title="Glisser pour réordonner cette étape dans sa journée"
                    className="material-symbols-outlined text-[18px] text-outline-variant hover:text-secondary cursor-grab active:cursor-grabbing select-none shrink-0"
                  >
                    drag_indicator
                  </span>
                  <span className="font-label-md text-[11px] text-secondary uppercase tracking-widest shrink-0">{it.recipeTitle}</span>
                  {/* Priorité à la session active si elle existe (l'étape s'y
                      exécute réellement) ; sinon la fiche recette planifiée ;
                      pas de lien si la recette a été supprimée depuis
                      (recipeId absent, recipeTitle dénormalisé prend le
                      relais pour l'affichage — cf. CLAUDE.md). */}
                  {(() => {
                    const href = it.executionId
                      ? `/execution/${it.executionId}#etape-${it.executionStepId}`
                      : it.recipeId
                        ? `/recette/${it.recipeId}?plan=${it.planId}#sec-etape-${it.number}`
                        : null;
                    // Barrée si déjà marquée « Déjà réalisé » sur le plan, ou
                    // si cochée dans sa session de préparation active — deux
                    // façons distinctes d'arriver au même constat.
                    const done = it.already_done || it.sessionDone;
                    const numberSpan = <span className={`font-label-md text-label-md shrink-0 ${done ? 'text-on-surface-variant line-through opacity-60' : 'text-primary'}`}>{it.number}.</span>;
                    const titleSpan = <span className={`font-body-md ${done ? 'text-on-surface-variant line-through opacity-60' : ''}`}>{it.title || 'Étape ' + it.number}</span>;
                    return href ? (
                      <Link href={href} className="flex items-baseline gap-1.5 flex-1 min-w-[160px] hover:underline">
                        {numberSpan}
                        {titleSpan}
                      </Link>
                    ) : (
                      <span className="flex items-baseline gap-1.5 flex-1 min-w-[160px]">
                        {numberSpan}
                        {titleSpan}
                      </span>
                    );
                  })()}
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
          </details>
        );
      })}
    </div>
  );
}
