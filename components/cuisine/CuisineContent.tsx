'use client';

// Contenu d'« En cuisine » — ce qui est en train de se faire, ce qui est prévu,
// ce qu'il faut acheter.
//
// Réunit trois choses : les **fournées en cours de cuisson**, **mes
// fournées** (planning) et les **listes de courses**. Le regroupement n'est
// pas cosmétique : une liste de courses naît de ce qui est planifié, la
// ranger sur un autre écran forçait un aller-retour pour une question unique
// (« qu'est-ce que je fais aujourd'hui, et qu'est-ce qu'il me manque ? »).
//
// Une fournée est toujours supprimable d'un geste : la fusion plan + session
// (cf. CLAUDE.md « Fournées ») a fait disparaître la trace d'exécution
// séparée qui imposait autrefois de choisir entre « Archiver » (garder) et
// « Supprimer » (bloqué si déjà cuisinée). Il ne reste qu'une action —
// supprimer — et un second sort pour une fournée terminée ou abandonnée :
// elle glisse d'elle-même dans « Fournées terminées », sans geste.
//
// La vue par défaut du planning est la vue **par jour** : ses étapes sont
// cochables sur place (PlanningDayView), c'est elle qui répond à « qu'est-ce
// que je fais aujourd'hui, toutes fournées confondues ? » — la vue par
// fournée reste à un clic.
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDate, formatTime } from '@/lib/format';
import { PlanningDayView } from '@/components/profile/PlanningDayView';
import { PlanningIcon, DISC } from '@/components/PlanningIcon';
import { ArchivedShoppingLists } from '@/components/cuisine/ArchivedShoppingLists';
import { BATCH_FULL_SELECT, BATCH_STATUS_LBL, TERMINEES_PAGE_SIZE, type BatchFull } from '@/lib/recipe-plan';
import type { BatchListRow, ShoppingListSummary, ActiveBatchRow } from '@/lib/profile';

type PlanningView = 'jours' | 'recettes';

