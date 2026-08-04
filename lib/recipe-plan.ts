// Plan matérialisé (planning + plan_steps/plan_substeps/plan_ingredients/
// plan_utensils) et exécution associée (executions + execution_*) — voir
// CLAUDE.md « Recettes planifiées » pour le pourquoi de ce modèle (copie
// indépendante de la recette, plus un diff sur des id fragiles).
//
// Fonctions pures uniquement : la matérialisation calcule le contenu à
// insérer, mais l'écriture réseau reste dans les composants clients
// (PlanWidget, PlanNoticeBanner) qui doivent enchaîner plusieurs requêtes
// pour obtenir les id générés (planning → plan_steps → plan_substeps /
// plan_ingredients → ...), une table dépendant de l'id de la précédente.
import type { Database } from '@/lib/database.types';
import type { RecipeFull, RecipeStepView, AllergenRef } from '@/lib/recipes';
import type { PlanningEntry } from '@/lib/profile';

const numify = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
const round2 = (n: number): number => +n.toFixed(2);
export const fmtNum = (n: number): string => String(round2(n)).replace('.', ',');

export function planFactor(plan: Pick<PlanningEntry, 'factor'> | null): number {
  return plan && plan.factor && plan.factor > 0 ? plan.factor : 1;
}

// Étape « Jour J − n » → date réelle (jour de dégustation − offset), en mode planifié.
export function planDayLabel(offset: number | null | undefined, plannedDate: string): string {
  const d = new Date(plannedDate + 'T00:00:00');
  d.setDate(d.getDate() - Math.max(0, offset || 0));
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}

// ── Lignes des tables plan_* / execution_* ────────────────────────────
// `already_done` est ajoutée par la migration « étape déjà faite » (cf.
// CLAUDE.md « Recettes planifiées »). Déclarée ici en attendant que
// `npm run gen:types` soit rejoué sur la base migrée — retirer cette
// intersection à ce moment-là, `lib/database.types.ts` étant la source de
// vérité (jamais éditée à la main).
// `base_day_offset` et `user_note` viennent de la migration « ajustements du
// plan » : le jour d'origine de l'étape (pour distinguer une étape déplacée et
// pouvoir la rétablir, même rôle que `plan_ingredients.base_quantity`) et la
// note personnelle de l'utilisateur — distincte de `description`/`tips`, qui
// sont la copie du texte de la recette et ne doivent jamais être écrasées.
// `note_position` vient de la migration « note déplaçable » : la note
// personnelle de l'étape n'a pas une place unique dans le déroulé (matériel à
// sortir en avance ? repère en cours de préparation ?) — la poignée de
// PlanStepDonePanel la fait glisser entre Ingrédients et Sous-étapes plutôt
// que d'imposer une position fixe.
export type NotePosition = 'before_ingredients' | 'between' | 'after_substeps';
type PlanStepPending = { already_done: boolean; base_day_offset: number | null; user_note: string | null; note_position: NotePosition };
export type PlanStepRow = Database['public']['Tables']['plan_steps']['Row'] & PlanStepPending;
// `excluded_when_done` fait partie de la même migration en attente (cf.
// PlanStepPending ci-dessus) : mêmes semantique et défaut que sur
// plan_ingredients, appliqués aux sous-étapes. `added` reprend le marqueur de
// `plan_ingredients.added` : une sous-étape ajoutée par l'utilisateur, absente
// de la recette d'origine.
type PlanSubstepPending = { excluded_when_done: boolean; added: boolean };
export type PlanSubstepRow = Database['public']['Tables']['plan_substeps']['Row'] & PlanSubstepPending;
type PlanIngredientPending = { excluded_when_done: boolean };
export type PlanIngredientRow = Database['public']['Tables']['plan_ingredients']['Row'] &
  PlanIngredientPending & {
    ingredient_refs?: { url: string | null; allergens: AllergenRef | null } | null;
  };
export type PlanUtensilRow = Database['public']['Tables']['plan_utensils']['Row'];
// `user_note` vient de la migration « note déplaçable » : distincte de
// `notes` (le commentaire saisi dans le dialogue de planification, affiché
// dans le bandeau de la fiche, l'écran d'exécution et Profil → Planning) —
// deux notes personnelles bien séparées plutôt qu'un même champ édité depuis
// deux endroits différents. Modifiable uniquement via PlanNotes, sur la
// fiche de la recette planifiée.
type PlanPending = { user_note: string | null };
export type PlanFull = Database['public']['Tables']['planning']['Row'] &
  PlanPending & {
    plan_steps: (PlanStepRow & { plan_substeps: PlanSubstepRow[] })[];
    plan_ingredients: PlanIngredientRow[];
    plan_utensils: PlanUtensilRow[];
  };

