// Fournée matérialisée (batches + batch_steps/batch_substeps/batch_ingredients/
// batch_utensils) — voir CLAUDE.md « Fournées » pour le pourquoi de ce modèle
// (copie indépendante de la recette, plus un diff sur des id fragiles).
//
// Une fournée porte à la fois l'intention (ce qui est prévu) et la
// réalisation (ce qui a été fait) : il n'existe plus d'objet « session »
// séparé. `done` est la seule case à cocher d'une étape, que ce soit avant le
// jour J (« déjà fait en amont ») ou pendant (mode Cuisiner) — les deux cases
// distinctes de l'ancien modèle (`already_done` du plan, `done` de la
// session) sont fusionnées.
//
// Fonctions pures uniquement : la matérialisation calcule le contenu à
// insérer, mais l'écriture réseau reste dans les composants clients
// (BatchWidget, BatchNoticeBanner) qui doivent enchaîner plusieurs requêtes
// pour obtenir les id générés (batch → batch_steps → batch_substeps /
// batch_ingredients → ...), une table dépendant de l'id de la précédente.
import type { Database } from '@/lib/database.types';
import type { RecipeFull, RecipeStepView, AllergenRef } from '@/lib/recipes';
import type { BatchEntry, BatchListRow } from '@/lib/profile';

const numify = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const round2 = (n: number): number => +n.toFixed(2);
export const fmtNum = (n: number): string => String(round2(n)).replace('.', ',');

// Libellé + couleur du statut d'une fournée, partagés entre l'écran
// /fournee/[id] (badge d'en-tête) et « Mes fournées » (liste des terminées) —
// une seule source pour ne pas laisser dériver le vocabulaire entre les deux.
export const BATCH_STATUS_LBL: Record<string, { label: string; cls: string }> = {
  planifiee: { label: 'En cours', cls: 'bg-secondary' },
  terminee: { label: 'Terminée', cls: 'bg-green-700' },
  abandonnee: { label: 'Abandonnée', cls: 'bg-error' },
};

export function batchFactor(batch: Pick<BatchEntry, 'factor'> | null): number {
  return batch && batch.factor && batch.factor > 0 ? batch.factor : 1;
}

// Sérialise une date en `YYYY-MM-DD` d'après ses champs locaux (jamais via
// `toISOString()`, qui repasse en UTC et décale d'un jour tout fuseau à
// l'est de Greenwich — la France y compris).
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Étape « Jour J − n » → date réelle (jour de dégustation − offset), en mode fournée.
export function batchDayLabel(offset: number | null | undefined, plannedDate: string): string {
  const d = new Date(plannedDate + 'T00:00:00');
  d.setDate(d.getDate() - Math.max(0, offset || 0));
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}

export type PlanningDayItem = {
  stepId: number;
  planId: number;
  recipeTitle: string;
  recipeId: string | null;
  // Numéro d'étape au sein de sa propre recette (pas un numéro transverse au
  // jour) : c'est le même numéro que sur la fiche fournée.
  number: number;
  title: string | null;
  order_index: number;
  day_order_index: number | null;
  prep_time: number | null;
  wait_time: number | null;
  cook_time: number | null;
  cook_temp: number | null;
  // Case unique de l'étape (cf. en-tête du fichier) : cochée avant ou pendant
  // le jour J, une seule et même colonne.
  done: boolean;
};
export type PlanningDayGroup = { date: string; items: PlanningDayItem[] };

