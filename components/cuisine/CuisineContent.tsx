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
import { libelleAjustement } from '@/lib/batch-ai';
import { isProjectDraft, titreAvecProjet } from '@/lib/projects';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { useWriteGuard } from '@/components/ImpersonationProvider';
import { HelpSlotClient } from '@/components/help/HelpSlotClient';
import type { VisibleHelpBlock } from '@/lib/help';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDate, formatTime } from '@/lib/format';
import { PlanningDayView } from '@/components/profile/PlanningDayView';
import { PlanningIcon, DISC } from '@/components/PlanningIcon';
import { ArchivedShoppingLists } from '@/components/cuisine/ArchivedShoppingLists';
import { BATCH_FULL_SELECT, BATCH_STATUS_LBL, TERMINEES_PAGE_SIZE, fmtNum, type BatchFull } from '@/lib/recipe-plan';
import type { BatchListRow, ShoppingListSummary } from '@/lib/profile';
import { translateQuotaError } from '@/lib/quota-message-client';
import type { ConversionRef, UnitRef } from '@/lib/ingredient-conversions';
import { useRefaireFournee } from '@/components/batch/RefaireFournee';
import { LockedAction } from '@/components/LockedAction';
import { findMergeTarget } from '@/lib/shopping-merge';
import { NOM_A_RACHETER, estListeARacheter, rangerListes } from '@/lib/a-racheter';
import { RecipeToc, type TocAction, type TocSections } from '@/components/recipe/RecipeToc';
import { useTactile } from '@/lib/use-tactile';

type PlanningView = 'jours' | 'recettes';

// « Coefficient ×1,5 » — masqué à ×1 (fournée non ajustée : rien à signaler).
function coefficientTexte(factor: number | string | null | undefined): string {
  const n = Number(factor);
  if (!factor || !Number.isFinite(n) || n === 1) return '';
  return 'Coefficient ×' + fmtNum(n);
}

