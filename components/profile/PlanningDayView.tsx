'use client';

// Vue par jour de « Mes fournées » : les étapes de TOUTES les fournées de
// l'utilisateur, regroupées par date réelle (pas par day_offset, relatif à
// chaque fournée) — cf. `groupPlanningStepsByDate`. C'est la vue par défaut
// de l'écran « En cuisine » (décision produit) et ses étapes sont
// directement cochables : `done` est la seule case d'une étape (cf.
// CLAUDE.md « Fournées »), il n'y a plus de session séparée à croiser pour
// savoir si elle est faite.
//
// Le glisser-déposer ne réordonne qu'au sein d'un même jour, entre étapes de
// fournées potentiellement différentes : il n'existe aucun ordre partagé
// entre fournées avant ce geste (`batch_steps.order_index` n'ordonne qu'à
// l'intérieur d'une seule fournée), d'où `day_order_index`, une colonne
// dédiée à cet ordre transverse, nulle tant qu'aucun glisser n'a eu lieu ce
// jour-là.
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatTime } from '@/lib/format';
import { groupPlanningStepsByDate, type PlanningDayGroup } from '@/lib/recipe-plan';
import type { BatchListRow } from '@/lib/profile';

const dateLabel = (iso: string): string =>
  new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

export function PlanningDayView({ plans }: { plans: BatchListRow[] }) {
  const router = useRouter();
  const { mutate, busy } = useMutation();
  const [list, setList] = useState(plans);
  useEffect(() => setList(plans), [plans]);
  const [dragId, setDragId] = useState<number | null>(null);

  // Une étape cochée depuis la fiche d'une fournée (autre page) n'a aucune
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

  const groups = groupPlanningStepsByDate(list);

  // Réordonne les étapes d'UN jour (entre fournées potentiellement
  // différentes) : renumérote l'ensemble des étapes de ce jour plutôt que
  // d'intercaler une seule valeur (même principe que `moveSubstep` dans
  // BatchStepDonePanel), pour que `day_order_index` reste toujours défini pour
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
        batch_steps: p.batch_steps.map((s) => {
          const r = reassigned.find((it) => it.stepId === s.id);
          return r ? { ...s, day_order_index: r.day_order_index } : s;
        }),
      })),
    );
    const supabase = createClient();
    const ok = await mutate(
      async () => {
        const results = await Promise.all(
          reassigned.map((it) => supabase.from('batch_steps').update({ day_order_index: it.day_order_index }).eq('id', it.stepId)),
        );
        const failed = results.find((r) => r.error);
        return failed ? { error: failed.error } : { error: null };
      },
      { errorLabel: 'Réorganisation impossible' },
    );
    if (!ok) setList(prev);
  }

  // Case cochable directement depuis cette vue, sans ouvrir la fournée : une
  // seule source de vérité (`batch_steps.done`), la même que sur la fiche et
  // en mode Cuisiner.
  async function toggleDone(stepId: number, checked: boolean) {
    const prev = list;
    setList((all) => all.map((p) => ({ ...p, batch_steps: p.batch_steps.map((s) => (s.id === stepId ? { ...s, done: checked } : s)) })));
    const ok = await mutate(() => createClient().from('batch_steps').update({ done: checked }).eq('id', stepId), {
      errorLabel: 'Modification non enregistrée',
      refresh: false,
    });
    if (!ok) setList(prev);
  }

  if (groups.length === 0) {
    return (
      <p className="text-on-surface-variant italic">
        Aucune étape à afficher — seules les fournées avec une date de dégustation apparaissent ici.
      </p>
    );
  }

  // Une journée est « terminée » dès que toutes ses étapes sont cochées —
  // peu importe sa date, passée ou non. Regroupées à part, repliées par
  // défaut : pas noyer les jours restants sous un historique qui grossit
  // sans fin.
  const isDone = (g: PlanningDayGroup) => g.items.every((it) => it.done);
  const pendingGroups = groups.filter((g) => !isDone(g));
  const doneGroups = groups.filter(isDone);

  function renderSteps(g: PlanningDayGroup) {
    return (
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
                  <input
                    type="checkbox"
                    checked={it.done}
                    onChange={(e) => toggleDone(it.stepId, e.target.checked)}
                    title={it.done ? 'Marquer comme non faite' : 'Marquer comme faite'}
                    className="w-5 h-5 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0"
                  />
                  <span className="font-label-md text-[11px] text-secondary uppercase tracking-widest shrink-0">{it.recipeTitle}</span>
                  {/* Pas de lien si la fournée a été supprimée depuis
                      (recipeId absent, recipeTitle dénormalisé prend le
                      relais pour l'affichage — cf. CLAUDE.md). */}
                  {(() => {
                    const href = `/fournee/${it.planId}#etape-${it.stepId}`;
                    const numberSpan = <span className={`font-label-md text-label-md shrink-0 ${it.done ? 'text-on-surface-variant line-through opacity-60' : 'text-primary'}`}>{it.number}.</span>;
                    const titleSpan = <span className={`font-body-md ${it.done ? 'text-on-surface-variant line-through opacity-60' : ''}`}>{it.title || 'Étape ' + it.number}</span>;
                    return (
                      <Link href={href} className="flex items-baseline gap-1.5 flex-1 min-w-[160px] hover:underline">
                        {numberSpan}
                        {titleSpan}
                      </Link>
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
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <LoadingOverlay visible={busy || refreshing} label={refreshing ? 'Actualisation…' : 'Réorganisation en cours…'} />
      {pendingGroups.map((g) => (
        <div key={g.date} className="border border-outline-variant rounded-xl bg-surface-container-lowest overflow-hidden">
          <h3 className="font-headline-md text-headline-md text-primary capitalize p-6 pb-4">{dateLabel(g.date)}</h3>
          {renderSteps(g)}
        </div>
      ))}
      {doneGroups.length > 0 && (
        <details className="group border border-outline-variant rounded-xl bg-surface-container-lowest overflow-hidden">
          <summary className="flex items-center justify-between gap-3 p-6 cursor-pointer list-none">
            <span className="font-headline-md text-headline-md text-primary flex items-center gap-3">
              Journées terminées
              <span className="font-label-md text-[11px] bg-green-700 text-white px-2.5 py-1 rounded-full">{doneGroups.length}</span>
            </span>
            <span className="material-symbols-outlined text-on-surface-variant group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="flex flex-col gap-6 pb-2">
            {doneGroups.map((g) => (
              <div key={g.date} className="border-t border-outline-variant/50 first:border-t-0">
                <h4 className="font-headline-md text-[18px] text-primary capitalize px-6 pt-4 pb-2">{dateLabel(g.date)}</h4>
                {renderSteps(g)}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