// Regroupe les étapes de TOUTES les fournées de l'utilisateur par date
// réelle — vue par jour transverse de l'onglet « Mes fournées »
// (PlanningDayView). `day_offset` n'est relatif qu'à la date de dégustation
// de sa propre recette : deux fournées le même jour calendaire doivent
// d'abord être ramenées à cette date commune avant de pouvoir regrouper leurs
// étapes ensemble (cf. `batchDayLabel`, même calcul).
//
// Tri par défaut tant qu'aucune étape du jour n'a été réordonnée
// manuellement (`day_order_index` toutes nulles) : `plans` doit déjà être
// trié par `planned_date` (comme le renvoie `getPlanning`) — combiné à
// `order_index` au sein de chaque fournée, cet ordre d'insertion sert de tri
// stable par défaut.
//
// Case cochable directement depuis cette vue (décision « vue par jour
// actionnable ») : `done` vient tel quel de `batch_steps`, plus besoin de
// croiser une session active — il n'y en a plus.
export function groupPlanningStepsByDate(plans: BatchListRow[]): PlanningDayGroup[] {
  const withDate: (PlanningDayItem & { date: string })[] = [];
  plans.forEach((p) => {
    if (!p.planned_date) return;
    const recipeTitle = p.recipe_title || p.recipes?.title || '';
    [...p.batch_steps]
      .sort((a, b) => a.order_index - b.order_index)
      .forEach((s, i) => {
        const d = new Date(p.planned_date + 'T00:00:00');
        d.setDate(d.getDate() - Math.max(0, s.day_offset || 0));
        withDate.push({
          stepId: s.id,
          planId: p.id,
          recipeTitle,
          recipeId: p.recipes?.id ?? p.recipe_id,
          number: i + 1,
          title: s.title,
          order_index: s.order_index,
          day_order_index: s.day_order_index,
          done: s.done,
          prep_time: s.prep_time,
          wait_time: s.wait_time,
          cook_time: s.cook_time,
          cook_temp: s.cook_temp,
          date: isoLocal(d),
        });
      });
  });
  const map = new Map<string, PlanningDayItem[]>();
  withDate.forEach(({ date, ...item }) => {
    const arr = map.get(date);
    if (arr) arr.push(item);
    else map.set(date, [item]);
  });
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, items]) => ({
      date,
      items: [...items].sort((a, b) => (a.day_order_index ?? Infinity) - (b.day_order_index ?? Infinity)),
    }));
}

// ── Lignes des tables batch_* ───────────────────────────────────────────
export type BatchStepRow = Database['public']['Tables']['batch_steps']['Row'];
export type BatchSubstepRow = Database['public']['Tables']['batch_substeps']['Row'];
export type BatchIngredientRow = Database['public']['Tables']['batch_ingredients']['Row'] & {
  ingredient_refs?: { url: string | null; allergens: AllergenRef | null } | null;
  // Sous-recette qui remplace cet ingrédient (« je fais moi-même mon
  // praliné ») — cf. « Ingrédient remplacé par une sous-recette » plus bas.
  // Renseignée après coup par `getPlan` (et non par une jointure imbriquée,
  // cf. BATCH_FULL_SELECT). `null` si la ligne n'est pas remplacée, ou si la
  // recette n'est plus lisible (dépubliée, supprimée) : la fournée reste
  // autonome, seul le lien vers la fiche se dégrade.
  expanded_recipe?: { id: string; title: string } | null;
};
export type BatchUtensilRow = Database['public']['Tables']['batch_utensils']['Row'];
export type BatchFull = Database['public']['Tables']['batches']['Row'] & {
  batch_steps: (BatchStepRow & { batch_substeps: BatchSubstepRow[] })[];
  batch_ingredients: BatchIngredientRow[];
  batch_utensils: BatchUtensilRow[];
  // État de l'avis (note + commentaire) laissé sur la recette d'origine
  // depuis CETTE fournée, synchronisé par le trigger SQL
  // `comments_sync_batch_review` — cf. CLAUDE.md « Avis sur une recette ».
  // Absentes de lib/database.types.ts tant que la migration n'a pas été
  // régénérée (npm run gen:types) ; `BATCH_FULL_SELECT` (`*`) les renvoie
  // déjà, seul le typage est en retard.
  review_status: 'none' | 'pending' | 'approved' | 'rejected';
  review_rejection_reason: string | null;
  // Carte d'avis masquée sur CETTE fournée (« ne plus afficher »), à la main
  // du propriétaire. Portée volontairement par la fournée et non par la
  // recette : une autre fournée terminée de la même recette continue de
  // proposer l'avis. Absente de lib/database.types.ts tant que la migration
  // n'a pas été régénérée (npm run gen:types).
  review_dismissed: boolean;
};

