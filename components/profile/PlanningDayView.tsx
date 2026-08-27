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
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatTime } from '@/lib/format';
import { groupPlanningStepsByDate, type PlanningDayGroup } from '@/lib/recipe-plan';
import type { BatchListRow } from '@/lib/profile';

const dateLabel = (iso: string): string =>
  new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

// Pas de resynchronisation ici : `CuisineContent`, qui monte toujours cette
// vue, fait déjà un `router.refresh()` à son propre montage (même raison —
// cache client du routeur face à une page `force-dynamic`). En refaire un
// ici doublait chaque arrivée sur « En cuisine » d'un second aller-retour
// serveur identique au premier, pour rien.
export function PlanningDayView({ plans }: { plans: BatchListRow[] }) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
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

  // Un avis existe-t-il déjà pour cette recette, déposé depuis une AUTRE
  // fournée ? Même condition que `reviewEligible` dans BatchView, lue
  // directement sur `comments` : la RLS n'y autorise un membre qu'à voir SA
  // PROPRE ligne (quel que soit son statut) ou les lignes `approved` de tout
  // le monde — filtrer par `user_id` donne donc bien « mon » avis, jamais
  // celui d'un autre. Best-effort : une erreur ou un réseau indisponible ne
  // doit pas empêcher de proposer l'avis, seulement risquer de le proposer à
  // tort une fois.
  async function alreadyReviewed(recipeId: string, batchId: number): Promise<boolean> {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (!userId) return false;
    const { data, error } = await supabase.from('comments').select('batch_id').eq('recipe_id', recipeId).eq('user_id', userId).maybeSingle();
    if (error) return false;
    return !!data && data.batch_id !== batchId;
  }

  // Propose de terminer la fournée dès que toutes SES étapes sont cochées
  // (toutes fournées confondues sur cet écran, pas seulement celles du jour
  // affiché) puis, si un avis est encore possible sur la recette d'origine,
  // de laisser une note et un commentaire — mêmes actions et messages que
  // `BatchView.proposeFinish` (mode Cuisiner d'une fournée).
  async function proposeFinish(batchRow: BatchListRow) {
    // Posé avant même la confirmation : la question apparaît sur le même
    // rendu que la case tout juste cochée, donc `fullyDoneBatchIds` doit déjà
    // exclure cette fournée pour que sa journée ne s'efface pas sous le
    // dialogue (cf. déclaration de `pendingFinish` plus haut).
    setPendingFinish((prev) => new Set(prev).add(batchRow.id));
    const wantsFinish = await dialog.confirm('Toutes les étapes sont cochées ! Souhaitez-vous marquer cette fournée comme terminée ?');
    if (!wantsFinish) {
      dialog.alert('Pas de souci : vous pourrez la marquer comme terminée à tout moment depuis le menu.');
      return;
    }
    const ok = await mutate(() => createClient().from('batches').update({ status: 'terminee', date_fin: new Date().toISOString() }).eq('id', batchRow.id), {
      errorLabel: 'Fin de la fournée impossible',
    });
    if (!ok) {
      // Échec de l'écriture : redevient une fournée « tout coché » ordinaire,
      // qui reproposera la question au prochain cochage.
      setPendingFinish((prev) => {
        const next = new Set(prev);
        next.delete(batchRow.id);
        return next;
      });
      return;
    }
    setList((prev) => prev.filter((p) => p.id !== batchRow.id));
    if (!batchRow.recipe_id || (await alreadyReviewed(batchRow.recipe_id, batchRow.id))) return;
    const wantsReview = await dialog.confirm('Souhaitez-vous laisser une note et un commentaire sur cette recette ?');
    if (wantsReview) {
      setNavigating(true);
      router.push(`/fournee/${batchRow.id}?mode=preparer#sec-avis`);
    } else {
      dialog.alert('Pas de souci, vous pourrez laisser votre avis plus tard depuis cette fournée.');
    }
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
  const fullyDoneBatchIds = new Set(
    list.filter((p) => p.batch_steps.every((s) => s.done) && !pendingFinish.has(p.id)).map((p) => p.id),
  );
  const isDone = (g: PlanningDayGroup) => g.items.every((it) => it.done && fullyDoneBatchIds.has(it.planId));
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
                  className={`flex flex-col gap-1.5 py-2.5 border-b border-outline-variant/30 last:border-0${dragId === it.stepId ? ' opacity-50' : ''}`}
                >
                  {/* Trois lignes fixes, sur tous les appareils (pas
                      seulement un repli mobile) : nom de la recette, nom de
                      l'étape (case à cocher collée devant, jamais solidaire
                      du titre de la recette au-dessus), puis le temps. */}
                  <div className="flex items-center gap-2">
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
                    <Link
                      href={`/fournee/${it.planId}?mode=preparer`}
                      className="font-label-md text-[11px] text-secondary uppercase tracking-widest hover:underline"
                    >
                      {it.recipeTitle}
                    </Link>
                  </div>
                  {(() => {
                    const href = `/fournee/${it.planId}#etape-${it.stepId}`;
                    const numberSpan = <span className={`font-label-md text-label-md shrink-0 ${it.done ? 'text-on-surface-variant line-through opacity-60' : 'text-primary'}`}>{it.number}.</span>;
                    const titleSpan = <span className={`font-body-md ${it.done ? 'text-on-surface-variant line-through opacity-60' : ''}`}>{it.title || 'Étape ' + it.number}</span>;
                    return (
                      <div className="flex items-center gap-1.5 pl-[26px]">
                        <input
                          type="checkbox"
                          checked={it.done}
                          onChange={(e) => toggleDone(it.stepId, e.target.checked)}
                          title={it.done ? 'Marquer comme non faite' : 'Marquer comme faite'}
                          className="w-5 h-5 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0"
                        />
                        <Link href={href} className="flex items-baseline gap-1.5 hover:underline">
                          {numberSpan}
                          {titleSpan}
                        </Link>
                      </div>
                    );
                  })()}
                  <div className="flex gap-2 flex-wrap pl-[26px]">
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
      <LoadingOverlay visible={busy || navigating} label={navigating ? 'Ouverture de la fournée…' : 'Réorganisation en cours…'} />
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
