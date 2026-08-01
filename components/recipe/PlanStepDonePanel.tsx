'use client';

// Case « Déjà réalisé » d'une étape + exception ligne par ligne par
// ingrédient/sous-étape, affichées directement dans le déroulé de la recette
// planifiée — voir CLAUDE.md « Recettes planifiées ».
//
// Un seul composant pour la case de l'étape, la liste d'ingrédients et la
// liste de sous-étapes : les trois doivent rester synchronisés instantanément
// (cocher l'étape coche aussitôt tout son contenu), ce que des instances
// séparées ne garantiraient pas avant le prochain router.refresh().
//
// Une étape entièrement traitée (`collapsible`) se replie derrière son titre
// — la case « Déjà réalisé » reste néanmoins visible hors du volet replié,
// pour pouvoir revenir dessus sans déplier.
import { useEffect, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { fmtNum, type PlanIngredientRow, type PlanStepRow, type PlanSubstepRow } from '@/lib/recipe-plan';

type StepFlags = Pick<PlanStepRow, 'id' | 'already_done'>;
type IngRow = Pick<PlanIngredientRow, 'id' | 'name' | 'quantity' | 'quantity_text' | 'unit' | 'comment' | 'removed' | 'excluded_when_done'>;
type SubRow = Pick<PlanSubstepRow, 'id' | 'texte' | 'order_index' | 'excluded_when_done'>;

function qtyText(it: Pick<IngRow, 'quantity' | 'quantity_text'>): string {
  return it.quantity != null ? fmtNum(it.quantity) : it.quantity_text || '';
}

export function PlanStepDonePanel({
  step: initialStep,
  ingredients: initialIngredients,
  substeps: initialSubsteps,
  collapsible = false,
  title,
  meta,
  children,
}: {
  step: StepFlags;
  ingredients: IngRow[];
  substeps: SubRow[];
  // Étape entièrement traitée : repliée derrière un chevron, fermée par
  // défaut — la case « Déjà réalisé » reste visible hors du volet replié,
  // pour pouvoir revenir dessus sans déplier. Sans chevron sinon, toujours
  // dépliée (étape active).
  collapsible?: boolean;
  // Titre seul sur sa ligne ; `meta` (les badges) partage sa ligne avec la
  // case et, si repliable, le chevron.
  title: ReactNode;
  meta: ReactNode;
  // Contenu serveur (photos, vidéo, astuces…) affiché avec les listes.
  children?: ReactNode;
}) {
  const { mutate, busy } = useMutation();
  const [step, setStep] = useState(initialStep);
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [substeps, setSubsteps] = useState(initialSubsteps);
  // Repliée par défaut si repliable ; sinon toujours dépliée (étape active).
  const [open, setOpen] = useState(!collapsible);
  // `busy` repasse à false dès que l'écriture réseau aboutit, avant que
  // router.refresh() n'ait fini de resynchroniser les props — état local mis
  // à jour au succès de la mutation pour que les cases changent en même temps
  // que la disparition du spinner (cf. CLAUDE.md « Suppression optimiste dans
  // une liste »).
  useEffect(() => setStep(initialStep), [initialStep]);
  useEffect(() => setIngredients(initialIngredients), [initialIngredients]);
  useEffect(() => setSubsteps(initialSubsteps), [initialSubsteps]);

  async function toggleDone() {
    const next = !step.already_done;
    const ok = await mutate(
      () => createClient().from('plan_steps').update({ already_done: next } as never).eq('id', step.id),
      { errorLabel: 'Modification non enregistrée' },
    );
    if (ok) setStep((s) => ({ ...s, already_done: next }));
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

  const doneToggle = (
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
  );

  const lists = (
    <>
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
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <LoadingOverlay visible={busy} label="Modification en cours…" />
      <div className="flex flex-col gap-3 border-b border-outline pb-4">
        {title}
        <div className="flex items-center justify-between flex-wrap gap-3">
          {meta}
          <div className="no-print flex items-center gap-3 shrink-0">
            {doneToggle}
            {collapsible && (
              <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-label={open ? "Replier l'étape" : "Déplier l'étape"}
                className="text-on-surface-variant hover:text-primary"
              >
                <span className={`material-symbols-outlined transition-transform ${open ? 'rotate-180' : ''}`}>expand_more</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {open && (
        <div className="flex flex-col gap-6">
          {lists}
          {children}
        </div>
      )}
    </div>
  );
}