export function CuisineContent({
  planning,
  batchesTerminees,
  shoppingLists,
  droits,
  conversions,
  units,
  userId,
  nbRealisations,
  helpBlocks,
}: {
  planning: BatchListRow[];
  // Fournées closes (terminées ou abandonnées) — écran dédié plutôt qu'un
  // repli d'affichage, pour rester un vrai second sort plutôt qu'une case
  // oubliée du planning actif.
  batchesTerminees: BatchListRow[];
  shoppingLists: ShoppingListSummary[];
  // Droits d'abonnement (§4) : fusion de listes de courses, réordonnancement
  // des étapes dans le planning du jour.
  droits: { fusionListes: boolean; reordonnancement: boolean; aRacheter: boolean };
  // Référentiels de conversion (JEP-249) : la fusion de deux listes convertit
  // les unités d'un même ingrédient, comme le récapitulatif d'une fiche recette.
  conversions: ConversionRef[];
  units: UnitRef[];
  // Propriétaire d'une liste créée à la main (« Nouvelle liste de courses ») :
  // connu du rendu serveur, ce qui évite un `getUser()` de plus.
  userId: string;
  // Photos de « Mes réalisations » (section rendue par la page, sous ce
  // contenu) : seulement pour l'entrée du sommaire.
  nbRealisations: number;
  // Blocs d'aide de la page « courses » (picto « ? » du titre des listes).
  helpBlocks: VisibleHelpBlock[];
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
  // « archivée » — elle n'a simplement encore rien à cocher. La liste
  // « À racheter » (JEP-379) est mise à part : en tête, jamais archivée,
  // jamais fusionnée, masquée tant qu'elle est vide (`rangerListes`).
  const {
    aRacheter,
    actives: activeShoppingLists,
    archivees: archivedShoppingLists,
  } = rangerListes(shoppingList);
  // « À racheter » absente ou vide, et formule qui l'autorise : on propose de
  // la créer (ou de l'ouvrir si elle existe déjà, vide). Elle ne naît que par
  // la route (clé service_role), jamais depuis le navigateur.
  const listeSysteme = shoppingList.find(estListeARacheter) ?? null;
  const proposerARacheter = droits.aRacheter && !aRacheter;
  const [creationARacheter, setCreationARacheter] = useState(false);
  async function ouvrirARacheter() {
    if (!writeGuard('Créer la liste « À racheter »')) return;
    if (listeSysteme) {
      setCreationARacheter(true);
      router.push(`/courses/${listeSysteme.id}`);
      return;
    }
    setCreationARacheter(true);
    try {
      const res = await fetch('/api/courses/a-racheter', { method: 'PUT' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json.id !== 'number') {
        setCreationARacheter(false);
        await dialog.alert(json.erreur || 'Création impossible pour le moment.');
        return;
      }
      router.push(`/courses/${json.id}`);
    } catch {
      setCreationARacheter(false);
      await dialog.alert('Création impossible pour le moment.');
    }
  }
  const [mergingListId, setMergingListId] = useState<number | null>(null);
  // La vue par jour est la vue par défaut (décision produit) : c'est elle
  // qui rend le planning actionnable sans ouvrir chaque fournée une à une.
  const [planningView, setPlanningView] = useState<PlanningView>('jours');
  // Vue « Par jour » à la souris, dès 1024 px : la vue semaine du planning
  // prend toute la largeur et les courses passent dessous. Ailleurs (« Par
  // fournée », appareil tactile), planning et courses restent côte à côte.
  const tactile = useTactile();
  const semainePleineLargeur = planningView === 'jours' && !tactile;

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

  // « Nouvelle liste de courses » : une liste vide, nommée à la main, que l'on
  // remplit ensuite sur sa page (saisie d'articles, unité obligatoire). Jusque-
  // là une liste ne naissait que d'une fournée ou d'une recette. Plafond
  // `listes_courses_max` tenu par le trigger de la base (message traduit par
  // `useMutation`).
  const [ouvertureListe, setOuvertureListe] = useState(false);
  async function creerListeVide() {
    const nom = (
      await dialog.prompt('Nom de la nouvelle liste de courses', {
        singleLine: true,
        required: true,
        placeholder: 'Ex. Courses du week-end',
        maxLength: 80,
      })
    )?.trim();
    if (!nom) return;
    let id: number | null = null;
    const ok = await mutate(
      async () => {
        const res = await createClient().from('shopping_lists').insert({ user_id: userId, name: nom }).select('id').single();
        if (res.data) id = res.data.id;
        return res;
      },
      // Pas de resynchronisation : on quitte l'écran pour la liste créée.
      { errorLabel: 'Création impossible', refresh: false },
    );
    if (!ok || id === null) return;
    setOuvertureListe(true);
    router.push(`/courses/${id}`);
  }

  async function delShoppingList(id: number, name: string) {
    const ok = await mutate(() => createClient().from('shopping_lists').delete().eq('id', id), {
      confirm: `Supprimer la liste « ${name} » ?`,
    });
    if (ok) setShoppingList((prev) => prev.filter((l) => l.id !== id));
  }

  // Fusion de deux listes entières : un article de la liste source rejoint la
  // ligne du MÊME ingrédient de la liste cible (singulier/pluriel/ligature
  // compris) — même unité, ou autre unité reliée par une conversion, auquel
  // cas sa quantité est convertie dans l'unité de la ligne cible (JEP-249,
  // comme le récapitulatif d'une fiche recette). Les autres articles sont
  // simplement rattachés à la liste cible — puis la liste source, vidée, est
  // supprimée. Le commentaire doit être identique : une ligne commentée reste à
  // part (rattachée à la liste cible, avec son commentaire). `pool` suit les lignes cibles au fil de la fusion : un article
  // rattaché y entre aussi, pour que le suivant puisse le rejoindre.
  async function mergeShoppingLists(targetId: number, sourceId: number, targetName: string, sourceName: string) {
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const { data: rows, error: fetchErr } = await supabase
          .from('shopping_list_items')
          .select('id, list_id, name, quantity, unit, comment, ref_id')
          .in('list_id', [targetId, sourceId]);
        if (fetchErr) return { error: fetchErr };
        const pool = (rows || []).filter((r) => r.list_id === targetId);
        for (const s of (rows || []).filter((r) => r.list_id === sourceId)) {
          const hit = findMergeTarget(pool, s, conversions, units);
          if (hit) {
            hit.item.quantity = hit.quantity;
            const { error } = await supabase.from('shopping_list_items').update({ quantity: hit.item.quantity }).eq('id', hit.item.id);
            if (error) return { error };
            const { error: delErr } = await supabase.from('shopping_list_items').delete().eq('id', s.id);
            if (delErr) return { error: delErr };
          } else {
            const { error } = await supabase.from('shopping_list_items').update({ list_id: targetId }).eq('id', s.id);
            if (error) return { error };
            pool.push({ ...s, list_id: targetId });
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

  // « Refaire cette fournée » : fenêtre et duplication partagées avec la fiche recette.
  const { refaire: refaireBatch, refaisant, element: refaireElement } = useRefaireFournee({ overlay: false });

  // ── Sommaire (panneau gauche sous 1024 px, rail au-dessus) ──────────────
  // Proposition C de la refonte d'« En cuisine » (15/11/2026) : les listes de
  // courses et les archives étaient introuvables sous le planning. Chaque
  // entrée porte son compteur ; une section absente n'a pas d'entrée.
  const nbCourses = activeShoppingLists.length + (aRacheter ? 1 : 0);
  const aDesArchives = terminees.length > 0 || archivedShoppingLists.length > 0;
  const sommaire: TocSections = {
    before: [
      { id: 'sec-fournees', label: `Mes fournées (${planningList.length})`, icon: 'event', level: 1 },
      // Les deux vues de « Mes fournées » : l'entrée bascule la vue (`ouvrirSection`)
      // puis défile vers l'ancre posée en tête de la section.
      ...(planningList.length > 0
        ? [
            { id: 'sec-vue-jours', label: 'Mon planning (par jour)', icon: 'calendar_month', level: 2 as const },
            { id: 'sec-vue-recettes', label: 'Par fournée', icon: 'list_alt', level: 2 as const },
          ]
        : []),
      { id: 'sec-courses', label: `Listes de courses (${nbCourses})`, icon: 'shopping_bag', level: 1 },
      ...(aDesArchives ? [{ id: 'sec-archives', label: 'Archives', icon: 'inventory_2', level: 1 as const }] : []),
      ...(terminees.length > 0
        ? [{ id: 'sec-archives-fournees', label: `Fournées terminées (${terminees.length}${hasMoreTerminees ? '+' : ''})`, icon: 'history', level: 2 as const }]
        : []),
      ...(archivedShoppingLists.length > 0
        ? [{ id: 'sec-archives-listes', label: `Listes terminées (${archivedShoppingLists.length})`, icon: 'receipt_long', level: 2 as const }]
        : []),
      ...(nbRealisations > 0
        ? [{ id: 'mes-realisations', label: `Mes réalisations (${nbRealisations})`, icon: 'photo_library', level: 1 as const }]
        : []),
    ],
    after: [],
  };
  // Une entrée qui vise un volet replié (archives, réalisations) l'ouvre avant
  // le défilement : sans cela, on n'atteindrait que son titre.
  const ouvrirSection = (id: string) => {
    if (id === 'sec-vue-jours') switchPlanningView('jours');
    if (id === 'sec-vue-recettes') switchPlanningView('recettes');
    const el = document.getElementById(id);
    const volet = el instanceof HTMLDetailsElement ? el : el?.querySelector<HTMLDetailsElement>(':scope > details');
    if (volet) volet.open = true;
  };
  // Actions : bouton central de la barre basse sous 1024 px, pied du rail au-dessus.
  // Défilement vers une section après la fermeture de la feuille : on attend deux
  // images pour que le verrou de défilement de la page soit levé (même raison que
  // `goTo` de RecipeToc) et, pour le changement de vue, que le rendu soit appliqué.
  const allerA = (id: string) => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })),
    );
  };
  const actions: TocAction[] = [
    {
      id: 'nouvelle-liste',
      icon: 'playlist_add',
      label: 'Nouvelle liste de courses',
      variant: 'filled',
      role: 'principale',
      onClick: creerListeVide,
    },
    // La liste « Par fournée » des fournées planifiées.
    {
      id: 'voir-en-cours',
      icon: 'local_fire_department',
      label: 'Voir mes fournées en cours',
      variant: 'outline',
      onClick: () => {
        switchPlanningView('recettes');
        allerA('sec-fournees');
      },
    },
    // Le planning = la vue « Par jour » (étapes cochables, toutes fournées confondues).
    {
      id: 'voir-planning',
      icon: 'calendar_month',
      label: 'Voir mon planning de fournées',
      variant: 'outline',
      onClick: () => {
        switchPlanningView('jours');
        allerA('sec-fournees');
      },
    },
    ...(proposerARacheter
      ? [
          {
            id: 'a-racheter',
            icon: 'add_shopping_cart',
            label: listeSysteme ? `Ouvrir « ${NOM_A_RACHETER} »` : `Créer la liste « ${NOM_A_RACHETER} »`,
            variant: 'outline' as const,
            onClick: ouvrirARacheter,
          },
        ]
      : []),
    ...(aRacheter
      ? [
          {
            id: 'a-racheter',
            icon: 'add_shopping_cart',
            label: `Ouvrir « ${NOM_A_RACHETER} »`,
            variant: 'outline' as const,
            onClick: () => router.push(`/courses/${aRacheter.id}`),
          },
        ]
      : []),
  ];

  return (
    <>
      {refaireElement}
      <RecipeToc
        sections={sommaire}
        steps={[]}
        onNavigateToSection={ouvrirSection}
        actions={actions}
        mobile="drawer"
        mobileInset="nav"
        bascule="lg"
        libelle="Sommaire d'En cuisine"
      />
      <LoadingOverlay
        visible={busy || refaisant !== null || showRefreshSpinner || ouvertureListe || creationARacheter}
        label={
          refaisant !== null
            ? 'Recréation de la fournée…'
            : ouvertureListe || creationARacheter
              ? 'Ouverture de la liste…'
              : showRefreshSpinner
                ? 'Actualisation…'
                : 'Traitement en cours…'
        }
      />

      {/* ── Mes fournées + Listes de courses ─────────────────────────────
          Côte à côte au bureau (grille 12 colonnes, 7/5), empilées sur
          mobile : la liste de courses ne vit jamais sur un autre écran,
          elle naît de ce qui est planifié juste à côté. */}
      <div className="mt-12 lg:grid lg:grid-cols-12 lg:gap-x-16">
      {/* ── Mes fournées ──────────────────────────────────────────────── */}
      <section id="sec-fournees" className={`scroll-mt-28 ${semainePleineLargeur ? 'lg:col-span-12' : 'lg:col-span-7'}`}>
        {/* Ancres des deux vues (entrées du sommaire) : même position, le clic bascule la vue. */}
        <span id="sec-vue-jours" className="block scroll-mt-28" />
        <span id="sec-vue-recettes" className="block scroll-mt-28" />
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
          <PlanningDayView plans={planningList} canReorder={droits.reordonnancement} />
        ) : planningList.length > 0 ? (
          <div className="max-w-3xl space-y-4">
            {planningList.map((p) => {
              const timeTxt = p.recipes?.total_time || p.recipes?.prep_time ? formatTime(p.recipes.total_time || p.recipes.prep_time) : '';
              // Nombre de jours de la fournée matérialisée (day_offset des
              // batch_steps), pas de la recette de base.
              const daysCount = new Set([0, ...p.batch_steps.map((s) => Math.max(0, s.day_offset || 0))]).size;
              const daysTxt = daysCount > 1 ? `${daysCount} jours` : '';
              const durationTxt = [timeTxt, daysTxt].filter(Boolean).join(' · ');
              const titre = titreAvecProjet(p.recipe_title || p.recipes?.title || '', p.recipes);
              // Cartes de fournée (15/11/2026) : titre sur une ligne, date, coefficient,
              // puis la rangée d'actions dessous — toujours visible (au survol seul,
              // elle était introuvable au doigt).
              const dateTxt = [
                p.planned_date
                  ? 'Prévu pour ' + new Date(p.planned_date + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
                  : '',
                durationTxt,
              ]
                .filter(Boolean)
                .join(' · ');
              const coefTxt = [coefficientTexte(p.factor), libelleAjustement(p.adjust_label) || ''].filter(Boolean).join(' · ');
              return (
                <div key={p.id} className="flex items-start gap-4 rounded-lg border border-outline-variant bg-white p-4 transition-colors hover:bg-surface-container">
                  <Link href={`/fournee/${p.id}`} className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-container-high">
                    <VignetteFournee recette={p.recipes} />
                  </Link>
                  {/* Colonne de droite : titre au niveau du haut de la photo, infos
                      serrées, gestes dessous — la carte ne dépasse guère la photo. */}
                  <div className="min-w-0 flex-1">
                    <Link href={`/fournee/${p.id}`} className="block">
                      <p className="line-clamp-2 font-label-md leading-snug text-primary" title={titre}>{titre}</p>
                      {dateTxt && <p className="font-body-md text-[12px] leading-snug text-on-surface-variant">{dateTxt}</p>}
                      {coefTxt && <p className="font-body-md text-[12px] font-semibold leading-snug text-on-surface-variant">{coefTxt}</p>}
                      {p.notes && <p className="truncate font-body-md text-[12px] italic leading-snug text-on-surface-variant">{p.notes}</p>}
                    </Link>
                    {/* Deux entrées, comme sur une fournée en cours et dans la
                        vue « Par jour » : Préparer (ajuster, cocher ce qui est
                        déjà fait) reste accessible sans passer par Pâtisser,
                        qui pose `date_debut` au premier affichage. */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link
                        href={`/fournee/${p.id}?mode=preparer`}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-outline-variant px-3 py-1 font-label-md text-[12px] text-on-surface-variant transition-colors hover:border-primary hover:text-primary"
                      >
                        <span className="material-symbols-outlined text-[16px]">tune</span>
                        Préparer
                      </Link>
                      <Link
                        href={`/fournee/${p.id}`}
                        className="flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-primary px-3 py-1 font-label-md text-[12px] text-primary transition-colors hover:bg-primary hover:text-white"
                      >
                        <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                        Pâtisser
                      </Link>
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          title="Refaire cette fournée"
                          onClick={() => refaireBatch(p)}
                          className="rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                        </button>
                        <button
                          type="button"
                          title="Supprimer"
                          onClick={() => delPlan(p, false)}
                          className="rounded p-1 text-error transition-colors hover:bg-error/10"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
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
      </section>

      {/* ── Listes de courses ──────────────────────────────────────────── */}
      <section id="sec-courses" className={`mt-14 scroll-mt-28 ${semainePleineLargeur ? 'lg:col-span-12' : 'lg:col-span-5 lg:mt-0'}`}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-3 font-headline-md text-primary">
            <span className="material-symbols-outlined">shopping_bag</span> Listes de courses
            <HelpSlotClient blockKey="courses.listes" blocks={helpBlocks} />
          </h2>
          <button
            type="button"
            onClick={creerListeVide}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-primary px-3 py-1.5 font-label-md text-[12px] text-primary transition-colors hover:bg-primary hover:text-white"
          >
            <span className="material-symbols-outlined text-[16px]">playlist_add</span>
            Nouvelle liste
          </button>
        </div>
        {aRacheter && <ARacheterCard liste={aRacheter} />}
        {proposerARacheter && <ARacheterVide existe={!!listeSysteme} onClick={ouvrirARacheter} />}
        {activeShoppingLists.length > 0 ? (
          // Pleine largeur (vue semaine au-dessus) : listes en grille plutôt
          // qu'en bandes étirées sur tout l'écran.
          <div className={semainePleineLargeur ? 'space-y-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0' : 'space-y-4'}>
            {activeShoppingLists.map((l) => {
              const items = l.shopping_list_items || [];
              const done = items.filter((i) => i.checked).length;
              const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;
              return (
                // Toute la carte ouvre la liste : la zone cliquable du titre est
                // étendue à la carte (`after:inset-0`), les boutons et le
                // panneau de fusion passent au-dessus (`relative z-10`).
                <div key={l.id} className="relative rounded-lg border border-outline-variant p-5 transition-colors hover:bg-surface-container-low">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <Link
                      href={`/courses/${l.id}`}
                      className="font-label-md text-[15px] text-primary hover:text-secondary after:absolute after:inset-0 after:rounded-lg after:content-['']"
                    >
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
                    <div className="relative z-10 flex shrink-0 gap-1">
                      {droits.fusionListes ? (
                        <button
                          type="button"
                          title="Fusionner avec une autre liste"
                          onClick={() => setMergingListId(mergingListId === l.id ? null : l.id)}
                          className="rounded p-1.5 text-primary transition-colors hover:bg-primary/10"
                        >
                          <span className="material-symbols-outlined text-[18px]">call_merge</span>
                        </button>
                      ) : (
                        // JEP-130 : le bouton n'était pas affiché du tout —
                        // la fusion de deux listes est une fonctionnalité que
                        // rien n'annonçait aux formules qui n'y ont pas
                        // droit. La suppression, elle, reste ouverte à tous
                        // juste à côté.
                        <LockedAction
                          label="Fusionner avec une autre liste"
                          message="Fusionner deux listes de courses n'est pas inclus dans votre formule."
                          className="rounded p-1.5"
                        />
                      )}
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
                    <div className="relative z-10 mt-4 border-t border-outline-variant/60 pt-4">
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
        ) : aRacheter ? null : (
          <p className="text-sm italic text-on-surface-variant">
            Aucune liste de courses active. Créez-en une avec « Nouvelle liste », ou depuis une fournée avec
            « Liste de courses » dans la liste complète des ingrédients.
          </p>
        )}
      </section>
      </div>

      {/* ── Archives ─────────────────────────────────────────────────────
          Fournées terminées et listes de courses terminées réunies sous un même
          titre, pleine largeur sous la grille (elles étaient chacune au pied de
          sa colonne, introuvables sur téléphone). Volets repliés : le sommaire
          les ouvre (`ouvrirSection`). */}
      {aDesArchives && (
        <section id="sec-archives" className="mt-14 scroll-mt-28 border-t border-outline-variant/60 pt-8">
          <h2 className="mb-6 flex items-center gap-3 font-headline-md text-primary">
            <span className="material-symbols-outlined">inventory_2</span> Archives
          </h2>
          <div className="space-y-8">
            {terminees.length > 0 && (
              <details id="sec-archives-fournees" className="group scroll-mt-28">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-headline-md text-[20px] leading-tight text-primary">
                  Fournées terminées ({terminees.length}{hasMoreTerminees ? '+' : ''})
                  <span className="material-symbols-outlined text-[24px] transition-transform group-open:rotate-180">expand_more</span>
                </summary>
                <div className="mt-4 max-w-3xl space-y-4">
                  {terminees.map((p) => {
                    const timeTxt = p.recipes?.total_time || p.recipes?.prep_time ? formatTime(p.recipes.total_time || p.recipes.prep_time) : '';
                    const titre = titreAvecProjet(p.recipe_title || p.recipes?.title || '', p.recipes);
                    const dateTxt = [p.planned_date ? 'Prévu pour ' + formatDate(p.planned_date) : '', timeTxt].filter(Boolean).join(' · ');
                    const coefTxt = coefficientTexte(p.factor);
                    return (
                      <div key={p.id} className="flex items-start gap-4 rounded-lg border border-outline-variant bg-white p-4 opacity-80 transition-opacity hover:opacity-100">
                        <Link href={`/fournee/${p.id}?lecture=1&mode=preparer`} className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded bg-surface-container-high">
                          <VignetteFournee recette={p.recipes} />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link href={`/fournee/${p.id}?lecture=1&mode=preparer`} className="block">
                            <p className="line-clamp-2 font-label-md leading-snug text-primary" title={titre}>{titre}</p>
                            {dateTxt && <p className="font-body-md text-[12px] leading-snug text-on-surface-variant">{dateTxt}</p>}
                            {coefTxt && <p className="font-body-md text-[12px] font-semibold leading-snug text-on-surface-variant">{coefTxt}</p>}
                          </Link>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {p.refaisable && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-label-md text-green-700">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                Fournée validée
                              </span>
                            )}
                            <div className="ml-auto flex items-center gap-1">
                              <button
                                type="button"
                                title="Refaire cette fournée"
                                onClick={() => refaireBatch(p)}
                                className="shrink-0 rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                              >
                                <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                              </button>
                              <button
                                type="button"
                                title="Supprimer définitivement"
                                onClick={() => delPlan(p, true)}
                                className="shrink-0 rounded p-1 text-error transition-colors hover:bg-error/10"
                              >
                                <span className="material-symbols-outlined text-[18px]">delete</span>
                              </button>
                              {/* Étiquette de statut à droite, après les gestes (15/11/2026). */}
                              <span className={`shrink-0 rounded-full px-2.5 py-1 font-label-md text-[11px] text-white ${BATCH_STATUS_LBL[p.status]?.cls || 'bg-secondary'}`}>
                                {BATCH_STATUS_LBL[p.status]?.label || p.status}
                              </span>
                            </div>
                          </div>
                        </div>
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
            {archivedShoppingLists.length > 0 && (
              <details id="sec-archives-listes" className="group scroll-mt-28">
                <summary className="flex cursor-pointer list-none items-center gap-2 font-headline-md text-[20px] leading-tight text-primary">
                  Listes de courses terminées ({archivedShoppingLists.length})
                  <span className="material-symbols-outlined text-[24px] transition-transform group-open:rotate-180">
                    expand_more
                  </span>
                </summary>
                <div className="mt-4">
                  <ArchivedShoppingLists lists={archivedShoppingLists} />
                </div>
              </details>
            )}
          </div>
        </section>
      )}
    </>
  );
}

// Vignette d'une carte de fournée. Une fournée d'ESSAI d'un projet en cours se
// distingue (JEP-403) : picto de chantier au lieu du gâteau quand le projet n'a
// pas de photo, et pastille « Essai » posée sur la photo quand il en a une.
function VignetteFournee({
  recette,
  compacte = false,
}: {
  recette: { hero_thumb_url: string | null; kind?: string | null; project_stage?: string | null } | null;
  compacte?: boolean;
}) {
  const essai = isProjectDraft(recette);
  return (
    <>
      {recette?.hero_thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
        <img src={recette.hero_thumb_url} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className={`material-symbols-outlined ${essai ? 'text-secondary' : 'text-on-surface-variant'}`}>
          {essai ? 'construction' : 'cake'}
        </span>
      )}
      {essai && (
        <span
          title="Fournée d’essai d’un projet"
          className={`absolute inset-x-0 bottom-0 bg-secondary text-center font-label-md uppercase tracking-widest text-white ${
            compacte ? 'hidden py-0.5 text-[9px] md:block' : 'py-0.5 text-[10px]'
          }`}
        >
          Essai
        </span>
      )}
    </>
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
      {/* `min-w-0` + `w-full` : le libellé d'une option (nom de liste long) ne doit
          jamais élargir la liste au-delà de la carte — le select tronque. */}
      <label className="flex min-w-0 max-w-full flex-1 basis-64 flex-col gap-1">
        <span className="font-label-md text-[10px] uppercase text-on-surface-variant">Fusionner avec</span>
        <select
          value={sourceId}
          onChange={(e) => setSourceId(Number(e.target.value))}
          className="w-full min-w-0 max-w-full rounded border border-outline-variant bg-white px-3 py-1.5 font-body-md text-sm"
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

// Liste « À racheter » (JEP-379) : même carte que les autres listes, sans
// suppression ni fusion (liste système). Le compteur dit ce qui reste à
// racheter, pas une progression : les articles barrés y restent jusqu'à ce
// que le membre les retire depuis la liste.
function ARacheterCard({ liste }: { liste: ShoppingListSummary }) {
  const items = liste.shopping_list_items || [];
  const restants = items.filter((i) => !i.checked).length;
  return (
    // Aucun bouton sur cette carte : elle est tout entière le lien.
    <Link
      href={`/courses/${liste.id}`}
      className="group mb-4 block rounded-lg border-2 border-secondary/40 bg-secondary/5 p-5 transition-colors hover:bg-secondary/10"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 font-label-md text-[15px] text-primary group-hover:text-secondary">
          <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
          {NOM_A_RACHETER}
        </span>
        <span className="shrink-0 whitespace-nowrap text-[12px] text-on-surface-variant">
          {restants ? `${restants} à racheter` : 'Tout est racheté'}
        </span>
      </div>
      <p className="mt-2 text-[12px] text-on-surface-variant">
        Les ingrédients finis pendant une fournée, ajoutés depuis le mode Pâtisser.
      </p>
    </Link>
  );
}

// Invitation à créer (ou ouvrir, si elle existe déjà mais vide) la liste
// « À racheter » — seulement pour une formule qui y a droit.
function ARacheterVide({ existe, onClick }: { existe: boolean; onClick: () => void }) {
  return (
    <div className="mb-4 rounded-lg border-2 border-dashed border-secondary/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 font-label-md text-[15px] text-primary">
          <span className="material-symbols-outlined text-[18px]">add_shopping_cart</span>
          {NOM_A_RACHETER}
        </span>
        <button
          type="button"
          onClick={onClick}
          className="shrink-0 whitespace-nowrap rounded-pill border border-primary px-3 py-1.5 font-label-md text-[12px] text-primary transition-colors hover:bg-primary hover:text-white"
        >
          {existe ? 'Ouvrir' : 'Créer la liste'}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-on-surface-variant">
        Les ingrédients à racheter : ajoutez-les à la main, ou depuis le mode Pâtisser d’une fournée.
      </p>
    </div>
  );
}