// ── Étape « déjà faite » ───────────────────────────────────────────────
// L'utilisateur signale qu'il a réalisé une étape en amont (« la pâte sucrée
// est déjà au congélateur »). C'est une intention, donc porté par le plan et
// non par l'exécution : la liste de courses est générée depuis le plan, bien
// avant qu'une session existe.
//
// Distinct de `plan_ingredients.removed` : le « déjà fait » ne doit pas
// écraser les suppressions faites à la main ligne par ligne, sinon décocher
// l'étape les rétablirait silencieusement. `already_done` sort les
// ingrédients de l'étape des courses, de la mise en place et de l'exécution,
// sauf ceux explicitement conservés (ex. l'œuf de dorure d'une pâte déjà
// façonnée mais pas encore badigeonnée/cuite) — `excluded_when_done` à
// `false` sur ces lignes-là.
//
// `plan_substeps.excluded_when_done` reprend la même exception ligne par
// ligne pour les sous-étapes (texte libre découpé en puces) : par défaut
// toutes sortent du déroulé avec l'étape, mais l'une d'elles peut rester
// utile (ex. « Porter à ébullition » gardée alors que le mélange initial est
// déjà fait).
type StepDoneFlags = Pick<PlanStepRow, 'already_done'>;
type IngredientDoneFlags = Pick<PlanIngredientRow, 'removed' | 'excluded_when_done'>;
type SubstepDoneFlags = Pick<PlanSubstepRow, 'excluded_when_done'>;

// Un ingrédient sort du parcours (courses, mise en place, exécution) s'il a
// été retiré à la main, ou si son étape est déjà faite et qu'il n'a pas été
// explicitement conservé.
export function planIngredientExcluded(step: StepDoneFlags, ing: IngredientDoneFlags): boolean {
  if (ing.removed) return true;
  return step.already_done && ing.excluded_when_done;
}

// Même règle pour une sous-étape, sans notion de suppression manuelle
// (`plan_substeps` n'a pas de colonne `removed`).
export function planSubstepExcluded(step: StepDoneFlags, sub: SubstepDoneFlags): boolean {
  return step.already_done && sub.excluded_when_done;
}

const NO_STEP: StepDoneFlags = { already_done: false };

// Prédicat lié à un plan donné : une ligne d'ingrédient ne porte que son
// `step_id`, jamais son étape entière — utilisé par mergePlanIngredients et
// materializeExecution, qui parcourent `plan_ingredients` à plat.
function excludedInPlan(plan: PlanFull): (it: PlanIngredientRow) => boolean {
  const stepById = new Map(plan.plan_steps.map((s) => [s.id, s]));
  return (it) => planIngredientExcluded(it.step_id != null ? (stepById.get(it.step_id) ?? NO_STEP) : NO_STEP, it);
}

// L'étape ne disparaît jamais du déroulé — une étape entièrement traitée y
// reste visible, barrée, plutôt que de s'effacer (on doit pouvoir constater sa
// progression, et revenir sur une case cochée par erreur). Ce prédicat sert
// uniquement à décider ce rendu barré : déjà faite, et sans aucun ingrédient
// ni sous-étape gardés — s'il en reste un (l'œuf de dorure), l'étape s'affiche
// normalement pour lui.
export function stepFullyDone(step: StepDoneFlags, ingredientsOfStep: IngredientDoneFlags[], substepsOfStep: SubstepDoneFlags[]): boolean {
  if (!step.already_done) return false;
  return ingredientsOfStep.every((it) => planIngredientExcluded(step, it)) && substepsOfStep.every((su) => planSubstepExcluded(step, su));
}

// Temps restant d'une étape : une étape entièrement traitée n'a plus rien à
// annoncer (ni préparation, ni attente, ni cuisson). Sans ça, le temps affiché
// contredirait ce qu'il reste réellement à faire.
export function remainingStepTimes(s: StepDoneFlags & Pick<PlanStepRow, 'prep_time' | 'wait_time' | 'cook_time'>): {
  prep_time: number | null;
  wait_time: number | null;
  cook_time: number | null;
} {
  if (!s.already_done) return { prep_time: s.prep_time, wait_time: s.wait_time, cook_time: s.cook_time };
  return { prep_time: null, wait_time: null, cook_time: null };
}