// ── Étape « déjà faite » ───────────────────────────────────────────────
// L'utilisateur signale qu'il a réalisé une étape en amont (« la pâte sucrée
// est déjà au congélateur »), ou la coche pendant qu'il cuisine (mode
// Cuisiner) — c'est la même case, `batch_steps.done`, qu'elle soit cochée
// avant ou pendant le jour J.
//
// Distinct de `batch_ingredients.removed` : la case de l'étape ne doit pas
// écraser les suppressions faites à la main ligne par ligne, sinon la
// décocher les rétablirait silencieusement. `done` sort les ingrédients de
// l'étape des courses et de la mise en place, sauf ceux explicitement
// conservés (ex. l'œuf de dorure d'une pâte déjà façonnée mais pas encore
// badigeonnée ni cuite) — `excluded_when_done` à `false` sur ces lignes-là.
//
// `batch_substeps.excluded_when_done` reprend la même exception ligne par
// ligne pour les sous-étapes (texte libre découpé en puces) : par défaut
// toutes sortent du déroulé avec l'étape, mais l'une d'elles peut rester
// utile (ex. « Porter à ébullition » gardée alors que le mélange initial est
// déjà fait).
type StepDoneFlags = Pick<BatchStepRow, 'done'>;
type IngredientDoneFlags = Pick<BatchIngredientRow, 'removed' | 'excluded_when_done' | 'expanded_into_recipe_id'>;
type SubstepDoneFlags = Pick<BatchSubstepRow, 'excluded_when_done'>;

// Un ingrédient sort du parcours (courses, mise en place) s'il a été retiré à
// la main, s'il a été remplacé par une sous-recette (on ne l'achète plus : on
// le fabrique, cf. plus bas), ou si son étape est faite et qu'il n'a pas été
// explicitement conservé.
export function batchIngredientExcluded(step: StepDoneFlags, ing: IngredientDoneFlags): boolean {
  if (ing.removed) return true;
  if (ing.expanded_into_recipe_id != null) return true;
  return step.done && ing.excluded_when_done;
}

// Même règle pour une sous-étape, sans notion de suppression manuelle
// (`batch_substeps` n'a pas de colonne `removed`).
export function batchSubstepExcluded(step: StepDoneFlags, sub: SubstepDoneFlags): boolean {
  return step.done && sub.excluded_when_done;
}

const NO_STEP: StepDoneFlags = { done: false };

// Prédicat lié à une fournée donnée : une ligne d'ingrédient ne porte que son
// `batch_step_id`, jamais son étape entière — utilisé par mergeBatchIngredients,
// qui parcourt `batch_ingredients` à plat.
function excludedInBatch(batch: BatchFull): (it: BatchIngredientRow) => boolean {
  const stepById = new Map(batch.batch_steps.map((s) => [s.id, s]));
  return (it) => batchIngredientExcluded(it.batch_step_id != null ? (stepById.get(it.batch_step_id) ?? NO_STEP) : NO_STEP, it);
}

// L'étape ne disparaît jamais du déroulé — une étape entièrement traitée y
// reste visible, barrée, plutôt que de s'effacer (on doit pouvoir constater sa
// progression, et revenir sur une case cochée par erreur). Ce prédicat sert
// uniquement à décider ce rendu barré : faite, et sans aucun ingrédient ni
// sous-étape gardés — s'il en reste un (l'œuf de dorure), l'étape s'affiche
// normalement pour lui.
export function stepFullyDone(step: StepDoneFlags, ingredientsOfStep: IngredientDoneFlags[], substepsOfStep: SubstepDoneFlags[]): boolean {
  if (!step.done) return false;
  return ingredientsOfStep.every((it) => batchIngredientExcluded(step, it)) && substepsOfStep.every((su) => batchSubstepExcluded(step, su));
}

