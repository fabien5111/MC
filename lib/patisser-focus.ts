// Mode Pâtisser « une étape à la fois » (téléphone et tablette) : logique pure.
//
// La vue sous 1024 px montre UNE étape ; la jauge du haut en montre l'état
// (vert = terminée, marron = il reste quelque chose à faire). Les règles de
// coche sont celles du déroulé (cf. `StepCookCard`) : ce module ne fait que
// les réunir pour la jauge et le choix de l'étape affichée à l'ouverture.
import {
  batchIngredientExcluCuisine,
  batchStepReplaced,
  batchSubstepExcluded,
  type BatchFull,
  type BatchIngredientRow,
  type BatchJalon,
  type BatchStepRow,
  type BatchSubstepRow,
} from '@/lib/recipe-plan';

type EtapeCuisine = BatchStepRow & { batch_substeps: BatchSubstepRow[] };

/**
 * Ingrédients rendus sous une étape en mode Pâtisser : tout ce que l'étape
 * porte, sauf les lignes retirées à la main, et rien si l'étape entière est
 * remplacée par une recette. Même filtre que le déroulé (`PatisserBody`).
 */
export function ingredientsEtapeCuisine(batch: Pick<BatchFull, 'batch_ingredients'>, s: Pick<BatchStepRow, 'id' | 'replaced_by_recipe_id'>): BatchIngredientRow[] {
  if (batchStepReplaced(s)) return [];
  return batch.batch_ingredients.filter((it) => it.batch_step_id === s.id && !it.removed);
}

/**
 * Étape terminée au sens de la case de son titre : cochée, et plus rien de ce
 * qu'elle garde (ingrédient ou sous-étape décochés de l'exclusion « déjà
 * réalisée ») n'y reste à faire. `done` seul resterait vrai pour une pâte
 * « déjà réalisée avant la fournée » dont la cuisson est encore à faire.
 */
export function etapeTerminee(s: EtapeCuisine, ingredients: BatchIngredientRow[]): boolean {
  if (!s.done) return false;
  const ingOk = ingredients.filter((it) => !batchIngredientExcluCuisine(s, it)).every((it) => it.done);
  const subOk = s.batch_substeps.filter((su) => !batchSubstepExcluded(s, su)).every((su) => su.done);
  return ingOk && subOk;
}

/** Une étape du déroulé, dans l'ordre (jour, puis position), avec son jour. */
export type EtapeOrdonnee = { step: EtapeCuisine; jalon: number; terminee: boolean };

/** Toutes les étapes dans l'ordre du déroulé, chacune avec son jour et son état. */
export function etapesOrdonnees(batch: Pick<BatchFull, 'batch_ingredients'>, jalons: BatchJalon[]): EtapeOrdonnee[] {
  return jalons.flatMap((j, ji) =>
    j.steps.map((step) => ({ step, jalon: ji, terminee: etapeTerminee(step, ingredientsEtapeCuisine(batch, step)) })),
  );
}

/**
 * Étape affichée à l'ouverture : celle visée par l'adresse (`#etape-<id>`) si
 * elle existe, sinon la première qui n'est pas terminée, sinon la première.
 * `null` pour une fournée sans étape.
 */
export function etapeInitiale(etapes: EtapeOrdonnee[], visee: number | null = null): number | null {
  if (!etapes.length) return null;
  if (visee != null && etapes.some((e) => e.step.id === visee)) return visee;
  return (etapes.find((e) => !e.terminee) ?? etapes[0]).step.id;
}

/**
 * Étape à afficher quand on choisit un jour dans le sommaire : la première
 * de ce jour qui reste à faire, sinon la première du jour.
 */
export function etapeDuJalon(etapes: EtapeOrdonnee[], jalon: number): number | null {
  const duJour = etapes.filter((e) => e.jalon === jalon);
  if (!duJour.length) return null;
  return (duJour.find((e) => !e.terminee) ?? duJour[0]).step.id;
}
