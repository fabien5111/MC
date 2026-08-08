'use client';

// Onglets du profil (porté de profil.html) : carnet, import, favoris, planning,
// listes de courses. Bascule d'onglet synchronisée avec le hash.
// Suppressions via useMutation (écriture navigateur + resynchro du serveur).
import { Fragment, useEffect, useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDate, formatTime } from '@/lib/format';
import { effectiveTimes, cardHeroSrc } from '@/lib/recipe-view';
import { FavoriteHeart } from '@/components/FavoriteHeart';
import { RecipeCardClient } from '@/components/RecipeCardClient';
import { MaryseIcon } from '@/components/MaryseIcon';
import { AllergenPictosView } from '@/components/recipe/AllergenPictosView';
import { PlanBadgeIcon } from '@/components/recipe/PlanBadgeIcon';
import { PlanningDayView } from '@/components/profile/PlanningDayView';
import type { FavoriteRow, PlanningRow, ShoppingListSummary } from '@/lib/profile';
import type { UserRecipeCard } from '@/lib/recipes';
import type { ActiveExecutionRow, RunningExecStep } from '@/lib/executions';

export type UserRecipe = UserRecipeCard;

// useLayoutEffect ne fait rien côté serveur (avertissement React) : on bascule
// sur useEffect au SSR, et sur useLayoutEffect côté client pour appliquer
// l'onglet issu du hash avant la peinture du navigateur — sinon l'onglet par
// défaut ('recipes') s'affiche une frame avant d'être remplacé par le bon.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

type TabKey = 'recipes' | 'imports' | 'favorites' | 'planning' | 'sessions' | 'courses';

const STATUS: Record<string, { label: string; badge: string }> = {
  published: { label: 'Publiée', badge: 'bg-green-700' },
  pending: { label: 'En attente', badge: 'bg-secondary/90' },
  draft: { label: 'Brouillon', badge: 'bg-secondary/90' },
  rejected: { label: 'Publication refusée', badge: 'bg-error/90' },
};

// `href` : onglet de navigation (change d'URL) plutôt que bascule interne —
// « Import de recettes » ouvre la page /importer.
const TABS: { key: TabKey; label: string; href?: string }[] = [
  { key: 'recipes', label: 'Mon Carnet de Recettes' },
  { key: 'imports', label: 'Import de recettes', href: '/importer' },
  { key: 'favorites', label: 'Mes Favoris' },
  { key: 'planning', label: 'Planning' },
  { key: 'sessions', label: 'Sessions actives' },
  { key: 'courses', label: 'Listes de courses' },
];