// Temps restant d'une étape : une étape entièrement traitée n'a plus rien à
// annoncer (ni préparation, ni attente, ni cuisson). Sans ça, le temps affiché
// contredirait ce qu'il reste réellement à faire.
export function remainingStepTimes(s: StepDoneFlags & Pick<BatchStepRow, 'prep_time' | 'wait_time' | 'cook_time'>): {
  prep_time: number | null;
  wait_time: number | null;
  cook_time: number | null;
} {
  if (!s.done) return { prep_time: s.prep_time, wait_time: s.wait_time, cook_time: s.cook_time };
  return { prep_time: null, wait_time: null, cook_time: null };
}

// ── Étape déplacée ─────────────────────────────────────────────────────
// La fournée porte le jour choisi (`day_offset`) et le jour d'origine de la
// recette (`base_day_offset`, figé à la matérialisation) : afficher les deux
// est ce qui permet de distinguer la recette initiale de l'ajustement, comme
// « Quantité d'origine » le fait pour les ingrédients. `base_day_offset` nul
// (fournée matérialisée avant la migration) vaut « jamais déplacée ».
export function stepDayMoved(s: Pick<BatchStepRow, 'day_offset' | 'base_day_offset'>): boolean {
  return s.base_day_offset != null && s.base_day_offset !== s.day_offset;
}

// ── Ingrédient remplacé par une sous-recette ───────────────────────────
// « J'ai du praliné dans ma recette, mais je veux le faire moi-même » :
// l'ingrédient est remplacé par les étapes d'une autre recette de
// l'application, insérées dans le déroulé de la fournée.
//
// Trois colonnes, prévues dès la création des tables `batch_*`, portent le
// lien — aucune n'est un diff sur la recette vivante, la fournée reste la
// copie autonome décrite dans CLAUDE.md :
//   • `batch_ingredients.expanded_into_recipe_id` : la ligne remplacée pointe
//     la sous-recette. Elle reste affichée (barrée, avec le lien) mais sort
//     des courses et de la mise en place — cf. `batchIngredientExcluded` :
//     on ne l'achète plus, on la fabrique.
//   • `batch_steps.source_ingredient_id` : les étapes insérées pointent la
//     ligne remplacée. C'est ce lien qui permet de tout défaire d'un bloc,
//     et de reconnaître une étape ajoutée pour la teinter en vert.
//   • `source_recipe_id` (étapes, ingrédients, ustensiles) : la sous-recette
//     d'origine, déjà renseignée à la matérialisation pour la recette de
//     base de la fournée.
//
// Les ingrédients insérés portent `added = true`, comme un ingrédient ajouté
// à la main dans l'éditeur. Ce n'est pas un abus de marqueur mais la même
// signification (« absent de la recette d'origine »), et surtout la même
// conséquence attendue : `rescaleBatchIngredients` ne touche jamais une ligne
// `added`. Sans ça, un changement d'ajustement global de la fournée
// recalculerait `quantité = base × facteur de la fournée` sur des lignes dont
// la quantité vient du coefficient propre à la sous-recette — le coefficient
// serait écrasé silencieusement, exactement la corruption que la fournée
// matérialisée a corrigée en remplaçant `planning.overrides`.
export function batchIngredientExpanded(ing: Pick<BatchIngredientRow, 'expanded_into_recipe_id'>): boolean {
  return ing.expanded_into_recipe_id != null;
}

// Étape issue de l'éclatement d'un ingrédient (et non de la recette de base).
export function batchStepIsExpansion(s: Pick<BatchStepRow, 'source_ingredient_id'>): boolean {
  return s.source_ingredient_id != null;
}

// Sous-recette dont provient une étape insérée, retrouvée via la ligne
// d'ingrédient remplacée (`batch_steps.source_ingredient_id`). Le titre n'est
// pas dupliqué sur `batch_steps` : une seule jointure, sur `batch_ingredients`,
// suffit à nommer toutes les étapes d'un même éclatement.
export function expansionSource(batch: BatchFull, step: Pick<BatchStepRow, 'source_ingredient_id'>): { id: string; title: string } | null {
  if (step.source_ingredient_id == null) return null;
  const row = batch.batch_ingredients.find((it) => it.id === step.source_ingredient_id);
  return row?.expanded_recipe ?? null;
}