export function CuisineContent({
  planning,
  batchesTerminees,
  activeBatches,
  shoppingLists,
}: {
  planning: BatchListRow[];
  // Fournées closes (terminées ou abandonnées) — écran dédié plutôt qu'un
  // repli d'affichage, pour rester un vrai second sort plutôt qu'une case
  // oubliée du planning actif.
  batchesTerminees: BatchListRow[];
  activeBatches: ActiveBatchRow[];
  shoppingLists: ShoppingListSummary[];
}) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
  const writeGuard = useWriteGuard();
  const router = useRouter();
  // Cf. CarnetContent : le cache client du routeur peut resservir un rendu
  // obsolète alors que la page est en `force-dynamic` côté serveur. Seule
  // resynchronisation de l'écran (PlanningDayView n'en fait plus une seconde
  // pour son propre compte — même page, même cache à invalider).
  // `useTransition` + délai avant d'afficher le fouet : ce rafraîchissement
  // aboutit le plus souvent très vite (rien n'avait changé), l'afficher sans
  // délai le ferait clignoter derrière une page déjà à jour.
  const [refreshing, startRefresh] = useTransition();
  useEffect(() => {
    startRefresh(() => router.refresh());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [showRefreshSpinner, setShowRefreshSpinner] = useState(false);
  useEffect(() => {
    if (!refreshing) {
      setShowRefreshSpinner(false);
      return;
    }
    const t = setTimeout(() => setShowRefreshSpinner(true), 120);
    return () => clearTimeout(t);
  }, [refreshing]);

  const [planningList, setPlanningList] = useState(planning);
  useEffect(() => setPlanningList(planning), [planning]);
  const [terminees, setTerminees] = useState(batchesTerminees);
  useEffect(() => setTerminees(batchesTerminees), [batchesTerminees]);
  // `getBatches(..., 'terminees')` ne renvoie qu'une page (TERMINEES_PAGE_SIZE) —
  // une page pleine laisse supposer qu'il en reste, sans certitude (compte
  // pile rond) : le pire cas est un « Voir plus » qui ne ramène rien.
  const [hasMoreTerminees, setHasMoreTerminees] = useState(batchesTerminees.length === TERMINEES_PAGE_SIZE);
  useEffect(() => setHasMoreTerminees(batchesTerminees.length === TERMINEES_PAGE_SIZE), [batchesTerminees]);
  const [loadingMoreTerminees, setLoadingMoreTerminees] = useState(false);
  async function loadMoreTerminees() {
    setLoadingMoreTerminees(true);
    try {
      const res = await fetch(`/api/fournee/terminees?offset=${terminees.length}`);
      const { items } = (await res.json()) as { items?: BatchListRow[] };
      setTerminees((prev) => [...prev, ...(items || [])]);
      setHasMoreTerminees((items || []).length === TERMINEES_PAGE_SIZE);
    } finally {
      setLoadingMoreTerminees(false);
    }
  }
  const [shoppingList, setShoppingList] = useState(shoppingLists);
  useEffect(() => setShoppingList(shoppingLists), [shoppingLists]);
  // Archivée = tous les articles cochés. Aucune colonne dédiée en base : la
  // distinction est purement une lecture. Une liste sans article n'est jamais
  // « archivée » — elle n'a simplement encore rien à cocher.
  const activeShoppingLists = shoppingList.filter((l) => {
    const items = l.shopping_list_items || [];
    return items.length === 0 || items.some((i) => !i.checked);
  });
  const archivedShoppingLists = shoppingList.filter((l) => {
    const items = l.shopping_list_items || [];
    return items.length > 0 && items.every((i) => i.checked);
  });
  const [mergingListId, setMergingListId] = useState<number | null>(null);
  // La vue par jour est la vue par défaut (décision produit) : c'est elle
  // qui rend le planning actionnable sans ouvrir chaque fournée une à une.
  const [planningView, setPlanningView] = useState<PlanningView>('jours');
  const [refaisant, setRefaisant] = useState<number | null>(null);

  // La vue du planning reste tracée dans le hash : sans ça, un retour arrière
  // du navigateur depuis une fournée ne rétablit jamais la vue choisie.
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

  // Supprimer une fournée est désormais un geste unique et toujours possible
  // : la fusion plan + session a fait disparaître la trace d'exécution
  // séparée qui bloquait la suppression (`ON DELETE RESTRICT`). L'historique
  // (`executions_legacy`) reste en base pour mémoire technique, mais n'est
  // plus lu ni protégé par l'application.
  async function delPlan(plan: BatchListRow, fromTerminees: boolean) {
    const ok = await mutate(() => createClient().from('batches').delete().eq('id', plan.id), {
      confirm: 'Supprimer définitivement cette fournée ? Cette action est irréversible.',
      errorLabel: 'Suppression impossible',
    });
    if (!ok) return;
    if (fromTerminees) setTerminees((prev) => prev.filter((p) => p.id !== plan.id));
    else setPlanningList((prev) => prev.filter((p) => p.id !== plan.id));
  }

  // Duplique la fournée (jamais la recette) à une nouvelle date : toutes les
  // adaptations faites (ajustement, ingrédients ajoutés/retirés, étapes
  // déplacées, remplacements par une sous-recette, notes) sont reprises —
  // seul l'état d'avancement repart à zéro. Fonctionne même si la recette de
  // base a disparu depuis, la fournée étant autonome (cf. CLAUDE.md).
  async function refaireBatch(plan: BatchListRow) {
    if (!writeGuard('Recréation d’une fournée')) return;
    const dateStr = await dialog.prompt(
      `Date de dégustation de la nouvelle fournée « ${plan.recipe_title || ''} » (AAAA-MM-JJ)`,
      { required: true, placeholder: new Date().toISOString().slice(0, 10) },
    );
    if (!dateStr) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
      dialog.alert('Date invalide — attendu au format AAAA-MM-JJ.');
      return;
    }
    setRefaisant(plan.id);
    const supabase = createClient();
    try {
      const { data, error } = await supabase.from('batches').select(BATCH_FULL_SELECT).eq('id', plan.id).maybeSingle();
      if (error || !data) throw error || new Error('Fournée introuvable');
      const source = data as unknown as BatchFull;

      const { data: newBatch, error: insErr } = await supabase
        .from('batches')
        .insert({
          user_id: source.user_id,
          recipe_id: source.recipe_id,
          recipe_title: source.recipe_title,
          planned_date: dateStr.trim(),
          factor: source.factor,
          adjust_label: source.adjust_label,
          status: 'planifiee',
          notes: source.notes,
          source_plan_id: source.id,
          measure_type: source.measure_type,
          yield_qty: source.yield_qty,
          yield_unit: source.yield_unit,
          yield_desc: source.yield_desc,
          yield_notes: source.yield_notes,
          recipe_description: source.recipe_description,
          recipe_tips: source.recipe_tips,
          recipe_serving_advice: source.recipe_serving_advice,
          recipe_source: source.recipe_source,
          recipe_source_url: source.recipe_source_url,
          recipe_video_url: source.recipe_video_url,
          difficulty_name: source.difficulty_name,
          difficulty_level: source.difficulty_level,
          mold_type_name: source.mold_type_name,
          mold_forme: source.mold_forme,
          mold_dims: source.mold_dims,
          tags_text: source.tags_text,
        })
        .select('id')
        .single();
      if (insErr || !newBatch) throw insErr || new Error('Fournée non créée');
      const batchId = newBatch.id;

      const sortedSteps = [...source.batch_steps].sort((a, b) => a.order_index - b.order_index);
      const { data: stepRows, error: stepErr } = await supabase
        .from('batch_steps')
        .insert(
          sortedSteps.map((s) => ({
            batch_id: batchId,
            order_index: s.order_index,
            day_offset: s.day_offset,
            base_day_offset: s.base_day_offset,
            title: s.title,
            description: s.description,
            tips: s.tips,
            video_url: s.video_url,
            prep_time: s.prep_time,
            cook_time: s.cook_time,
            wait_time: s.wait_time,
            cook_temp: s.cook_temp,
            scaling_mode: s.scaling_mode,
            source_recipe_id: s.source_recipe_id,
            source_step_id: s.source_step_id,
            source_ingredient_id: s.source_ingredient_id,
            user_note: s.user_note,
          })),
        )
        .select('id')
        .order('order_index', { ascending: true });
      if (stepErr || !stepRows) throw stepErr || new Error('Étapes non créées');
      const idByOldStep = new Map(sortedSteps.map((s, i) => [s.id, stepRows[i].id]));

      const substepsToInsert = sortedSteps.flatMap((s) =>
        s.batch_substeps.map((su) => ({
          batch_step_id: idByOldStep.get(s.id)!,
          order_index: su.order_index,
          texte: su.texte,
          added: su.added,
          excluded_when_done: su.excluded_when_done,
        })),
      );
      if (substepsToInsert.length) {
        const { error } = await supabase.from('batch_substeps').insert(substepsToInsert);
        if (error) throw error;
      }

      const ingredientsToInsert = source.batch_ingredients.map((it) => ({
        batch_id: batchId,
        batch_step_id: it.batch_step_id != null ? (idByOldStep.get(it.batch_step_id) ?? null) : null,
        order_index: it.order_index,
        ref_id: it.ref_id,
        name: it.name,
        base_quantity: it.base_quantity,
        quantity: it.quantity,
        quantity_text: it.quantity_text,
        unit: it.unit,
        comment: it.comment,
        url: it.url,
        allergen: it.allergen,
        added: it.added,
        removed: it.removed,
        excluded_when_done: it.excluded_when_done,
        expanded_into_recipe_id: it.expanded_into_recipe_id,
        scaling_mode: it.scaling_mode,
        source_ingredient_id: it.source_ingredient_id,
        source_recipe_id: it.source_recipe_id,
      }));
      if (ingredientsToInsert.length) {
        const { error } = await supabase.from('batch_ingredients').insert(ingredientsToInsert);
        if (error) throw error;
      }

      if (source.batch_utensils.length) {
        const { error } = await supabase.from('batch_utensils').insert(
          source.batch_utensils.map((u) => ({
            batch_id: batchId,
            order_index: u.order_index,
            name: u.name,
            comment: u.comment,
            url: u.url,
            source_recipe_id: u.source_recipe_id,
          })),
        );
        if (error) throw error;
      }

      router.push(`/fournee/${batchId}`);
    } catch (e) {
      dialog.alert('Erreur lors de la recréation de la fournée : ' + (e as Error).message);
      setRefaisant(null);
    }
  }

  return (
    <>
      <LoadingOverlay
        visible={busy || refaisant !== null || showRefreshSpinner}
        label={refaisant !== null ? 'Recréation de la fournée…' : showRefreshSpinner ? 'Actualisation…' : 'Traitement en cours…'}
      />

      {/* ── Fournées en cours de cuisson ──────────────────────────────────
          Plusieurs peuvent tourner en même temps (un levain sur trois jours
          pendant qu'un entremets se monte). Quand aucune ne tourne, la section
          disparaît entièrement et le planning remonte : pas de bloc vide. */}
      {activeBatches.length > 0 && (
        <section className="mt-10">
          <div className="mb-4 flex items-center gap-2.5">
            <h2 className="font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
              Fournées en cours
            </h2>
            <span className="flex items-center gap-1.5 rounded-pill bg-primary px-2 py-0.5 font-label-md text-[10.5px] text-on-primary">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-pill bg-white opacity-70 motion-reduce:hidden" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-pill bg-white" />
              </span>
              {activeBatches.length}
            </span>
          </div>
          <div className="space-y-4">
            {activeBatches.map((x) => (
              <ActiveBatchCard key={x.id} batch={x} />
            ))}
          </div>
        </section>
      )}

      {/* ── Mes fournées + Listes de courses ─────────────────────────────
          Côte à côte au bureau (grille 12 colonnes, 7/5), empilées sur
          mobile : la liste de courses ne vit jamais sur un autre écran,
          elle naît de ce qui est planifié juste à côté. */}
      <div className="mt-12 lg:grid lg:grid-cols-12 lg:gap-x-16">
      {/* ── Mes fournées ──────────────────────────────────────────────── */}
      <section className="lg:col-span-7">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-3 font-headline-md text-primary">
            <PlanningIcon size={24} discFill={DISC.surface} /> Mes fournées
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
                Par fournée
              </button>
            </div>
          )}
        </div>
        {planningView === 'jours' ? (
          <PlanningDayView plans={planningList} />
        ) : planningList.length > 0 ? (
          <div className="max-w-3xl space-y-4">
            {planningList.map((p) => {
              const timeTxt = p.recipes?.total_time || p.recipes?.prep_time ? formatTime(p.recipes.total_time || p.recipes.prep_time) : '';
              // Nombre de jours de la fournée matérialisée (day_offset des
              // batch_steps), pas de la recette de base.
              const daysCount = new Set([0, ...p.batch_steps.map((s) => Math.max(0, s.day_offset || 0))]).size;
              const daysTxt = daysCount > 1 ? `${daysCount} jours` : '';
              const durationTxt = [timeTxt, daysTxt].filter(Boolean).join(' · ');
              const meta = [
                p.planned_date
                  ? 'Prévu pour ' + new Date(p.planned_date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                  : '',
                [p.adjust_label || '', durationTxt].filter(Boolean).join(' — '),
                p.factor && Number(p.factor) !== 1 ? '× ' + String(Number(p.factor)).replace('.', ',') : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div key={p.id} className="group flex items-center justify-between rounded-lg border border-outline-variant bg-white p-6 transition-colors hover:bg-surface-container">
                  <Link href={`/fournee/${p.id}`} className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-container-high">
                      {p.recipes?.hero_thumb_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                        <img src={p.recipes.hero_thumb_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="material-symbols-outlined text-on-surface-variant">cake</span>
                      )}
                    </div>
                    <div>
                      <p className="font-label-md text-primary">{p.recipe_title || p.recipes?.title || ''}</p>
                      <p className="font-body-md text-[12px] text-on-surface-variant">{meta}</p>
                      {p.notes && <p className="font-body-md text-[12px] italic text-on-surface-variant">{p.notes}</p>}
                    </div>
                  </Link>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Link
                      href={`/fournee/${p.id}`}
                      className="flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-primary px-3 py-1.5 font-label-md text-[11px] text-primary transition-colors hover:bg-primary hover:text-white"
                    >
                      <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                      <span className="hidden sm:inline">Cuisiner</span>
                    </Link>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        title="Refaire cette fournée"
                        onClick={() => refaireBatch(p)}
                        className="rounded p-1.5 text-on-surface-variant opacity-0 transition-opacity hover:bg-surface-container hover:text-primary focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <span className="material-symbols-outlined">restart_alt</span>
                      </button>
                      <button
                        type="button"
                        title="Supprimer"
                        onClick={() => delPlan(p, false)}
                        className="rounded p-1.5 text-error opacity-0 transition-opacity hover:bg-error/10 focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="italic text-on-surface-variant">
            Aucune fournée pour le moment. Ouvrez une recette et cliquez sur « Lancer une fournée ».
          </p>
        )}
        {terminees.length > 0 && (
          <details className="group mt-10 border-t border-outline-variant/60 pt-8">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
              Fournées terminées ({terminees.length}{hasMoreTerminees ? '+' : ''})
              <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-180">expand_more</span>
            </summary>
            <div className="mt-4 max-w-3xl space-y-4">
              {terminees.map((p) => {
                const timeTxt = p.recipes?.total_time || p.recipes?.prep_time ? formatTime(p.recipes.total_time || p.recipes.prep_time) : '';
                return (
                  <div key={p.id} className="flex items-center gap-4 rounded-lg border border-outline-variant bg-white p-6 opacity-70 transition-opacity hover:opacity-100">
                    <Link href={`/fournee/${p.id}?lecture=1&mode=preparer`} className="flex flex-1 items-center gap-4 min-w-0">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-container-high">
                        {p.recipes?.hero_thumb_url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                          <img src={p.recipes.hero_thumb_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-on-surface-variant">cake</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-label-md text-primary">{p.recipe_title || p.recipes?.title || ''}</p>
                        <p className="font-body-md text-[12px] text-on-surface-variant">
                          {[p.planned_date ? 'Prévu pour ' + formatDate(p.planned_date) : '', timeTxt].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </Link>
                    <span className={`shrink-0 font-label-md text-[11px] px-2.5 py-1 rounded-full text-white ${BATCH_STATUS_LBL[p.status]?.cls || 'bg-secondary'}`}>
                      {BATCH_STATUS_LBL[p.status]?.label || p.status}
                    </span>
                    <button
                      type="button"
                      title="Refaire cette fournée"
                      onClick={() => refaireBatch(p)}
                      className="shrink-0 rounded p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                    >
                      <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                    </button>
                    <button
                      type="button"
                      title="Supprimer définitivement"
                      onClick={() => delPlan(p, true)}
                      className="shrink-0 rounded p-1.5 text-error transition-colors hover:bg-error/10"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </div>
                );
              })}
              {hasMoreTerminees && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={loadMoreTerminees}
                    disabled={loadingMoreTerminees}
                    className="rounded-pill border border-primary px-6 py-2 font-label-md text-[12px] text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-60"
                  >
                    {loadingMoreTerminees ? 'Chargement…' : 'Voir plus'}
                  </button>
                </div>
              )}
            </div>
          </details>
        )}
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
            Aucune liste de courses active. Depuis une fournée, cliquez sur « Liste de courses » dans la liste
            complète des ingrédients.
          </p>
        )}
        {archivedShoppingLists.length > 0 && (
          <details className="group mt-10 border-t border-outline-variant/60 pt-8">
            <summary className="flex cursor-pointer list-none items-center gap-2 font-label-md text-[10px] font-semibold uppercase tracking-[0.18em] text-outline">
              Archivées ({archivedShoppingLists.length})
              <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-180">
                expand_more
              </span>
            </summary>
            <div className="mt-4">
              <ArchivedShoppingLists lists={archivedShoppingLists} />
            </div>
          </details>
        )}
      </section>
      </div>
    </>
  );
}

// Carte de fournée en cours de cuisson. L'avancement est dit en étapes —
// « Étape 2 sur 5 · Crème Chiboust » — et non en décompte (« dans 12 min ») :
// le modèle ne porte aucun ancrage horaire par étape, un décompte serait une
// estimation déguisée en horloge. Il viendra quand les étapes auront une heure.
function ActiveBatchCard({ batch }: { batch: ActiveBatchRow }) {
  const { done, total, currentTitle } = batch.progress;
  const etape = total > 0 ? `Étape ${Math.min(done + 1, total)} sur ${total}` : null;
  const image = batch.recipes?.hero_thumb_url;

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
        <p className="font-headline-md text-lg leading-tight text-primary">{batch.recipe_title || 'Fournée'}</p>
        <p className="mt-0.5 font-body-md text-[13px] text-on-surface-variant">
          {[etape, currentTitle].filter(Boolean).join(' · ') || 'Fournée en cours'}
        </p>
        {total > 0 && (
          <div className="mt-3 flex gap-1" role="img" aria-label={`${done} étape${done > 1 ? 's' : ''} sur ${total} terminée${done > 1 ? 's' : ''}`}>
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-pill ${i < done ? 'bg-primary' : 'bg-surface-container-highest'}`} />
            ))}
          </div>
        )}
      </div>

      <div className="flex w-full shrink-0 gap-2 md:w-auto">
        <Link
          href={`/fournee/${batch.id}?mode=preparer`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-pill border border-primary px-4 py-2.5 font-label-md text-label-md text-primary transition-all hover:bg-primary/5 active:scale-95 md:flex-none"
        >
          <span className="material-symbols-outlined text-[18px]">tune</span> Préparer
        </Link>
        <Link
          href={`/fournee/${batch.id}?mode=cuisiner`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-pill bg-primary px-4 py-2.5 font-label-md text-label-md text-on-primary transition-all hover:shadow-lg active:scale-95 md:flex-none"
        >
          <span className="material-symbols-outlined text-[18px]">skillet</span> Cuisiner
        </Link>
      </div>
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
