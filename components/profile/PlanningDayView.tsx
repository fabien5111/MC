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
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { groupPlanningStepsByDate, type PlanningDayGroup, type PlanningDayItem } from '@/lib/recipe-plan';
import { LockedAction } from '@/components/LockedAction';
import { BottomSheet } from '@/components/BottomSheet';
import { couleurFournee, grouperConsecutifs, indexDeplacement, tempsEtape } from '@/lib/planning-jour';
import type { BatchListRow } from '@/lib/profile';

const dateLabel = (iso: string): string =>
  new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

// Pas de resynchronisation ici : `CuisineContent`, qui monte toujours cette
// vue, fait déjà un `router.refresh()` à son propre montage (même raison —
// cache client du routeur face à une page `force-dynamic`). En refaire un
// ici doublait chaque arrivée sur « En cuisine » d'un second aller-retour
// serveur identique au premier, pour rien.
export function PlanningDayView({
  plans,
  canReorder = true,
}: {
  plans: BatchListRow[];
  // Droit d'abonnement (`reordonnancement_etapes`). Défaut à `true` pour tout
  // appelant qui ne le passe pas encore.
  canReorder?: boolean;
}) {
  const { mutate, busy } = useMutation();
  const router = useRouter();
  // Distinct de `busy` (qui ne couvre que les écritures de `mutate`) : le
  // renvoi vers la fiche fournée après « je veux laisser un avis » est un
  // `router.push` déclenché par du code, pas un lien — `NavigationSpinner`
  // ne le voit donc pas (cf. CLAUDE.md « Spinner »). Jamais remis à `false` :
  // la navigation démonte ce composant.
  const [navigating, setNavigating] = useState(false);
  const [list, setList] = useState(plans);
  useEffect(() => setList(plans), [plans]);
  const [dragId, setDragId] = useState<number | null>(null);
  // Feuille d'actions d'une étape (sous 1024 px) : Pâtisser, Préparer, et
  // Monter / Descendre dans la journée — le seul moyen de réordonner au doigt.
  const [feuilleId, setFeuilleId] = useState<number | null>(null);
  // Appareil tactile : la poignée de glisser-déposer (HTML5, souris seule) n'y
  // est pas affichée.
  const [tactile, setTactile] = useState(false);
  useEffect(() => {
    try {
      setTactile(window.matchMedia('(pointer: coarse)').matches);
    } catch {
      setTactile(false);
    }
  }, []);
  // Fournées dont la question « toutes les étapes sont cochées » a déjà été
  // posée (acceptée ou refusée) : sans ça, une fournée entièrement cochée
  // mais toujours `planifiee` (refus de la terminer) bascule instantanément
  // dans le groupe replié « Journées terminées » (cf. `fullyDoneBatchIds`
  // ci-dessous), qui repose sur la même condition « toutes les étapes sont
  // cochées ». La case cochée disparaissait alors de la vue au moment même
  // où la question était posée — l'utilisateur la retrouvait décochée en
  // apparence (en fait juste hors de vue) et ne revoyait plus la question au
  // recochage puisqu'elle restait, elle, dans ce groupe replié.
  const [pendingFinish, setPendingFinish] = useState<Set<number>>(new Set());

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

  // Toutes les étapes d'une fournée cochées : plus de question posée sur le
  // coup. Une barre « Fournée prête à être clôturée » (en bas de page) mène à
  // l'écran de fin de fournée, ouvert par `?cloture=1` sur la fournée. Posé
  // avant tout rendu : `fullyDoneBatchIds` exclut cette fournée pour que sa
  // journée ne s'efface pas (cf. déclaration de `pendingFinish`).
  function proposeFinish(batchRow: BatchListRow) {
    setPendingFinish((prev) => new Set(prev).add(batchRow.id));
  }

  function ouvrirCloture(id: number) {
    setNavigating(true);
    router.push(`/fournee/${id}?mode=patisser&cloture=1`);
  }
  const pretes = list.filter((p) => pendingFinish.has(p.id) && p.status === 'planifiee' && p.batch_steps.length > 0 && p.batch_steps.every((s) => s.done));

  // Case cochable directement depuis cette vue, sans ouvrir la fournée : une
  // seule source de vérité (`batch_steps.done`), la même que sur la fiche et
  // en mode Pâtisser.
  async function toggleDone(stepId: number, checked: boolean) {
    const prev = list;
    setList((all) => all.map((p) => ({ ...p, batch_steps: p.batch_steps.map((s) => (s.id === stepId ? { ...s, done: checked } : s)) })));
    const ok = await mutate(() => createClient().from('batch_steps').update({ done: checked }).eq('id', stepId), {
      errorLabel: 'Modification non enregistrée',
      refresh: false,
    });
    if (!ok) {
      setList(prev);
      return;
    }
    if (!checked) return;
    const batchRow = list.find((p) => p.batch_steps.some((s) => s.id === stepId));
    if (!batchRow || batchRow.status !== 'planifiee' || batchRow.batch_steps.length === 0) return;
    const allDone = batchRow.batch_steps.every((s) => (s.id === stepId ? true : s.done));
    if (allDone) proposeFinish(batchRow);
  }

  if (groups.length === 0) {
    return (
      <p className="text-on-surface-variant italic">
        Aucune étape à afficher — seules les fournées avec une date de dégustation apparaissent ici.
      </p>
    );
  }

  // Une journée est « terminée » quand toutes ses étapes sont cochées ET que
  // chaque fournée qui y contribue est elle-même entièrement terminée — pas
  // seulement les étapes tombant ce jour-là. Sans cette deuxième condition,
  // une journée de préparation intermédiaire (dont les étapes sont cochées)
  // basculait en « terminée » alors que la recette continue sur d'autres
  // jours, la faisant disparaître du planning actif à tort.
  const incompletePlanIds = new Set(groups.flatMap((g) => g.items.filter((it) => !it.complete).map((it) => it.planId)));
  const fullyDoneBatchIds = new Set(
    list.filter((p) => p.batch_steps.every((s) => s.done) && !incompletePlanIds.has(p.id) && !pendingFinish.has(p.id)).map((p) => p.id),
  );
  const isDone = (g: PlanningDayGroup) => g.items.every((it) => it.complete && fullyDoneBatchIds.has(it.planId));
  const pendingGroups = groups.filter((g) => !isDone(g));
  const doneGroups = groups.filter(isDone);

  // Étape dont la feuille d'actions est ouverte (sous 1024 px). Relue dans
  // `groups` à chaque rendu : après « Monter » / « Descendre », sa position
  // affichée suit l'état local.
  const feuilleItem = feuilleId === null ? null : groups.flatMap((g) => g.items.map((it, idx) => ({ g, it, idx }))).find((x) => x.it.stepId === feuilleId) ?? null;

  function liens(it: PlanningDayItem) {
    return {
      preparer: `/fournee/${it.planId}?mode=preparer#etape-${it.stepId}`,
      patisser: `/fournee/${it.planId}?mode=patisser#etape-${it.stepId}`,
    };
  }

  function texteTemps(it: PlanningDayItem) {
    const { parties, total } = tempsEtape(it, it.done && !it.complete);
    if (parties.length === 0) return null;
    return (
      <span className="block text-[13px] leading-snug text-on-surface-variant tabular-nums">
        {parties.join(' · ')}
        {total && (
          <>
            {' = '}
            <b className="font-semibold text-primary">{total}</b>
          </>
        )}
      </span>
    );
  }

  function renderStep(g: PlanningDayGroup, it: PlanningDayItem) {
    const idx = g.items.findIndex((x) => x.stepId === it.stepId);
    const { preparer, patisser } = liens(it);
    // `complete` (et non `done`) : une étape « déjà réalisée avant la fournée »
    // qui garde une sous-étape de cuisson n'est pas encore terminée.
    const resteAFaire = it.done && !it.complete;
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
        className={`flex items-center border-b border-outline-variant/30 last:border-0 pr-1${dragId === it.stepId ? ' opacity-50' : ''}`}
      >
        {/* Poignée : souris seulement — le glisser-déposer HTML5 ne fonctionne
            pas au toucher ; au doigt, « Monter / Descendre » sont dans la
            feuille d'actions. */}
        {canReorder && !tactile && (
          <span
            draggable
            onDragStart={(e) => {
              setDragId(it.stepId);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => setDragId(null)}
            title="Glisser pour réordonner cette étape dans sa journée"
            className="no-print material-symbols-outlined -mr-2 text-[18px] text-outline-variant hover:text-secondary cursor-grab active:cursor-grabbing select-none shrink-0"
          >
            drag_indicator
          </span>
        )}
        {/* Case dans une zone de toucher de 44 px. */}
        <label className={`flex h-11 w-11 shrink-0 items-center justify-center ${resteAFaire ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={it.complete}
            disabled={resteAFaire}
            onChange={(e) => toggleDone(it.stepId, e.target.checked)}
            title={
              resteAFaire
                ? 'Il reste une sous-étape à faire : à cocher depuis le mode Pâtisser'
                : it.complete
                  ? 'Marquer comme non faite'
                  : 'Marquer comme faite'
            }
            aria-label={`${it.title || 'Étape ' + it.number} : ${it.complete ? 'marquer comme non faite' : 'marquer comme faite'}`}
            className="h-6 w-6 rounded border-outline accent-primary focus:ring-primary cursor-pointer disabled:cursor-not-allowed"
          />
        </label>
        {/* Toucher la ligne ouvre l'étape en mode Pâtisser. Une étape faite est
            estompée, jamais barrée : elle reste lisible. */}
        <Link href={patisser} title="Ouvrir cette étape en mode Pâtisser" className={`min-w-0 flex-1 py-2 ${it.complete ? 'opacity-60' : ''}`}>
          <span className="block font-body-md text-[16px] font-semibold leading-snug text-on-surface">
            <span className="mr-1 text-secondary tabular-nums">{it.number}.</span>
            {it.title || 'Étape ' + it.number}
          </span>
          {texteTemps(it)}
        </Link>
        {/* Dès 1024 px : les deux modes en accès direct, libellés. */}
        <span className="no-print hidden lg:flex shrink-0 items-center gap-1 pl-2">
          <Link href={preparer} title="Ouvrir cette étape en mode Préparer" className="flex w-14 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-semibold text-primary hover:bg-surface-container">
            <span className="material-symbols-outlined text-[22px]">checklist</span>
            Préparer
          </Link>
          <Link href={patisser} title="Ouvrir cette étape en mode Pâtisser" className="flex w-14 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-semibold text-primary hover:bg-surface-container">
            <span className="material-symbols-outlined text-[22px]">skillet</span>
            Pâtisser
          </Link>
        </span>
        {/* Sous 1024 px : feuille d'actions. */}
        <button
          type="button"
          onClick={() => setFeuilleId(it.stepId)}
          aria-label={`Actions de l'étape ${it.title || it.number}`}
          aria-haspopup="dialog"
          className="no-print flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-primary hover:bg-surface-container lg:hidden"
        >
          <span className="material-symbols-outlined">more_vert</span>
        </button>
      </li>
    );
  }

  // Les étapes consécutives d'une même fournée sous un seul rappel de la
  // recette (`grouperConsecutifs`) : l'ordre de la journée reste celui choisi
  // par le membre, l'en-tête réapparaît si cet ordre alterne entre fournées.
  function renderSteps(g: PlanningDayGroup) {
    return (
      <div className="flex flex-col pb-2">
        {grouperConsecutifs(g.items).map((bloc, k) => {
          const premier = bloc.items[0];
          return (
            <div key={`${bloc.planId}-${k}`}>
              <Link
                href={`/fournee/${bloc.planId}?mode=preparer`}
                title="Ouvrir la fournée"
                className="group/f flex min-h-10 items-center gap-2 px-4 pt-3 pb-0.5 font-label-md text-[12px] uppercase tracking-wider text-secondary"
              >
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: couleurFournee(bloc.planId) }} />
                {premier.projet && (
                  <span className="material-symbols-outlined text-[16px]" title="Projet en cours" aria-label="Projet en cours">
                    construction
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate underline decoration-outline-variant underline-offset-[3px] group-hover/f:decoration-current">
                  {premier.recipeTitleBrut}
                </span>
                <span aria-hidden className="material-symbols-outlined text-[18px]">
                  chevron_right
                </span>
              </Link>
              <ul className="flex flex-col pl-1">{bloc.items.map((it) => renderStep(g, it))}</ul>
            </div>
          );
        })}
      </div>
    );
  }

  // En-tête de jour collant sous l'en-tête du site (`--site-header-h`) : la
  // date reste visible pendant qu'on fait défiler ses étapes. Aucun ancêtre
  // ne doit porter d'`overflow` (il couperait le `sticky`), d'où l'arrondi
  // posé sur l'en-tête plutôt qu'un `overflow-hidden` sur la carte.
  function enteteJour(g: PlanningDayGroup, coin = true) {
    const faites = g.items.filter((it) => it.complete).length;
    return (
      <h3
        className={`sticky top-[var(--site-header-h,72px)] z-10 flex items-baseline justify-between gap-3 border-b border-outline-variant/40 bg-surface-container px-4 py-2${coin ? ' rounded-t-xl' : ''}`}
      >
        <span className="font-headline-md text-[18px] leading-tight text-primary capitalize">{dateLabel(g.date)}</span>
        <span className="shrink-0 text-[12px] text-on-surface-variant tabular-nums" title={`${faites} étape(s) faite(s) sur ${g.items.length}`}>
          {faites}/{g.items.length}
        </span>
      </h3>
    );
  }

  function deplacer(sens: -1 | 1) {
    if (!feuilleItem) return;
    const cible = indexDeplacement(feuilleItem.idx, feuilleItem.g.items.length, sens);
    if (cible === null) return;
    moveStep(feuilleItem.g.date, feuilleItem.idx, cible);
  }

  return (
    <div className="flex flex-col gap-6">
      {pretes.length > 0 && (
        <div className="no-print pointer-events-none fixed inset-x-0 z-[46] flex flex-col items-center gap-2 px-3 bottom-[calc(var(--mobile-nav-h)+12px)] lg:bottom-4">
          {pretes.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => ouvrirCloture(p.id)}
              className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl border border-primary bg-white px-4 py-3 text-left shadow-lg"
            >
              <span className="min-w-0 text-primary">
                <span className="flex items-center gap-2 font-label-md text-label-md">
                  <span className="material-symbols-outlined">flag</span>
                  Fournée prête à être clôturée
                </span>
                <span className="block truncate text-xs text-on-surface-variant">{p.recipe_title}</span>
              </span>
              <span className="shrink-0 rounded-pill bg-primary px-3 py-1.5 text-sm font-label-md text-on-primary">Clôturer</span>
            </button>
          ))}
        </div>
      )}
      <LoadingOverlay visible={busy || navigating} label={navigating ? 'Ouverture de la fournée…' : 'Réorganisation en cours…'} />
      {pendingGroups.map((g) => (
        <section key={g.date} className="rounded-xl border border-outline-variant bg-surface-container-lowest">
          {enteteJour(g)}
          {renderSteps(g)}
        </section>
      ))}
      {doneGroups.length > 0 && (
        <details className="group rounded-xl border border-outline-variant bg-surface-container-lowest">
          <summary className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer list-none">
            <span className="font-headline-md text-[18px] text-primary flex items-center gap-3">
              Journées terminées
              <span className="font-label-md text-[11px] bg-green-700 text-white px-2.5 py-1 rounded-full">{doneGroups.length}</span>
            </span>
            <span className="material-symbols-outlined text-on-surface-variant group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="flex flex-col">
            {doneGroups.map((g) => (
              <div key={g.date} className="border-t border-outline-variant/50">
                {enteteJour(g, false)}
                {renderSteps(g)}
              </div>
            ))}
          </div>
        </details>
      )}
      <BottomSheet open={feuilleItem !== null} onClose={() => setFeuilleId(null)} breakpoint="lg" label="Actions de l'étape">
        {feuilleItem && (
          <div className="flex flex-col gap-1 px-4 pt-2 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-outline-variant" aria-hidden />
            <p className="flex items-center gap-2 font-label-md text-[12px] uppercase tracking-wider text-secondary">
              <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: couleurFournee(feuilleItem.it.planId) }} />
              {feuilleItem.it.projet && <span className="material-symbols-outlined text-[16px]">construction</span>}
              <span className="min-w-0 truncate">{feuilleItem.it.recipeTitleBrut}</span>
            </p>
            <p className="font-headline-md text-[20px] leading-tight text-primary">
              {feuilleItem.it.number}. {feuilleItem.it.title || 'Étape ' + feuilleItem.it.number}
            </p>
            <p className="text-[13px] text-on-surface-variant">
              <span className="capitalize">{dateLabel(feuilleItem.g.date)}</span>
            </p>
            {texteTemps(feuilleItem.it)}
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={liens(feuilleItem.it).patisser}
                className="flex min-h-[52px] items-center gap-3 rounded-2xl bg-primary px-4 font-label-md text-[15px] text-on-primary"
              >
                <span className="material-symbols-outlined">skillet</span>
                <span>
                  Pâtisser cette étape
                  <small className="block font-body-md text-[12px] font-normal opacity-80">Suivre l’étape pas à pas</small>
                </span>
              </Link>
              <Link
                href={liens(feuilleItem.it).preparer}
                className="flex min-h-[52px] items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest px-4 font-label-md text-[15px] text-primary"
              >
                <span className="material-symbols-outlined">checklist</span>
                <span>
                  Préparer cette étape
                  <small className="block font-body-md text-[12px] font-normal opacity-80">Ingrédients, notes, jour de l’étape</small>
                </span>
              </Link>
            </div>
            {feuilleItem.g.items.length > 1 && (
              <div className="mt-4 border-t border-outline-variant/50 pt-3">
                <p className="mb-2 font-label-md text-[12px] uppercase tracking-wider text-on-surface-variant">Ordre dans la journée</p>
                {canReorder ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => deplacer(-1)}
                      disabled={feuilleItem.idx === 0 || busy}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline-variant font-label-md text-[14px] text-primary disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined">arrow_upward</span>
                      Monter
                    </button>
                    <button
                      type="button"
                      onClick={() => deplacer(1)}
                      disabled={feuilleItem.idx === feuilleItem.g.items.length - 1 || busy}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline-variant font-label-md text-[14px] text-primary disabled:opacity-40"
                    >
                      <span className="material-symbols-outlined">arrow_downward</span>
                      Descendre
                    </button>
                  </div>
                ) : (
                  <LockedAction
                    label="Réordonner cette étape dans sa journée"
                    message="Réordonner les étapes d'une journée n'est pas inclus dans votre formule."
                  >
                    <span className="text-[14px]">Monter / Descendre</span>
                  </LockedAction>
                )}
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