// Position d'insertion des étapes d'une sous-recette dans le déroulé de la
// fournée. `batch_steps.order_index` est `numeric` (et non `integer`)
// précisément pour permettre cette intercalation : on calcule des valeurs
// intermédiaires entre l'étape choisie comme point d'ancrage et la suivante,
// plutôt que de renuméroter toute la fournée — ce qui invaliderait les
// positions retenues par l'utilisateur sur les autres étapes.
//
// `anchors[i]` = `order_index` de l'étape de la fournée après laquelle
// insérer la i-ème sous-étape, ou `null` pour la placer en tête. Plusieurs
// sous-étapes partageant la même ancre gardent leur ordre d'arrivée.
export function computeInsertOrderIndexes(planOrders: number[], anchors: (number | null)[]): number[] {
  const sorted = [...planOrders].sort((a, b) => a - b);
  const first = sorted.length ? sorted[0] : 0;
  const byAnchor = new Map<number | null, number[]>();
  anchors.forEach((a, i) => {
    const arr = byAnchor.get(a);
    if (arr) arr.push(i);
    else byAnchor.set(a, [i]);
  });
  const out = new Array<number>(anchors.length).fill(0);
  byAnchor.forEach((idxs, anchor) => {
    const lower = anchor == null ? first - 1 : anchor;
    const next = sorted.find((o) => o > lower);
    // Aucune étape après l'ancre : on prolonge simplement la suite.
    const upper = next != null ? next : lower + 1;
    idxs.forEach((idx, k) => {
      out[idx] = +(lower + ((upper - lower) * (k + 1)) / (idxs.length + 1)).toFixed(6);
    });
  });
  return out;
}

// Jour proposé pour une étape de sous-recette. Le `day_offset` d'une recette
// compte à rebours depuis SA propre dégustation — ici, le moment où la
// préparation doit être prête, c'est-à-dire l'étape qui la consomme. Un
// praliné demandant une nuit de repos (J−1 dans sa recette) inséré avant une
// étape placée à J−2 se pose donc tout seul à J−3. Modifiable ensuite étape
// par étape.
export function suggestedExpansionDay(consumingDayOffset: number, subStepDayOffset: number): number {
  return Math.max(0, consumingDayOffset) + Math.max(0, subStepDayOffset);
}

// Sélection complète d'une fournée, à utiliser par lib/profile.ts (getPlan).
//
// `expanded_recipe` (titre de la sous-recette qui remplace un ingrédient)
// n'est volontairement PAS une jointure imbriquée ici : `batch_ingredients`
// ayant deux clés étrangères vers `recipes`, PostgREST exigerait de nommer la
// contrainte dans le select — une chaîne à tenir à jour à la main dont une
// erreur ferait échouer toute la requête, donc perdre la fournée en entier
// pour un simple libellé. `getPlan` complète ces titres après coup, et
// seulement si la fournée comporte au moins un remplacement.
export const BATCH_FULL_SELECT = `
  *,
  batch_steps(*, batch_substeps(*)),
  batch_ingredients(*, ingredient_refs(url, allergens(id, name, picto, tooltip))),
  batch_utensils(*)
`;

// Contenu d'une recette candidate à l'éclatement, lu depuis le navigateur
// (RLS via la session) : strictement ce dont `materializeBatch` a besoin,
// plus le rendement pour proposer un coefficient. Volontairement plus étroit
// que le `FULL_SELECT` de lib/recipes.ts — pas de photos d'étapes ni d'image
// d'en-tête, stockées en data-URL et sans usage ici.
export const RECIPE_SOURCE_SELECT = `
  id, title, measure_type, yield_qty, yield_unit, yield_desc, yield_notes,
  recipe_utensils(*, utensils(url)),
  ingredient_groups(*, ingredients(*)),
  recipe_steps(*)
`;

