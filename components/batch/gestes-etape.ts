// Gestes de coche d'une étape en mode Pâtisser, partagés par le déroulé
// (`StepCookCard`, ordinateur) et la vue « une étape à la fois »
// (`PatisserFocus`, téléphone et tablette). Une seule écriture des règles :
// auto-coche de l'étape au dernier geste, réouverture d'une étape terminée en
// décochant l'une de ses lignes, verrouillage des lignes exclues.
import {
  batchIngredientExcluCuisine,
  batchSubstepExcluded,
  remainingStepTimes,
  substepIngredientsBySubstep,
  type BatchIngredientRow,
  type BatchStepRow,
  type BatchSubstepRow,
} from '@/lib/recipe-plan';
import { formatTime } from '@/lib/format';

export type GestesEtapeRappels = {
  onToggleStep: (id: number, checked: boolean, defiler?: boolean) => void;
  onToggleSub: (id: number, checked: boolean) => void;
  onToggleIng: (id: number, checked: boolean) => void;
};

export function gestesEtape(
  s: BatchStepRow & { batch_substeps: BatchSubstepRow[] },
  ingredients: BatchIngredientRow[],
  readOnly: boolean,
  { onToggleStep, onToggleSub, onToggleIng }: GestesEtapeRappels,
) {
  const times = remainingStepTimes(s);
  const badges = [
    s.done ? 'PRÉPARATION DÉJÀ RÉALISÉE' : '',
    times.prep_time ? `PRÉP ${formatTime(times.prep_time).toUpperCase()}` : '',
    times.wait_time ? `ATTENTE ${formatTime(times.wait_time).toUpperCase()}` : '',
    times.cook_time ? `CUISSON ${formatTime(times.cook_time).toUpperCase()}${s.cook_temp ? ' · ' + s.cook_temp + ' °C' : ''}` : s.cook_temp ? `CUISSON ${s.cook_temp} °C` : '',
  ].filter(Boolean);
  // Toutes les sous-étapes sont rendues, celles que « déjà réalisé » exclut
  // étant barrées plutôt qu'escamotées. Les listes `active*` — ce qui reste
  // réellement à faire — servent aux automatismes, jamais à l'affichage.
  const substeps = [...s.batch_substeps].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
  // Un ingrédient éclaté en sous-recette n'est PAS exclu ici : en exécution, il
  // reste à incorporer comme n'importe quel autre.
  const cookExcluded = (it: BatchIngredientRow) => batchIngredientExcluCuisine(s, it);
  const activeIngredients = ingredients.filter((it) => !cookExcluded(it));
  const activeSubsteps = substeps.filter((su) => !batchSubstepExcluded(s, su));
  // Barrée / atténuée seulement si plus rien n'y reste à faire.
  const entierementTraitee = s.done && activeIngredients.length === 0 && activeSubsteps.length === 0;
  // Case de l'étape : cochée seulement quand plus rien de gardé n'y reste à faire.
  const complete = s.done && activeIngredients.every((it) => it.done) && activeSubsteps.every((su) => su.done);
  // Ingrédients que le texte de chaque sous-étape semble nommer, chacun à sa
  // seule première sous-étape.
  const subIngredientsBySubstep = substepIngredientsBySubstep(substeps, ingredients);

  // Coche l'étape dès qu'on vient de cocher le dernier ingrédient ou la
  // dernière sous-étape restants — jamais en continu, et jamais l'inverse.
  function maybeAutoCheckStep(justDoneIngredientIds: Set<number>, justDoneSubstepIds: Set<number>) {
    if (readOnly || s.done) return;
    if (activeIngredients.length === 0 && activeSubsteps.length === 0) return;
    const allIngDone = activeIngredients.every((it) => it.done || justDoneIngredientIds.has(it.id));
    const allSubDone = activeSubsteps.every((su) => su.done || justDoneSubstepIds.has(su.id));
    if (allIngDone && allSubDone) onToggleStep(s.id, true, false);
  }

  // Étape cochée : ses lignes « sorties » par `done` restent décochables —
  // décocher l'une rouvre l'étape. Une ligne retirée à la main ou une étape
  // remplacée par une recette restent verrouillées.
  const rouvrable = s.done && s.replaced_by_recipe_id == null;
  // Les lignes d'une étape cochée d'un coup ne sont « cochées » que par
  // exclusion : on pose d'abord `done` sur les autres, pour que seule celle sur
  // laquelle on a cliqué se décoche.
  function rouvrirEtape(sousEtapeId?: number, ingredientId?: number) {
    if (!s.done) return;
    substeps.forEach((su) => {
      if (su.id !== sousEtapeId && !su.done && batchSubstepExcluded(s, su)) onToggleSub(su.id, true);
    });
    ingredients.forEach((it) => {
      if (it.id !== ingredientId && !it.done && !it.removed && cookExcluded(it)) onToggleIng(it.id, true);
    });
    onToggleStep(s.id, false, false);
  }

  /**
   * Case du titre. Une étape « déjà réalisée » qui garde une sous-étape ou un
   * ingrédient : cocher la case termine ce qui reste, sans toucher à `done`.
   * Rend vrai quand l'étape vient d'être terminée par ce geste.
   */
  function cocherEtape(checked: boolean, defiler = true): boolean {
    if (checked && s.done && !complete) {
      activeIngredients.filter((it) => !it.done).forEach((it) => onToggleIng(it.id, true));
      activeSubsteps.filter((su) => !su.done).forEach((su) => onToggleSub(su.id, true));
      return true;
    }
    onToggleStep(s.id, checked, defiler);
    return checked;
  }

  function ingredientVerrouille(ing: BatchIngredientRow): boolean {
    return readOnly || (cookExcluded(ing) && !(rouvrable && !ing.removed));
  }
  function cocherIngredient(ing: BatchIngredientRow, checked: boolean) {
    onToggleIng(ing.id, checked);
    if (checked) maybeAutoCheckStep(new Set([ing.id]), new Set());
    else rouvrirEtape(undefined, ing.id);
  }

  function sousEtapeVerrouillee(su: BatchSubstepRow): boolean {
    return readOnly || (batchSubstepExcluded(s, su) && !rouvrable);
  }
  // Cocher une sous-étape coche aussi les ingrédients qu'elle nomme.
  function cocherSousEtape(su: BatchSubstepRow, checked: boolean) {
    const subIngredients = subIngredientsBySubstep.get(su.id) || [];
    onToggleSub(su.id, checked);
    if (checked) {
      subIngredients.forEach((it) => onToggleIng(it.id, true));
      maybeAutoCheckStep(new Set(subIngredients.map((it) => it.id)), new Set([su.id]));
    } else {
      rouvrirEtape(su.id);
    }
  }

  return {
    badges,
    substeps,
    cookExcluded,
    subExcluded: (su: BatchSubstepRow) => batchSubstepExcluded(s, su),
    entierementTraitee,
    complete,
    subIngredientsBySubstep,
    cocherEtape,
    ingredientVerrouille,
    cocherIngredient,
    sousEtapeVerrouillee,
    cocherSousEtape,
  };
}