// ── Étape déplacée ─────────────────────────────────────────────────────
// Le plan porte le jour choisi (`day_offset`) et le jour d'origine de la
// recette (`base_day_offset`, figé à la matérialisation) : afficher les deux
// est ce qui permet de distinguer la recette initiale de l'ajustement, comme
// « Quantité d'origine » le fait pour les ingrédients. `base_day_offset` nul
// (plan matérialisé avant la migration) vaut « jamais déplacée ».
export function stepDayMoved(s: Pick<PlanStepRow, 'day_offset' | 'base_day_offset'>): boolean {
  return s.base_day_offset != null && s.base_day_offset !== s.day_offset;
}

// Sélection complète d'un plan, à utiliser par lib/profile.ts (getPlan).
export const PLAN_FULL_SELECT = `
  *,
  plan_steps(*, plan_substeps(*)),
  plan_ingredients(*, ingredient_refs(url, allergens(id, name, picto, tooltip))),
  plan_utensils(*)
`;

export type ExecutionRow = Database['public']['Tables']['executions']['Row'];
// Le déroulé (description, astuces, vidéo, temps, température) n'est pas
// dupliqué sur execution_steps — seuls le titre et l'état d'exécution le
// sont (cf. CLAUDE.md). Il est donc relu en direct sur le plan via la FK
// `plan_step_id` : sans conséquence tant que le plan n'a pas d'édition de
// ses étapes ; se dégrade proprement (absent) si l'étape a été retirée du
// plan depuis (FK à null).
// `user_note` rejoint les colonnes relues en direct (et non figées) : une note
// écrite la veille (« prévoir la plaque du bas ») doit apparaître pendant la
// cuisson, y compris dans une session déjà démarrée. Elle ne se confond pas
// avec `execution_steps.commentaire`, qui est le constat du jour J propre à
// une session — l'une est l'intention, l'autre la réalisation.
export type ExecutionStepRow = Database['public']['Tables']['execution_steps']['Row'] & {
  execution_substeps: Database['public']['Tables']['execution_substeps']['Row'][];
  plan_steps: Pick<PlanStepRow, 'description' | 'tips' | 'video_url' | 'prep_time' | 'cook_time' | 'wait_time' | 'cook_temp' | 'already_done' | 'user_note'> | null;
};
export type ExecutionIngredientRow = Database['public']['Tables']['execution_ingredients']['Row'] & {
  // Rapprochement conversions d'ingrédients : execution_ingredients n'a pas
  // sa propre colonne ref_id (ligne figée au démarrage, cf. CLAUDE.md), donc
  // relu en direct sur le plan via `plan_ingredient_id` (ON DELETE SET NULL —
  // absent si la ligne du plan a été supprimée depuis).
  plan_ingredients: { ref_id: number | null } | null;
};
export type ExecutionUtensilRow = Database['public']['Tables']['execution_utensils']['Row'];
export type ExecutionFull = ExecutionRow & {
  execution_steps: ExecutionStepRow[];
  execution_ingredients: ExecutionIngredientRow[];
  execution_utensils: ExecutionUtensilRow[];
  // Titre de la recette planifiée — pas de colonne dédiée sur `executions`,
  // relu via la FK planning_id (recipe_title y est déjà dénormalisé). `notes`
  // (note globale du plan) suit le même chemin, et pour la même raison que
  // `user_note` sur les étapes : relue en direct plutôt que figée.
  planning: { recipe_title: string | null; notes: string | null } | null;
};

export const EXECUTION_FULL_SELECT = `
  *,
  execution_steps(*, execution_substeps(*), plan_steps(description, tips, video_url, prep_time, cook_time, wait_time, cook_temp, already_done, user_note)),
  execution_ingredients(*, plan_ingredients(ref_id)),
  execution_utensils(*),
  planning(recipe_title, notes)
`;

// ── Vues de compatibilité recette ──────────────────────────────────────
// Le plan matérialisé prend la forme d'une recette (RecipeFull) pour
// réutiliser tel quel le rendu de la fiche (planningDays, effectiveTimes,
// listes d'ingrédients/étapes). Seul l'éditeur d'ingrédients
// (PlanIngredientsEditor) lit les tables plan_* brutes, pour écrire
// directement dessus.
function qtyDisplay(it: Pick<PlanIngredientRow, 'quantity' | 'quantity_text'>): string | null {
  if (it.quantity != null) return fmtNum(it.quantity);
  return it.quantity_text;
}