export type RecipeSource = MaterializableRecipe & {
  id: string;
  title: string;
  measure_type: string | null;
  yield_qty: string | null;
  yield_unit: string | null;
  yield_desc: string | null;
  yield_notes: string | null;
};

// ── Vues de compatibilité recette ──────────────────────────────────────
// La fournée matérialisée prend la forme d'une recette (RecipeFull) pour
// réutiliser tel quel le rendu de la fiche (planningDays, effectiveTimes,
// listes d'ingrédients/étapes). Seul l'éditeur d'ingrédients
// (BatchIngredientsEditor) lit les tables batch_* brutes, pour écrire
// directement dessus.
function qtyDisplay(it: Pick<BatchIngredientRow, 'quantity' | 'quantity_text'>): string | null {
  if (it.quantity != null) return fmtNum(it.quantity);
  return it.quantity_text;
}

export function batchStepsAsRecipeSteps(batch: BatchFull): RecipeStepView[] {
  return [...batch.batch_steps]
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => {
      const ingredientsOfStep = batch.batch_ingredients.filter((it) => it.batch_step_id === s.id);
      // Sous-étapes exclues (« déjà fait ») retirées de cette vue non
      // interactive (impression, sommaire…) ; l'exception ligne par ligne se
      // règle via BatchStepDonePanel, qui lit les lignes brutes de son côté.
      const visibleSubsteps = [...s.batch_substeps].sort((a, b) => a.order_index - b.order_index).filter((su) => !batchSubstepExcluded(s, su));
      return {
        id: s.id,
        title: s.title,
        description: s.description,
        day_offset: s.day_offset,
        ...remainingStepTimes(s),
        cook_temp: s.cook_temp,
        tips: s.tips,
        video_url: s.video_url,
        already_done: s.done,
        fully_done: stepFullyDone(s, ingredientsOfStep, s.batch_substeps),
        // Étape issue de l'éclatement d'un ingrédient en sous-recette : rendue
        // en vert, comme un ingrédient ajouté (une seule convention de couleur
        // pour toute la fiche fournée).
        added: batchStepIsExpansion(s),
        from_recipe: expansionSource(batch, s),
        sous_etapes: visibleSubsteps.length ? visibleSubsteps.map((su) => su.texte) : null,
        order_index: s.order_index,
        step_photos: [], // non dupliquées dans la fournée : restent liées à la recette de base
      };
    });
}

export function batchGroupsAsIngredientGroups(batch: BatchFull): RecipeFull['ingredient_groups'] {
  // Chaque étape garde son groupe, même entièrement traité (l'éditeur de la
  // fournée l'affiche barré plutôt que de le faire disparaître) ; seuls les
  // ingrédients exclus (retirés à la main, ou faits et non conservés)
  // sortent de la liste de ce groupe.
  return [...batch.batch_steps]
    .sort((a, b) => a.order_index - b.order_index)
    .map((step) => ({
      id: step.id,
      name: step.title,
      order_index: step.order_index,
      scaling_mode: step.scaling_mode,
      ingredients: batch.batch_ingredients
        .filter((it) => it.batch_step_id === step.id && !batchIngredientExcluded(step, it))
        .sort((a, b) => a.order_index - b.order_index)
        .map((it) => ({
          id: it.id,
          name: it.name,
          quantity: qtyDisplay(it),
          unit: it.unit,
          comment: it.comment,
          url: it.url,
          allergen: it.allergen,
          order_index: it.order_index,
          ref_id: it.ref_id,
          ingredient_refs: it.ingredient_refs ?? null,
        })),
    }));
}

export function batchUtensilsAsRecipeUtensils(utensils: BatchUtensilRow[]): RecipeFull['recipe_utensils'] {
  return [...utensils]
    .sort((a, b) => a.order_index - b.order_index)
    .map((u) => ({ id: u.id, name: u.name, comment: u.comment, url: u.url, order_index: u.order_index, utensils: null }));
}

