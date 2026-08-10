'use client';

// Contenu d'« En cuisine » — ce qui est en train de se faire, ce qui est prévu,
// ce qu'il faut acheter.
//
// Réunit trois choses qui étaient éparpillées dans trois onglets de `/profil` :
// les **sessions en cours**, le **planning** et les **listes de courses**. Le
// regroupement n'est pas cosmétique : une liste de courses naît de ce qui est
// planifié, la ranger sur un autre écran forçait un aller-retour pour une
// question unique (« qu'est-ce que je fais aujourd'hui, et qu'est-ce qu'il me
// manque ? »).
//
// Un point de conduite hérité du modèle de données, à ne pas défaire :
//  - « Retirer du planning » **archive** dès qu'une session existe : les
//    exécutions sont en `ON DELETE RESTRICT` pour garantir la trace de ce qui a
//    réellement été cuisiné (cf. CLAUDE.md), un `delete` sec échouerait. Le
//    plan archivé n'est pas perdu : il reste consultable sur
//    /en-cuisine/archives, seul écran qui relit `planning.status = 'archive'`.
//
// Le planning s'ouvre désormais sur la **vue par recette** (repli initial de
// `planningView` ci-dessous) — la vue par jour reste accessible en un clic et
// par son ancre (`#planning-jours`), inchangée.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDate, formatTime } from '@/lib/format';
import { PlanningDayView } from '@/components/profile/PlanningDayView';
import { PlanningIcon, DISC } from '@/components/PlanningIcon';
import type { PlanningRow, ShoppingListSummary } from '@/lib/profile';
import type { ActiveExecutionRow, RunningExecStep } from '@/lib/executions';

type PlanningView = 'jours' | 'recettes';

