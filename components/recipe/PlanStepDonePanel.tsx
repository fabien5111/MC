'use client';

// Case « Déjà réalisé » d'une étape + exception ligne par ligne par
// ingrédient, affichées directement dans le déroulé de la recette planifiée
// (à côté de la liste « Ingrédients de l'étape »), plutôt que dans l'éditeur
// de quantités plus haut sur la page — voir CLAUDE.md « Recettes planifiées ».
//
// Un seul composant pour la case de l'étape et la liste de ses ingrédients :
// les deux doivent rester synchronisées instantanément (cocher l'étape coche
// aussitôt tous ses ingrédients), ce que deux instances séparées ne
// garantiraient pas avant le prochain router.refresh().
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { fmtNum, type PlanIngredientRow, type PlanStepRow, type PlanSubstepRow } from '@/lib/recipe-plan';

type StepFlags = Pick<PlanStepRow, 'id' | 'already_done' | 'keep_cooking' | 'cook_time'>;
type IngRow = Pick<PlanIngredientRow, 'id' | 'name' | 'quantity' | 'quantity_text' | 'unit' | 'comment' | 'removed' | 'excluded_when_done'>;
type SubRow = Pick<PlanSubstepRow, 'id' | 'texte' | 'order_index' | 'excluded_when_done'>;

function qtyText(it: Pick<IngRow, 'quantity' | 'quantity_text'>): string {
  return it.quantity != null ? fmtNum(it.quantity) : it.quantity_text || '';
}