// ── Liste fusionnée (courses, détail imprimable) : ingrédients identiques
// (nom + unité) additionnés, lignes supprimées exclues.
export type MergedBatchRow = { name: string; unit: string; adj: number | null; orig: number | null; origTxt: string[]; added: boolean; comment: string | null; ref_id: number | null };

export function mergeBatchIngredients(batch: BatchFull): MergedBatchRow[] {
  const rows: (MergedBatchRow & { key: string })[] = [];
  const excluded = excludedInBatch(batch);
  batch.batch_ingredients
    .filter((it) => it.name && !excluded(it))
    .forEach((it) => {
      const unit = it.unit || '';
      const key = it.name.toLowerCase() + '|' + unit.toLowerCase();
      let r = rows.find((x) => x.key === key);
      if (!r) {
        r = { key, name: it.name, unit, adj: null, orig: null, origTxt: [], added: false, comment: null, ref_id: it.ref_id ?? null };
        rows.push(r);
      }
      if (it.quantity != null) r.adj = round2((r.adj || 0) + it.quantity);
      if (it.base_quantity != null) r.orig = round2((r.orig || 0) + it.base_quantity);
      else if (it.quantity_text) r.origTxt.push(it.quantity_text);
      if (it.added) r.added = true;
      if (it.comment && it.comment !== r.comment) r.comment = r.comment ? r.comment + ' ; ' + it.comment : it.comment;
    });
  rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return rows.map(({ key: _key, ...r }) => r);
}

export function mergedRowQtyText(r: MergedBatchRow): string {
  return r.adj != null ? fmtNum(r.adj) : r.origTxt.join(' + ') || '';
}

// ── Coefficient d'échelle par étape ────────────────────────────────────
// « aucun » fige la quantité (×1) ; pour une recette moule, « fonçage » suit
// la surface, sinon le volume ; sinon le facteur global de la fournée.
// Utilisé à la fois à la matérialisation et lors d'un changement d'échelle
// globale sur une fournée déjà créée.
export function scalingCoef(mode: string | null | undefined, factor: number, moldCoefs?: { surface: number; volume: number } | null): number {
  if (mode === 'aucun') return 1;
  if (moldCoefs) return mode === 'foncage' ? (moldCoefs.surface ?? moldCoefs.volume) : (moldCoefs.volume ?? moldCoefs.surface);
  return factor;
}

function scaleQty(raw: string | null, coef: number): { quantity: number | null; quantity_text: string | null; base_quantity: number | null } {
  const base = numify(raw);
  if (base == null) return { quantity: null, quantity_text: raw && raw.trim() ? raw.trim() : null, base_quantity: null };
  return { quantity: round2(base * coef), quantity_text: null, base_quantity: base };
}

// Rescale une ligne déjà matérialisée (édition du facteur d'une fournée
// existante, cf. BatchWidget). N'a de sens que pour une ligne issue de la
// recette (`base_quantity` connu) : les lignes ajoutées à la main dans
// l'éditeur d'ingrédients ne sont jamais touchées par ce recalcul.
export function scaleFromBase(baseQuantity: number | null, quantityText: string | null, coef: number): { quantity: number | null; quantity_text: string | null } {
  if (baseQuantity == null) return { quantity: null, quantity_text: quantityText };
  return { quantity: round2(baseQuantity * coef), quantity_text: null };
}

// ── Matérialisation : contenu de la recette (vivante), scalé par le
// facteur / les coefficients moule choisis en créant la fournée. Pure : ne
// fait aucun accès réseau — BatchWidget enchaîne les insertions à partir de
// cette structure.
export type MatIngredient = {
  order_index: number;
  ref_id: number | null;
  name: string;
  base_quantity: number | null;
  quantity: number | null;
  quantity_text: string | null;
  unit: string | null;
  comment: string | null;
  url: string | null;
  allergen: string | null;
};
export type MatStep = {
  order_index: number;
  day_offset: number;
  // Jour de la recette de base, figé ici une fois pour toutes : c'est lui
  // qui restera affiché en regard du jour choisi si l'étape est déplacée.
  base_day_offset: number;
  title: string | null;
  description: string | null;
  tips: string | null;
  video_url: string | null;
  prep_time: number | null;
  cook_time: number | null;
  wait_time: number | null;
  cook_temp: number | null;
  scaling_mode: string | null;
  source_step_id: number;
  substeps: string[];
  ingredients: MatIngredient[];
};
export type MatUtensil = { order_index: number; name: string; comment: string | null; url: string | null };
export type MaterializedBatch = { steps: MatStep[]; utensils: MatUtensil[] };