export function planStepsAsRecipeSteps(plan: PlanFull): RecipeStepView[] {
  return [...plan.plan_steps]
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => {
      const ingredientsOfStep = plan.plan_ingredients.filter((it) => it.step_id === s.id);
      // Sous-étapes exclues (« déjà fait ») retirées de cette vue non
      // interactive (impression, sommaire…) ; l'exception ligne par ligne se
      // règle via PlanStepDonePanel, qui lit les lignes brutes de son côté.
      const visibleSubsteps = [...s.plan_substeps].sort((a, b) => a.order_index - b.order_index).filter((su) => !planSubstepExcluded(s, su));
      return {
        id: s.id,
        title: s.title,
        description: s.description,
        day_offset: s.day_offset,
        ...remainingStepTimes(s),
        cook_temp: s.cook_temp,
        tips: s.tips,
        video_url: s.video_url,
        already_done: s.already_done,
        fully_done: stepFullyDone(s, ingredientsOfStep, s.plan_substeps),
        sous_etapes: visibleSubsteps.length ? visibleSubsteps.map((su) => su.texte) : null,
        order_index: s.order_index,
        step_photos: [], // non dupliquées dans le plan : restent liées à la recette d'origine
      };
    });
}

export function planGroupsAsIngredientGroups(plan: PlanFull): RecipeFull['ingredient_groups'] {
  // Chaque étape garde son groupe, même entièrement traité (l'éditeur du plan
  // l'affiche barré plutôt que de le faire disparaître) ; seuls les
  // ingrédients exclus (retirés à la main, ou déjà faits et non conservés)
  // sortent de la liste de ce groupe.
  return [...plan.plan_steps]
    .sort((a, b) => a.order_index - b.order_index)
    .map((step) => ({
      id: step.id,
      name: step.title,
      order_index: step.order_index,
      scaling_mode: step.scaling_mode,
      ingredients: plan.plan_ingredients
        .filter((it) => it.step_id === step.id && !planIngredientExcluded(step, it))
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

export function planUtensilsAsRecipeUtensils(utensils: PlanUtensilRow[]): RecipeFull['recipe_utensils'] {
  return [...utensils]
    .sort((a, b) => a.order_index - b.order_index)
    .map((u) => ({ id: u.id, name: u.name, comment: u.comment, url: u.url, order_index: u.order_index, utensils: null }));
}

// ── Liste fusionnée (courses, détail imprimable) : ingrédients identiques
// (nom + unité) additionnés, lignes supprimées exclues. Remplace l'ancien
// effectiveMergedRows — plus de « groupes déjà en ma possession » : le plan
// ne suit plus les étapes réalisées (déplacé côté exécution, cf. CLAUDE.md).
export type MergedPlanRow = { name: string; unit: string; adj: number | null; orig: number | null; origTxt: string[]; added: boolean; comment: string | null; ref_id: number | null };

export function mergePlanIngredients(plan: PlanFull): MergedPlanRow[] {
  const rows: (MergedPlanRow & { key: string })[] = [];
  const excluded = excludedInPlan(plan);
  plan.plan_ingredients
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

export function mergedRowQtyText(r: MergedPlanRow): string {
  return r.adj != null ? fmtNum(r.adj) : r.origTxt.join(' + ') || '';
}

// ── Coefficient d'échelle par étape ────────────────────────────────────
// Identique à l'ancien baseScalingCoef : « aucun » fige la quantité (×1) ;
// pour une recette moule, « fonçage » suit la surface, sinon le volume ;
// sinon le facteur global du plan. Utilisé à la fois à la matérialisation
// et lors d'un changement d'échelle globale sur un plan déjà créé.
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

// Rescale une ligne déjà matérialisée (édition du facteur d'un plan
// existant, cf. PlanWidget). N'a de sens que pour une ligne issue de la
// recette (`base_quantity` connu) : les lignes ajoutées à la main dans
// l'éditeur d'ingrédients ne sont jamais touchées par ce recalcul.
export function scaleFromBase(baseQuantity: number | null, quantityText: string | null, coef: number): { quantity: number | null; quantity_text: string | null } {
  if (baseQuantity == null) return { quantity: null, quantity_text: quantityText };
  return { quantity: round2(baseQuantity * coef), quantity_text: null };
}

// ── Matérialisation : contenu de la recette (vivante), scalé par le
// facteur / les coefficients moule choisis en planifiant. Pure : ne fait
// aucun accès réseau — PlanWidget enchaîne les insertions à partir de
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
  // Jour de la recette d'origine, figé ici une fois pour toutes : c'est lui
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
export type MaterializedPlan = { steps: MatStep[]; utensils: MatUtensil[] };

export function materializePlan(recipe: RecipeFull, opts: { factor: number; moldCoefs?: { surface: number; volume: number } | null }): MaterializedPlan {
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

// ── Matérialisation d'une exécution à partir du plan ───────────────────
// Chaque ligne fige nom/unité/quantité prévue au démarrage (cf. CLAUDE.md :
// ne jamais resynchroniser ces colonnes depuis le plan par la suite).
export type MatExecSubstep = { plan_substep_id: number; texte: string | null; order_index: number | null };
export type MatExecIngredient = { plan_ingredient_id: number; name: string; unit: string | null; planned_quantity: number | null; planned_text: string | null };
export type MatExecStep = {
  plan_step_id: number;
  titre: string | null;
  order_index: number | null;
  day_offset: number | null;
  substeps: MatExecSubstep[];
  ingredients: MatExecIngredient[];
};
export type MatExecUtensil = { plan_utensil_id: number; name: string };
export type MaterializedExecution = { steps: MatExecStep[]; utensils: MatExecUtensil[] };

export function materializeExecution(plan: PlanFull): MaterializedExecution {
  // Une étape déjà faite entre quand même dans la session (elle s'y affiche
  // barrée, cf. stepFullyDone côté lecture) : seuls ses ingrédients et
  // sous-étapes exclus (non conservés) n'ont pas de mise en place à leur
  // sujet. Le figeage joue ensuite normalement — une session démarrée n'est
  // jamais resynchronisée si le plan change après coup (cf. CLAUDE.md).
  const excluded = excludedInPlan(plan);
  const ingByStep = new Map<number, PlanIngredientRow[]>();
  plan.plan_ingredients
    .filter((it) => it.step_id != null && !excluded(it))
    .forEach((it) => {
      const k = it.step_id as number;
      const arr = ingByStep.get(k);
      if (arr) arr.push(it);
      else ingByStep.set(k, [it]);
    });

  const steps: MatExecStep[] = [...plan.plan_steps]
    .sort((a, b) => a.order_index - b.order_index)
    .map((s) => ({
      plan_step_id: s.id,
      titre: s.title,
      order_index: s.order_index,
      day_offset: s.day_offset,
      substeps: [...s.plan_substeps]
        .filter((su) => !planSubstepExcluded(s, su))
        .sort((a, b) => a.order_index - b.order_index)
        .map((su) => ({ plan_substep_id: su.id, texte: su.texte, order_index: su.order_index })),
      ingredients: (ingByStep.get(s.id) || [])
        .sort((a, b) => a.order_index - b.order_index)
        .map((it) => ({ plan_ingredient_id: it.id, name: it.name, unit: it.unit, planned_quantity: it.quantity, planned_text: it.quantity_text })),
    }));

  const utensils: MatExecUtensil[] = [...plan.plan_utensils].sort((a, b) => a.order_index - b.order_index).map((u) => ({ plan_utensil_id: u.id, name: u.name }));

  return { steps, utensils };
}

// Regroupe les étapes d'une exécution par jour, du plus lointain au jour J
// (même logique que l'ancien buildExecutionSnapshot côté jalons).
export type ExecJalon = { offset: number; steps: ExecutionStepRow[] };
export function groupExecutionSteps(steps: ExecutionStepRow[]): ExecJalon[] {
  const map = new Map<number, ExecutionStepRow[]>();
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

// ── Mise en place (écran de démarrage d'une exécution) ─────────────────
// Les lignes execution_ingredients sont par étape (une occurrence par
// plan_ingredient) : la mise en place fusionne les occurrences identiques
// (nom + unité) en une ligne à cocher — `ids` porte toutes les lignes
// sous-jacentes pour que cocher la ligne fusionnée coche chaque occurrence.
export type MepIngredientRow = { key: string; ids: number[]; name: string; unit: string | null; quantity: number | null; quantityText: string | null; done: boolean; ref_id: number | null };

export function mergeExecutionIngredientsForMep(ingredients: ExecutionIngredientRow[]): MepIngredientRow[] {
  const rows: MepIngredientRow[] = [];
  ingredients.forEach((it) => {
    const unit = it.unit || '';
    const key = it.name.toLowerCase() + '|' + unit.toLowerCase();
    let r = rows.find((x) => x.key === key);
    if (!r) {
      r = { key, ids: [], name: it.name, unit: it.unit, quantity: null, quantityText: null, done: true, ref_id: it.plan_ingredients?.ref_id ?? null };
      rows.push(r);
    }
    r.ids.push(it.id);
    if (it.planned_quantity != null) r.quantity = round2((r.quantity || 0) + it.planned_quantity);
    else if (it.planned_text) r.quantityText = r.quantityText ? r.quantityText + ' + ' + it.planned_text : it.planned_text;
    if (!it.mep_done) r.done = false;
  });
  rows.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  return rows;
}