export function CuisineContent({
  planning,
  activeSessions,
  runningExecSteps,
  shoppingLists,
}: {
  planning: PlanningRow[];
  activeSessions: ActiveExecutionRow[];
  runningExecSteps: Record<number, RunningExecStep[]>;
  shoppingLists: ShoppingListSummary[];
}) {
  const { mutate, busy } = useMutation();
  const router = useRouter();
  // Cf. CarnetContent : le cache client du routeur peut resservir un rendu
  // obsolète alors que la page est en `force-dynamic` côté serveur.
  useEffect(() => {
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [planningList, setPlanningList] = useState(planning);
  useEffect(() => setPlanningList(planning), [planning]);
  const [shoppingList, setShoppingList] = useState(shoppingLists);
  useEffect(() => setShoppingList(shoppingLists), [shoppingLists]);
  // Archivée = tous les articles cochés. Aucune colonne dédiée en base (cf.
  // app/en-cuisine/archives) : la distinction est purement une lecture, ici
  // comme là-bas. Une liste sans article n'est jamais « archivée » — elle n'a
  // simplement encore rien à cocher.
  const activeShoppingLists = shoppingList.filter((l) => {
    const items = l.shopping_list_items || [];
    return items.length === 0 || items.some((i) => !i.checked);
  });
  const archivedShoppingLists = shoppingList.filter((l) => {
    const items = l.shopping_list_items || [];
    return items.length > 0 && items.every((i) => i.checked);
  });
  const [mergingListId, setMergingListId] = useState<number | null>(null);
  const [planningView, setPlanningView] = useState<PlanningView>('recettes');

  // La vue du planning reste tracée dans le hash : sans ça, un retour arrière
  // du navigateur depuis une session de préparation ne rétablit jamais la vue
  // choisie. Les anciens hash de `/profil` (`#planning`, `#planning-jours`)
  // sont conservés à l'identique — ils sont la cible des redirections.
  useEffect(() => {
    const fromHash = () => {
      if (location.hash === '#planning') setPlanningView('recettes');
      else if (location.hash === '#planning-jours') setPlanningView('jours');
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  function switchPlanningView(v: PlanningView) {
    setPlanningView(v);
    history.replaceState(null, '', v === 'jours' ? '#planning-jours' : '#planning');
  }

  async function delShoppingList(id: number, name: string) {
    const ok = await mutate(() => createClient().from('shopping_lists').delete().eq('id', id), {
      confirm: `Supprimer la liste « ${name} » ?`,
    });
    if (ok) setShoppingList((prev) => prev.filter((l) => l.id !== id));
  }

  // Fusion de deux listes entières : les articles de même libellé et même
  // unité voient leurs quantités additionnées (comme dans une liste, voir
  // ShoppingItems), les autres articles sont simplement rattachés à la liste
  // cible — puis la liste source, vidée, est supprimée.
  async function mergeShoppingLists(targetId: number, sourceId: number, targetName: string, sourceName: string) {
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const { data: rows, error: fetchErr } = await supabase
          .from('shopping_list_items')
          .select('id, list_id, name, quantity, unit')
          .in('list_id', [targetId, sourceId]);
        if (fetchErr) return { error: fetchErr };
        const key = (n: string, u: string | null) => n.trim().toLowerCase() + '|' + (u || '').trim().toLowerCase();
        const targetItems = (rows || []).filter((r) => r.list_id === targetId);
        const byKey = new Map(targetItems.map((r) => [key(r.name, r.unit), r]));
        for (const s of (rows || []).filter((r) => r.list_id === sourceId)) {
          const match = byKey.get(key(s.name, s.unit));
          if (match) {
            const a = parseFloat(String(match.quantity || '').replace(',', '.'));
            const b = parseFloat(String(s.quantity || '').replace(',', '.'));
            const newQty =
              !isNaN(a) && !isNaN(b)
                ? String(+(a + b).toFixed(2))
                : [match.quantity, s.quantity].filter(Boolean).join(' + ');
            const { error } = await supabase.from('shopping_list_items').update({ quantity: newQty }).eq('id', match.id);
            if (error) return { error };
            const { error: delErr } = await supabase.from('shopping_list_items').delete().eq('id', s.id);
            if (delErr) return { error: delErr };
          } else {
            const { error } = await supabase.from('shopping_list_items').update({ list_id: targetId }).eq('id', s.id);
            if (error) return { error };
          }
        }
        return supabase.from('shopping_lists').delete().eq('id', sourceId);
      },
      { errorLabel: 'Fusion impossible', confirm: `Fusionner « ${sourceName} » dans « ${targetName} » ?` },
    );
    if (ok) {
      setShoppingList((prev) => prev.filter((l) => l.id !== sourceId));
      setMergingListId(null);
    }
  }

  async function delPlan(plan: PlanningRow) {
    // Un plan déjà cuisiné (au moins une exécution) ne peut pas être supprimé
    // — `executions.planning_id` est en ON DELETE RESTRICT pour garantir la
    // trace des recettes réalisées (cf. CLAUDE.md). On l'archive à la place.
    const hasExecutions = (plan.executions?.[0]?.count || 0) > 0;
    // Une session *en cours* (par opposition à une exécution passée) n'est
    // jamais arrêtée par cette action : archiver le plan ne fait que le
    // sortir du planning à venir, ce n'est pas un renoncement à la
    // préparation déjà commencée. Elle continue donc d'apparaître dans
    // « Sessions en cours » — ce n'est pas un oubli, retoucher une exécution
    // depuis ici détruirait la trace de ce qui a réellement été fait
    // (cf. CLAUDE.md « Recettes planifiées »). Le message doit le dire :
    // « déjà cuisinée » (au passé) serait faux pour une session toujours active.
    const hasActiveSession = plan.active_execution.length > 0;
    const ok = await mutate(
      () =>
        hasExecutions
          ? createClient().from('planning').update({ status: 'archive' }).eq('id', plan.id)
          : createClient().from('planning').delete().eq('id', plan.id),
      {
        confirm: hasActiveSession
          ? 'Une session est en cours pour cette recette : elle continuera d’apparaître dans « Sessions en cours » et n’est pas affectée. La recette sera seulement archivée (retirée du planning à venir). Continuer ?'
          : hasExecutions
            ? 'Cette recette a déjà été cuisinée : elle sera archivée (conservée dans l’historique) plutôt que supprimée. Continuer ?'
            : 'Retirer cette recette du planning ?',
      },
    );
    if (ok) setPlanningList((prev) => prev.filter((p) => p.id !== plan.id));
  }

  return (
    <>
      <LoadingOverlay visible={busy} label="Traitement en cours…" />

      {/* ── Sessions en cours ─────────────────────────────────────────────
          Plusieurs peuvent tourner en même temps (un levain sur trois jours
          pendant qu'un entremets se monte). Quand aucune ne tourne, la section
          disparaît entièrement et le planning remonte : pas de bloc vide. */}
      {activeSessions.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2.5">
            <h2 className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
              Sessions en cours
            </h2>
            <span className="flex items-center gap-1.5 rounded-pill bg-primary px-2 py-0.5 font-label-md text-[10.5px] text-on-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-pill bg-white opacity-70 motion-reduce:hidden" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-pill bg-white" />
              </span>
              {activeSessions.length}
            </span>
          </div>
          <div className="space-y-4">
            {activeSessions.map((x) => (
              <SessionCard key={x.id} session={x} />
            ))}
          </div>
        </section>
      )}

      {/* ── Planning + Listes de courses ─────────────────────────────────
          Côte à côte au bureau (grille 12 colonnes, 7/5), empilées sur
          mobile : la liste de courses ne vit jamais sur un autre écran,
          elle naît de ce qui est planifié juste à côté (cf. CLAUDE.md). */}
      <div className="mt-12 lg:grid lg:grid-cols-12 lg:gap-x-16">
      {/* ── Planning ───────────────────────────────────────────────────── */}
      <section className="lg:col-span-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-3 font-headline-md text-primary">
            <PlanningIcon size={24} discFill={DISC.surface} /> Planning
          </h2>
          {planningList.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => switchPlanningView('jours')}
                className={`rounded-pill border px-4 py-2 font-label-md text-label-md ${planningView === 'jours' ? 'border-primary bg-primary text-white' : 'border-outline-variant text-on-surface-variant hover:text-primary'}`}
              >
                Par jour
              </button>
              <button
                type="button"
                onClick={() => switchPlanningView('recettes')}
                className={`rounded-pill border px-4 py-2 font-label-md text-label-md ${planningView === 'recettes' ? 'border-primary bg-primary text-white' : 'border-outline-variant text-on-surface-variant hover:text-primary'}`}
              >
                Par recette
              </button>
            </div>
          )}
        </div>
        {planningView === 'jours' ? (
          <PlanningDayView plans={planningList} runningExecSteps={runningExecSteps} />
        ) : planningList.length > 0 ? (
          <div className="max-w-3xl space-y-4">
            {planningList.map((p) => {
              const timeTxt =
                p.recipes?.total_time || p.recipes?.prep_time
                  ? formatTime(p.recipes.total_time || p.recipes.prep_time)
                  : '';
              // Nombre de jours du plan matérialisé (day_offset des plan_steps),
              // pas de la recette d'origine — cf. CLAUDE.md « Recettes planifiées ».
              const daysCount = new Set([0, ...p.plan_steps.map((s) => Math.max(0, s.day_offset || 0))]).size;
              const daysTxt = daysCount > 1 ? `${daysCount} jours` : '';
              const durationTxt = [timeTxt, daysTxt].filter(Boolean).join(' · ');
              const meta = [
                p.planned_date
                  ? 'Prévu pour ' +
                    new Date(p.planned_date + 'T00:00:00').toLocaleDateString('fr-FR', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })
                  : '',
                [p.adjust_label || '', durationTxt].filter(Boolean).join(' — '),
                p.factor && Number(p.factor) !== 1 ? '× ' + String(Number(p.factor)).replace('.', ',') : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div
                  key={p.id}
                  className="group flex items-center justify-between rounded-lg border border-outline-variant bg-white p-6 transition-colors hover:bg-surface-container"
                >
                  <Link href={`/recette/${p.recipes?.id || p.recipe_id}?plan=${p.id}`} className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-container-high">
                      {p.recipes?.hero_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                        <img src={p.recipes.hero_image_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant">cake</span>
                      )}
                    </div>
                    <div>
                      <p className="font-label-md text-primary">{p.recipes?.title || ''}</p>
                      <p className="font-body-md text-[12px] text-on-surface-variant">{meta}</p>
                      {p.notes && <p className="font-body-md text-[12px] italic text-on-surface-variant">{p.notes}</p>}
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-3">
                    {p.active_execution.length > 0 ? (
                      <Link
                        href={`/execution/${p.active_execution[0].id}`}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-pill bg-secondary/90 px-3 py-1.5 font-label-md text-[11px] text-white hover:opacity-90"
                      >
                        <span className="material-symbols-outlined text-[14px]">play_circle</span>
                        <span className="hidden sm:inline">Session en cours</span>
                      </Link>
                    ) : (
                      <Link
                        href={`/recette/${p.recipes?.id || p.recipe_id}?plan=${p.id}&demarrer=1`}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-primary px-3 py-1.5 font-label-md text-[11px] text-primary transition-colors hover:bg-primary hover:text-white"
                      >
                        <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                        <span className="hidden sm:inline">Démarrer une session</span>
                      </Link>
                    )}
                    <button
                      type="button"
                      title="Retirer du planning"
                      onClick={() => delPlan(p)}
                      className="rounded p-1.5 text-error opacity-0 transition-opacity hover:bg-error/10 focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <span className="material-symbols-outlined">delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="italic text-on-surface-variant">
            Aucune recette planifiée pour le moment. Ouvrez une recette et cliquez sur « Planifier ».
          </p>
        )}
        <Link
          href="/en-cuisine/archives#planning"
          className="mt-6 inline-flex items-center gap-1.5 font-label-md text-label-md text-secondary hover:text-primary"
        >
          Voir les recettes planifiées archivées
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </Link>
      </section>

      {/* ── Listes de courses ──────────────────────────────────────────── */}
      <section className="mt-14 lg:col-span-5 lg:mt-0">
        <h2 className="mb-6 flex items-center gap-3 font-headline-md text-primary">
          <span className="material-symbols-outlined">shopping_bag</span> Listes de courses
        </h2>
        {activeShoppingLists.length > 0 ? (
          <div className="space-y-4">
            {activeShoppingLists.map((l) => {
              const items = l.shopping_list_items || [];
              const done = items.filter((i) => i.checked).length;
              const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;
              return (
                <div key={l.id} className="rounded-lg border border-outline-variant p-5 transition-colors hover:bg-surface-container-low">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <Link href={`/courses/${l.id}`} className="font-label-md text-[15px] text-primary hover:text-secondary">
                      {l.name}
                    </Link>
                    <span className="shrink-0 whitespace-nowrap text-[12px] text-on-surface-variant">
                      {done} / {items.length}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-[12px] text-on-surface-variant">
                      {l.created_at ? 'Créée le ' + formatDate(l.created_at) : ''}
                    </p>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        title="Fusionner avec une autre liste"
                        onClick={() => setMergingListId(mergingListId === l.id ? null : l.id)}
                        className="rounded p-1.5 text-primary transition-colors hover:bg-primary/10"
                      >
                        <span className="material-symbols-outlined text-[18px]">call_merge</span>
                      </button>
                      <button
                        type="button"
                        title="Supprimer la liste"
                        onClick={() => delShoppingList(l.id, l.name)}
                        className="rounded p-1.5 text-error transition-colors hover:bg-error/10"
                      >
                        <span className="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                  {mergingListId === l.id && (
                    <div className="mt-4 border-t border-outline-variant/60 pt-4">
                      <MergeListRow
                        candidates={activeShoppingLists.filter((o) => o.id !== l.id)}
                        onMerge={(sourceId, sourceName) => mergeShoppingLists(l.id, sourceId, l.name, sourceName)}
                        onCancel={() => setMergingListId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm italic text-on-surface-variant">
            Aucune liste de courses active. Depuis une recette, cliquez sur « Liste de courses » dans la liste
            complète des ingrédients.
          </p>
        )}
        {archivedShoppingLists.length > 0 && (
          <Link
            href="/en-cuisine/archives#courses"
            className="mt-6 inline-flex items-center gap-1.5 font-label-md text-label-md text-secondary hover:text-primary"
          >
            Voir les listes de courses archivées ({archivedShoppingLists.length})
            <span className="material-symbols-outlined text-[18px]">chevron_right</span>
          </Link>
        )}
      </section>
      </div>
    </>
  );
}

// Carte de session. L'avancement est dit en étapes — « Étape 2 sur 5 · Crème
// Chiboust » — et non en décompte (« dans 12 min ») : le modèle ne porte aucun
// ancrage horaire par étape, un décompte serait une estimation déguisée en
// horloge. Il viendra quand les étapes auront une heure.
function SessionCard({ session }: { session: ActiveExecutionRow }) {
  const { done, total, currentTitle } = session.progress;
  const etape = total > 0 ? `Étape ${Math.min(done + 1, total)} sur ${total}` : null;
  const image = session.planning?.recipes?.hero_image_url;

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-low p-5 md:flex-row md:items-center">
      {/* Sur mobile, la vignette se réduit à une pastille : sur un téléphone
          tenu au-dessus d'un plan de travail, c'est l'avancement qui sert,
          pas l'illustration. */}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-container md:h-20 md:w-20">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="material-symbols-outlined text-on-surface-variant">cake</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-headline-md text-lg leading-tight text-primary">
          {session.planning?.recipe_title || 'Session de préparation'}
        </p>
        <p className="mt-0.5 font-body-md text-[13px] text-on-surface-variant">
          {[etape, currentTitle].filter(Boolean).join(' · ') || 'Session démarrée'}
        </p>
        {total > 0 && (
          <div
            className="mt-3 flex gap-1"
            role="img"
            aria-label={`${done} étape${done > 1 ? 's' : ''} sur ${total} terminée${done > 1 ? 's' : ''}`}
          >
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-pill ${i < done ? 'bg-primary' : 'bg-surface-container-highest'}`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pleine largeur sur mobile (README « En cuisine » mobile) : le bouton
          est la seule action de la carte, autant lui laisser toute la ligne
          plutôt qu'un bouton étriqué à côté d'un espace vide. */}
      <Link
        href={`/execution/${session.id}`}
        className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-pill bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary transition-all hover:shadow-lg active:scale-95 md:w-auto"
      >
        <span className="material-symbols-outlined text-[18px]">play_arrow</span> Reprendre
      </Link>
    </div>
  );
}

function MergeListRow({
  candidates,
  onMerge,
  onCancel,
}: {
  candidates: ShoppingListSummary[];
  onMerge: (sourceId: number, sourceName: string) => void;
  onCancel: () => void;
}) {
  const [sourceId, setSourceId] = useState(candidates[0]?.id ?? -1);
  if (candidates.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm italic text-on-surface-variant">Aucune autre liste à fusionner.</p>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-pill border border-outline px-4 py-1.5 font-label-md text-[12px] text-on-surface-variant"
        >
          Fermer
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-label-md text-[10px] uppercase text-on-surface-variant">Fusionner avec</span>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(Number(e.target.value))}
          className="rounded border border-outline-variant bg-white px-3 py-1.5 font-body-md text-sm"
          style={{ minWidth: '16rem' }}
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({(c.shopping_list_items || []).length} article
              {(c.shopping_list_items || []).length > 1 ? 's' : ''})
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => {
          const source = candidates.find((c) => c.id === sourceId);
          if (source) onMerge(source.id, source.name);
        }}
        className="rounded-pill bg-primary px-4 py-1.5 font-label-md text-[12px] text-on-primary"
      >
        Fusionner
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-pill border border-outline px-4 py-1.5 font-label-md text-[12px] text-on-surface-variant"
      >
        Annuler
      </button>
    </div>
  );
}