export function ProfileTabs({
  recipes,
  favorites,
  planning,
  activeSessions,
  runningExecSteps,
  shoppingLists,
  favIds,
}: {
  recipes: UserRecipe[];
  favorites: FavoriteRow[];
  planning: PlanningRow[];
  activeSessions: ActiveExecutionRow[];
  runningExecSteps: Record<number, RunningExecStep[]>;
  shoppingLists: ShoppingListSummary[];
  favIds: string[];
}) {
  const { mutate, busy } = useMutation();
  const router = useRouter();
  // Le cache client du routeur peut resservir un rendu obsolète de /profil
  // (ex. retour au planning après avoir démarré une session ailleurs) alors
  // même que la page est en `force-dynamic` côté serveur — ce dernier ne joue
  // que sur le rendu initial d'une requête, pas sur ce cache. On force donc
  // une resynchronisation à chaque montage (ex. retour sur la page).
  useEffect(() => {
    router.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [tab, setTab] = useState<TabKey>('recipes');
  // Suppression optimiste locale : le spinner reste affiché jusqu'à ce que la
  // recette disparaisse effectivement de la liste, sans attendre le
  // router.refresh() (resynchronisation serveur en arrière-plan).
  const [recipeList, setRecipeList] = useState(recipes);
  useEffect(() => setRecipeList(recipes), [recipes]);
  const [planningList, setPlanningList] = useState(planning);
  useEffect(() => setPlanningList(planning), [planning]);
  // Vue par jour de l'onglet Planning : les cartes actuelles restent
  // inchangées (une recette à la fois), la vue par jour combine les étapes de
  // toutes les recettes planifiées (voir PlanningDayView).
  const [planningView, setPlanningView] = useState<'recettes' | 'jours'>('recettes');
  const [shoppingList, setShoppingList] = useState(shoppingLists);
  useEffect(() => setShoppingList(shoppingLists), [shoppingLists]);
  const [mergingListId, setMergingListId] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const fromHash = () => {
      const h = location.hash;
      if (h === '#planning-jours') {
        setTab('planning');
        setPlanningView('jours');
      } else if (h === '#planning') {
        setTab('planning');
        setPlanningView('recettes');
      } else if (h === '#sessions') setTab('sessions');
      else if (h.startsWith('#courses')) setTab('courses');
      else if (h === '' || h === '#') setTab('recipes');
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  function switchTab(k: TabKey) {
    setTab(k);
    // Un clic direct sur l'onglet Planning revient toujours à la vue par
    // recette par défaut, pour que le hash (#planning) et l'état affiché
    // restent cohérents.
    if (k === 'planning') setPlanningView('recettes');
    const hash = k === 'planning' ? '#planning' : k === 'sessions' ? '#sessions' : k === 'courses' ? '#courses' : ' ';
    history.replaceState(null, '', hash === ' ' ? location.pathname : hash);
  }

  // Bascule vue par recette / vue par jour de l'onglet Planning, tracée dans
  // le hash (comme `switchTab`) : sans ça, un retour arrière du navigateur
  // depuis une session de préparation ne rétablit jamais la vue par jour,
  // toujours réinitialisée à « recettes ».
  function switchPlanningView(v: 'recettes' | 'jours') {
    setPlanningView(v);
    history.replaceState(null, '', v === 'jours' ? '#planning-jours' : '#planning');
  }

  async function delShoppingList(id: number, name: string) {
    const ok = await mutate(
      () => createClient().from('shopping_lists').delete().eq('id', id),
      { confirm: `Supprimer la liste « ${name} » ?` },
    );
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
            const newQty = !isNaN(a) && !isNaN(b) ? String(+(a + b).toFixed(2)) : [match.quantity, s.quantity].filter(Boolean).join(' + ');
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

  async function delRecipe(id: string, title: string) {
    const ok = await mutate(
      () => createClient().from('recipes').delete().eq('id', id),
      { confirm: `Supprimer « ${title} » ?\nCette action est définitive.` },
    );
    if (ok) setRecipeList((prev) => prev.filter((r) => r.id !== id));
  }

  async function delPlan(plan: PlanningRow) {
    // Un plan déjà cuisiné (au moins une exécution) ne peut pas être supprimé
    // — `executions.planning_id` est en ON DELETE RESTRICT pour garantir la
    // trace des recettes réalisées (cf. CLAUDE.md). On l'archive à la place.
    const hasExecutions = (plan.executions?.[0]?.count || 0) > 0;
    const ok = await mutate(
      () =>
        hasExecutions
          ? createClient().from('planning').update({ status: 'archive' }).eq('id', plan.id)
          : createClient().from('planning').delete().eq('id', plan.id),
      {
        confirm: hasExecutions
          ? 'Cette recette a déjà été cuisinée : elle sera archivée (conservée dans l’historique) plutôt que supprimée. Continuer ?'
          : 'Retirer cette recette du planning ?',
      },
    );
    if (ok) setPlanningList((prev) => prev.filter((p) => p.id !== plan.id));
  }

  return (
    <section className="mt-16">
      <LoadingOverlay visible={busy} label="Traitement en cours…" />
      <div className="flex border-b border-outline-variant overflow-x-auto scrollbar-hide">
        {TABS.map((t) => {
          const cls = `px-6 py-4 font-label-md whitespace-nowrap ${
            tab === t.key
              ? 'text-primary border-b-2 border-primary'
              : 'text-on-surface-variant hover:text-primary'
          }`;
          return t.href ? (
            <Link key={t.key} href={t.href} className={cls}>
              {t.label}
            </Link>
          ) : (
            <button key={t.key} onClick={() => switchTab(t.key)} className={cls}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Carnet */}
      {tab === 'recipes' && (
        <div className="py-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {recipeList.map((r) => {
            const st = STATUS[r.status] || STATUS.draft;
            const times = effectiveTimes(r);
            return (
              <div
                key={r.id}
                className="group relative bg-surface-container-lowest border border-outline-variant hover:shadow-lg transition-all duration-500 hover:-translate-y-1"
              >
                <Link href={`/recette/${r.id}`} className="block">
                  <div className="aspect-[4/3] bg-surface-container overflow-hidden relative">
                    {cardHeroSrc(r) ? (
                      // eslint-disable-next-line @next/next/no-img-element -- route image / cross-origin
                      <img
                        src={cardHeroSrc(r)!}
                        alt={r.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-on-surface-variant">
                        <span className="material-symbols-outlined text-5xl">cake</span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-2 z-10">
                      <span className={`${st.badge} text-white text-[10px] font-label-md px-2 py-1 rounded`}>
                        {st.label}
                      </span>
                      <span className="bg-white/90 text-primary text-[10px] font-label-md px-2 py-1 rounded">
                        {r.is_public === false ? 'Privée' : 'Publique'}
                      </span>
                    </div>
                  </div>
                </Link>
                <Link
                  href={`/recette/${r.id}?planifier=1`}
                  title="Planifier cette recette"
                  prefetch={false}
                  className="absolute top-3 right-[9rem] z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform"
                >
                  <PlanBadgeIcon />
                </Link>
                <Link
                  href={`/creer?id=${r.id}`}
                  title="Modifier"
                  prefetch={false}
                  className="absolute top-3 right-[6.25rem] z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform"
                >
                  <span className="material-symbols-outlined text-[20px] text-primary">edit_note</span>
                </Link>
                <FavoriteHeart recipeId={r.id} initialFav={favIds.includes(r.id)} className="top-3 right-14" />
                <button
                  type="button"
                  title="Supprimer"
                  onClick={() => delRecipe(r.id, r.title)}
                  className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/90 shadow flex items-center justify-center hover:scale-110 transition-transform"
                >
                  <span className="material-symbols-outlined text-[20px] text-error">delete</span>
                </button>
                <div className="p-6">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {(r.difficulties?.level || 0) > 0 && (
                        <span className="flex items-center gap-0.5 shrink-0">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <MaryseIcon
                              key={i}
                              size={14}
                              className={i <= (r.difficulties?.level || 0) ? 'text-primary' : 'text-outline-variant'}
                            />
                          ))}
                        </span>
                      )}
                      {r.difficulties?.name && (
                        <span className="font-label-md text-label-md text-on-surface shrink-0">{r.difficulties.name}</span>
                      )}
                      {r.recipe_types?.name && (
                        <span className="font-label-md text-label-md text-secondary uppercase tracking-widest text-xs truncate">
                          {r.recipe_types.name}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-on-surface-variant whitespace-nowrap shrink-0">
                      {formatTime(times.total || times.prep)}
                    </span>
                  </div>
                  <Link href={`/recette/${r.id}`}>
                    <h3 className="font-headline-md text-xl text-on-surface mb-2 group-hover:text-primary transition-colors">
                      {r.title}
                    </h3>
                  </Link>
                  {r.description && (
                    <p className="text-sm text-on-surface-variant line-clamp-2 mb-4">{r.description}</p>
                  )}
                  <AllergenPictosView items={r.allergenItems} className="mb-4" iconClassName="w-6 h-6" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-secondary">
                      {formatDate(r.created_at)}
                      {r.rating_avg ? ' · ' + Number(r.rating_avg).toFixed(1) + ' ★' : ''}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Carnet vide : message d'accueil (les cartes d'action ont été retirées
          au profit de l'onglet « Import de recettes » et du bouton d'en-tête). */}
      {tab === 'recipes' && recipeList.length === 0 && (
        <div className="text-center pb-12">
          <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-4 block">cake</span>
          <h2 className="font-headline-md text-primary">Votre carnet est vide</h2>
          <p className="font-body-md text-on-surface-variant max-w-sm mx-auto mt-2">
            Créez votre première recette ou importez-en une depuis une adresse web ou un texte.
          </p>
        </div>
      )}

      {/* Favoris */}
      {tab === 'favorites' && (
        <div className="py-10">
          {favorites.filter((f) => f.recipes).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {favorites
                .filter((f) => f.recipes)
                .map((f) => <RecipeCardClient key={f.recipes!.id} recipe={f.recipes!} isFav={true} />)}
            </div>
          ) : (
            <div className="text-center py-12">
              <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-4 block">
                star_outline
              </span>
              <h2 className="font-headline-md text-primary">Vos coups de cœur</h2>
              <p className="font-body-md text-on-surface-variant max-w-sm mx-auto mt-2">
                Retrouvez ici toutes les recettes que vous avez marquées comme favorites.
              </p>
              <Link
                href="/"
                className="inline-block mt-6 border border-primary text-primary px-6 py-2 rounded-full font-label-md text-label-md hover:bg-primary hover:text-white transition-all"
              >
                Explorer les recettes
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Planning */}
      {tab === 'planning' && (
        <div className="py-10">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
            <h2 className="font-headline-md text-primary flex items-center gap-3">
              <span className="material-symbols-outlined">calendar_month</span> Recettes planifiées
            </h2>
            {planningList.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => switchPlanningView('recettes')}
                  className={`px-4 py-2 rounded-full font-label-md text-label-md border ${planningView === 'recettes' ? 'bg-primary text-white border-primary' : 'border-outline-variant text-on-surface-variant hover:text-primary'}`}
                >
                  Vue par recette
                </button>
                <button
                  type="button"
                  onClick={() => switchPlanningView('jours')}
                  className={`px-4 py-2 rounded-full font-label-md text-label-md border ${planningView === 'jours' ? 'bg-primary text-white border-primary' : 'border-outline-variant text-on-surface-variant hover:text-primary'}`}
                >
                  Vue par jour
                </button>
              </div>
            )}
          </div>
          {planningView === 'jours' ? (
            <PlanningDayView plans={planningList} runningExecSteps={runningExecSteps} />
          ) : planningList.length > 0 ? (
            <div className="space-y-4 max-w-3xl">
              {planningList.map((p) => {
                const timeTxt = p.recipes?.total_time || p.recipes?.prep_time ? formatTime(p.recipes.total_time || p.recipes.prep_time) : '';
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
                    className="p-6 border border-outline-variant rounded-lg bg-white flex justify-between items-center group hover:bg-surface-container transition-colors"
                  >
                    <Link
                      href={`/recette/${p.recipes?.id || p.recipe_id}?plan=${p.id}`}
                      className="flex gap-4 items-center"
                    >
                      <div className="w-16 h-16 rounded bg-surface-container-high overflow-hidden flex items-center justify-center shrink-0">
                        {p.recipes && cardHeroSrc(p.recipes) ? (
                          // eslint-disable-next-line @next/next/no-img-element -- route image / cross-origin
                          <img src={cardHeroSrc(p.recipes)!} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="material-symbols-outlined text-on-surface-variant">cake</span>
                        )}
                      </div>
                      <div>
                        <p className="font-label-md text-primary">{p.recipes?.title || ''}</p>
                        <p className="font-body-md text-[12px] text-on-surface-variant">{meta}</p>
                        {p.notes && <p className="font-body-md text-[12px] text-on-surface-variant italic">{p.notes}</p>}
                      </div>
                    </Link>
                    <div className="flex items-center gap-3 shrink-0">
                      {p.active_execution.length > 0 ? (
                        <Link
                          href={`/execution/${p.active_execution[0].id}`}
                          className="flex items-center gap-1.5 bg-secondary/90 text-white px-3 py-1.5 rounded-full font-label-md text-[11px] whitespace-nowrap hover:opacity-90"
                        >
                          <span className="material-symbols-outlined text-[14px]">play_circle</span> Session en cours
                        </Link>
                      ) : (
                        <Link
                          href={`/recette/${p.recipes?.id || p.recipe_id}?plan=${p.id}&demarrer=1`}
                          className="flex items-center gap-1.5 border border-primary text-primary px-3 py-1.5 rounded-full font-label-md text-[11px] whitespace-nowrap hover:bg-primary hover:text-white transition-colors"
                        >
                          <span className="material-symbols-outlined text-[14px]">play_arrow</span> Démarrer une session
                        </Link>
                      )}
                      <button
                        type="button"
                        title="Retirer du planning"
                        onClick={() => delPlan(p)}
                        className="text-error opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-error/10"
                      >
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-on-surface-variant italic">
              Aucune recette planifiée pour le moment. Ouvrez une recette et cliquez sur « Planifier ».
            </p>
          )}
        </div>
      )}

      {/* Sessions actives */}
      {tab === 'sessions' && (
        <div className="py-10">
          <h2 className="font-headline-md text-primary mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined">play_circle</span> Sessions actives
          </h2>
          {activeSessions.length > 0 ? (
            <div className="space-y-4 max-w-3xl">
              {activeSessions.map((x) => (
                <Link
                  key={x.id}
                  href={`/execution/${x.id}`}
                  className="p-6 border border-outline-variant rounded-lg bg-white flex justify-between items-center gap-4 hover:bg-surface-container transition-colors"
                >
                  <div>
                    <p className="font-label-md text-primary">{x.planning?.recipe_title || 'Session de préparation'}</p>
                    <p className="font-body-md text-[12px] text-on-surface-variant">
                      Démarrée le{' '}
                      {new Date(x.date_debut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="font-label-md text-label-md text-primary whitespace-nowrap">Reprendre</span>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-on-surface-variant italic">
              Aucune session de préparation en cours. Démarrez-en une depuis une recette planifiée.
            </p>
          )}
        </div>
      )}

      {/* Listes de courses */}
      {tab === 'courses' && (
        <div className="py-10">
          <h2 className="font-headline-md text-primary mb-6 flex items-center gap-3">
            <span className="material-symbols-outlined">shopping_bag</span> Mes listes de courses
          </h2>
          {shoppingList.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse bg-white border border-outline-variant rounded-lg overflow-hidden">
                <thead className="bg-surface-container font-label-md text-on-surface-variant border-b border-outline-variant">
                  <tr>
                    <th className="px-6 py-3 font-semibold uppercase tracking-wider text-xs">Nom</th>
                    <th className="px-6 py-3 font-semibold uppercase tracking-wider text-xs text-center">Articles</th>
                    <th className="px-6 py-3 font-semibold uppercase tracking-wider text-xs text-center">Cochés</th>
                    <th className="px-6 py-3 font-semibold uppercase tracking-wider text-xs">Créée le</th>
                    <th className="px-6 py-3 font-semibold uppercase tracking-wider text-xs text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant font-body-md text-on-surface">
                  {shoppingList.map((l) => {
                    const items = l.shopping_list_items || [];
                    const done = items.filter((i) => i.checked).length;
                    const allDone = items.length > 0 && done === items.length;
                    const struck = allDone ? 'line-through opacity-50' : '';
                    return (
                      <Fragment key={l.id}>
                        <tr className="hover:bg-surface-container-low transition-colors">
                          <td className="px-6 py-4">
                            <Link
                              href={`/courses/${l.id}`}
                              className={`font-label-md text-primary hover:underline flex items-center gap-2 text-left ${struck}`}
                            >
                              <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
                              {l.name}
                            </Link>
                          </td>
                          <td className={`px-6 py-4 text-center text-on-surface-variant ${struck}`}>{items.length}</td>
                          <td className={`px-6 py-4 text-center text-on-surface-variant ${struck}`}>{done}</td>
                          <td className={`px-6 py-4 text-on-surface-variant ${struck}`}>
                            {l.created_at ? formatDate(l.created_at) : '—'}
                          </td>
                          <td className="px-6 py-4 text-right whitespace-nowrap">
                            <button
                              type="button"
                              title="Fusionner avec une autre liste"
                              onClick={() => setMergingListId(mergingListId === l.id ? null : l.id)}
                              className="p-1.5 rounded text-primary hover:bg-primary/10 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">call_merge</span>
                            </button>
                            <button
                              type="button"
                              title="Supprimer la liste"
                              onClick={() => delShoppingList(l.id, l.name)}
                              className="p-1.5 rounded text-error hover:bg-error/10 transition-colors"
                            >
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </td>
                        </tr>
                        {mergingListId === l.id && (
                          <tr>
                            <td colSpan={5} className="px-6 py-4 bg-surface-container-low">
                              <MergeListRow
                                candidates={shoppingList.filter((o) => o.id !== l.id)}
                                onMerge={(sourceId, sourceName) => mergeShoppingLists(l.id, sourceId, l.name, sourceName)}
                                onCancel={() => setMergingListId(null)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-on-surface-variant italic text-sm">
              Aucune liste de courses. Depuis une recette, cliquez sur « Liste de courses » dans la liste
              complète des ingrédients.
            </p>
          )}
        </div>
      )}

    </section>
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
        <p className="text-sm text-on-surface-variant italic">Aucune autre liste à fusionner.</p>
        <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
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
          className="border border-outline-variant rounded px-3 py-1.5 font-body-md text-sm bg-white"
          style={{ minWidth: '16rem' }}
        >
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({(c.shopping_list_items || []).length} article{(c.shopping_list_items || []).length > 1 ? 's' : ''})
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
        className="bg-primary text-on-primary px-4 py-1.5 rounded-full font-label-md text-[12px]"
      >
        Fusionner
      </button>
      <button type="button" onClick={onCancel} className="border border-outline px-4 py-1.5 rounded-full font-label-md text-[12px] text-on-surface-variant">
        Annuler
      </button>
    </div>
  );
}