export function PlanStepDonePanel({
  step: initialStep,
  ingredients: initialIngredients,
  substeps: initialSubsteps,
}: {
  step: StepFlags;
  ingredients: IngRow[];
  substeps: SubRow[];
}) {
  const { mutate, busy } = useMutation();
  const [step, setStep] = useState(initialStep);
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [substeps, setSubsteps] = useState(initialSubsteps);
  // `busy` repasse à false dès que l'écriture réseau aboutit, avant que
  // router.refresh() n'ait fini de resynchroniser les props — état local mis
  // à jour au succès de la mutation pour que les cases changent en même temps
  // que la disparition du spinner (cf. CLAUDE.md « Suppression optimiste dans
  // une liste »).
  useEffect(() => setStep(initialStep), [initialStep]);
  useEffect(() => setIngredients(initialIngredients), [initialIngredients]);
  useEffect(() => setSubsteps(initialSubsteps), [initialSubsteps]);

  async function patchStep(patch: Partial<Pick<PlanStepRow, 'already_done' | 'keep_cooking'>>) {
    const ok = await mutate(
      () => createClient().from('plan_steps').update(patch as never).eq('id', step.id),
      { errorLabel: 'Modification non enregistrée' },
    );
    if (ok) setStep((s) => ({ ...s, ...patch }));
  }

  function toggleDone() {
    // Repasser une étape « à faire » remet aussi la cuisson dans son état par
    // défaut : garder `keep_cooking` à vrai sur une étape active n'a pas de sens.
    patchStep(step.already_done ? { already_done: false, keep_cooking: false } : { already_done: true });
  }

  async function toggleIngredient(row: IngRow) {
    const next = !row.excluded_when_done;
    const ok = await mutate(
      () => createClient().from('plan_ingredients').update({ excluded_when_done: next } as never).eq('id', row.id),
      { errorLabel: 'Modification non enregistrée' },
    );
    if (ok) setIngredients((prev) => prev.map((r) => (r.id === row.id ? { ...r, excluded_when_done: next } : r)));
  }

  // Même exception, pour une puce de sous-étape (ex. « Porter à ébullition »
  // gardée alors que le reste de l'étape est déjà fait).
  async function toggleSubstep(sub: SubRow) {
    const next = !sub.excluded_when_done;
    const ok = await mutate(
      () => createClient().from('plan_substeps').update({ excluded_when_done: next } as never).eq('id', sub.id),
      { errorLabel: 'Modification non enregistrée' },
    );
    if (ok) setSubsteps((prev) => prev.map((s) => (s.id === sub.id ? { ...s, excluded_when_done: next } : s)));
  }

  // Une ligne retirée à la main (éditeur de quantités) reste exclue quelle
  // que soit la case ici — elle ne s'affiche donc pas dans ce parcours.
  const visible = ingredients.filter((it) => !it.removed);

  return (
    <div className="flex flex-col gap-3">
      <LoadingOverlay visible={busy} label="Modification en cours…" />
      <div className="no-print flex items-center gap-4 flex-wrap">
        <label
          className="flex items-center gap-1.5 font-label-md text-[11px] text-on-surface-variant cursor-pointer"
          title={
            step.already_done
              ? "Cette étape est à refaire : ses ingrédients reviennent dans les courses et la mise en place"
              : "J'ai déjà réalisé cette étape : retirer ses ingrédients des courses et de la mise en place"
          }
        >
          <input
            type="checkbox"
            checked={step.already_done}
            onChange={toggleDone}
            className="w-5 h-5 rounded border-outline accent-primary focus:ring-primary cursor-pointer"
          />
          Déjà réalisé
        </label>
        {step.already_done && step.cook_time != null && step.cook_time > 0 && (
          <label className="flex items-center gap-1.5 font-label-md text-[11px] text-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              checked={step.keep_cooking}
              onChange={() => patchStep({ keep_cooking: !step.keep_cooking })}
              className="w-4 h-4 rounded border-outline accent-primary focus:ring-primary cursor-pointer"
            />
            La cuisson reste à faire
          </label>
        )}
      </div>
      {visible.length > 0 && (
        <details className="group border border-outline-variant mb-2" open>
          <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
            <span className="font-label-md text-label-md text-primary">Ingrédients de l&apos;étape</span>
            <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
          </summary>
          <div className="p-4 bg-white">
            <ul style={{ display: 'grid', gridTemplateColumns: step.already_done ? 'max-content max-content max-content' : 'max-content max-content', columnGap: 40 }}>
              {visible.map((it) => {
                const excluded = step.already_done && it.excluded_when_done;
                const tone = excluded ? 'text-on-surface-variant line-through opacity-60' : '';
                return (
                  <li key={it.id} className="py-2 border-b border-outline-variant/30" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'center' }}>
                    {step.already_done && (
                      <span className="no-print">
                        <input
                          type="checkbox"
                          checked={it.excluded_when_done}
                          onChange={() => toggleIngredient(it)}
                          title={
                            it.excluded_when_done
                              ? 'Déjà pris en compte — décocher pour le conserver quand même (ex. un ingrédient utile plus tard dans la même étape)'
                              : 'Conservé malgré l’étape déjà réalisée'
                          }
                          className="w-5 h-5 rounded border-outline accent-primary focus:ring-primary cursor-pointer"
                        />
                      </span>
                    )}
                    <span className={`font-label-md text-label-md ${tone || 'text-primary'}`}>
                      <span className="hidden print:inline-block align-text-bottom w-4 h-4 border-2 border-on-surface mr-2" />
                      {qtyText(it)} {it.unit || ''}
                    </span>
                    <span className={`font-body-md text-body-md ${tone}`}>
                      {it.name}
                      {it.comment && <span className="print-fs-9 text-on-surface-variant text-sm italic"> — {it.comment}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </details>
      )}
      {substeps.length > 0 && (
        <ul className="flex flex-col gap-3 font-body-lg text-body-lg leading-relaxed text-on-surface">
          {[...substeps]
            .sort((a, b) => a.order_index - b.order_index)
            .map((su) => {
              const excluded = step.already_done && su.excluded_when_done;
              return (
                <li key={su.id} className="flex gap-3 items-start">
                  {step.already_done ? (
                    <input
                      type="checkbox"
                      checked={su.excluded_when_done}
                      onChange={() => toggleSubstep(su)}
                      title={
                        excluded
                          ? 'Déjà pris en compte — décocher pour garder cette sous-étape (ex. la cuisson)'
                          : 'Conservée malgré l’étape déjà réalisée'
                      }
                      className="no-print w-5 h-5 rounded border-outline accent-primary focus:ring-primary cursor-pointer shrink-0 mt-1"
                    />
                  ) : (
                    <span className="text-primary shrink-0">–</span>
                  )}
                  <span className={excluded ? 'text-on-surface-variant line-through opacity-60' : ''}>{su.texte}</span>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