// Seules ces trois collections sont matérialisées : la recette de base de la
// fournée comme une sous-recette éclatée passent par la même fonction, la
// seconde n'étant lue qu'avec `RECIPE_SOURCE_SELECT` (bien plus étroit qu'un
// `RecipeFull`).
export type MaterializableRecipe = Pick<RecipeFull, 'ingredient_groups' | 'recipe_steps' | 'recipe_utensils'>;

export function materializeBatch(recipe: MaterializableRecipe, opts: { factor: number; moldCoefs?: { surface: number; volume: number } | null }): MaterializedBatch {
  const groupsByOrder = new Map<number, RecipeFull['ingredient_groups'][number]>();
  (recipe.ingredient_groups || []).forEach((g) => groupsByOrder.set(g.order_index ?? 0, g));

  const steps: MatStep[] = [...(recipe.recipe_steps || [])]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((s, i) => {
      const order = s.order_index ?? i;
      const group = groupsByOrder.get(order);
      const coef = scalingCoef(group?.scaling_mode, opts.factor, opts.moldCoefs);
      const ingredients: MatIngredient[] = [...(group?.ingredients || [])]
        .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map((it, ii) => {
          const q = scaleQty(it.quantity, coef);
          return {
            order_index: it.order_index ?? ii,
            ref_id: it.ref_id ?? null,
            name: it.name,
            base_quantity: q.base_quantity,
            quantity: q.quantity,
            quantity_text: q.quantity_text,
            unit: it.unit,
            comment: it.comment,
            url: it.url,
            allergen: it.allergen,
          };
        });
      return {
        order_index: order,
        day_offset: s.day_offset || 0,
        base_day_offset: s.day_offset || 0,
        title: s.title,
        description: s.description,
        tips: s.tips,
        video_url: s.video_url,
        prep_time: s.prep_time,
        cook_time: s.cook_time,
        wait_time: s.wait_time,
        cook_temp: s.cook_temp,
        scaling_mode: group?.scaling_mode ?? null,
        source_step_id: s.id,
        substeps: Array.isArray(s.sous_etapes) ? s.sous_etapes : [],
        ingredients,
      };
    });

  const utensils: MatUtensil[] = [...(recipe.recipe_utensils || [])]
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((u) => ({ order_index: u.order_index ?? 0, name: u.name, comment: u.comment, url: u.utensils?.url || u.url }));

  return { steps, utensils };
}

// ── Jalons (mode Cuisiner, regroupement par jour) ──────────────────────
// Regroupe les étapes de la fournée par jour, du plus lointain au jour J.
// Opère directement sur `batch_steps` : il n'y a plus de matérialisation
// séparée d'une « exécution », cuisiner ne fait qu'afficher la fournée
// autrement.
export type BatchJalon = { offset: number; steps: (BatchStepRow & { batch_substeps: BatchSubstepRow[] })[] };
export function groupBatchStepsByDay(steps: (BatchStepRow & { batch_substeps: BatchSubstepRow[] })[]): BatchJalon[] {
  const map = new Map<number, (BatchStepRow & { batch_substeps: BatchSubstepRow[] })[]>();
  steps.forEach((s) => {
    const o = Math.max(0, s.day_offset || 0);
    const arr = map.get(o);
    if (arr) arr.push(s);
    else map.set(o, [s]);
  });
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([offset, jSteps]) => ({ offset, steps: [...jSteps].sort((a, b) => (a.order_index || 0) - (b.order_index || 0)) }));
}
