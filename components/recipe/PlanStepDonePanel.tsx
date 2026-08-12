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
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { fmtNum, planDayLabel, stepDayMoved, type PlanIngredientRow, type PlanStepRow, type PlanSubstepRow } from '@/lib/recipe-plan';
import { dayLabel } from '@/lib/recipe-view';
import type { RunningExecStep } from '@/lib/executions';

type StepFlags = Pick<PlanStepRow, 'id' | 'already_done' | 'day_offset' | 'base_day_offset' | 'user_note'>;
type IngRow = Pick<
  PlanIngredientRow,
  'id' | 'name' | 'quantity' | 'quantity_text' | 'unit' | 'comment' | 'removed' | 'excluded_when_done' | 'expanded_into_recipe_id'
> & { expanded_recipe?: { id: string; title: string } | null };
type SubRow = Pick<PlanSubstepRow, 'id' | 'texte' | 'order_index' | 'excluded_when_done' | 'added'>;

function qtyText(it: Pick<IngRow, 'quantity' | 'quantity_text'>): string {
  return it.quantity != null ? fmtNum(it.quantity) : it.quantity_text || '';
}

export function PlanStepDonePanel({
  step: initialStep,
  ingredients: initialIngredients,
  substeps: initialSubsteps,
  plannedDate,
  dayOptions,
  runningExecSteps,
  collapsible = false,
  title,
  meta,
  children,
}: {
  step: StepFlags;
  ingredients: IngRow[];
  substeps: SubRow[];
  // Date de dégustation du plan : rend les jours sous forme de vraies dates
  // dans le sélecteur, comme les badges de la fiche.
  plannedDate: string | null;
  // Jours proposés au déplacement (0 = jour J), calculés une fois pour tout le
  // plan par la page — l'étape seule ne connaît pas l'amplitude des autres.
  dayOptions: number[];
  // Étapes des sessions en cours pointant sur cette étape du plan : une
  // sous-étape ajoutée y est répercutée par insertion, sinon elle resterait
  // invisible et non cochable dans une session déjà démarrée (cf.
  // lib/executions.ts getRunningExecutionSteps).
  runningExecSteps: RunningExecStep[];
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
  const dialog = useDialog();
  const [step, setStep] = useState(initialStep);
  const [ingredients, setIngredients] = useState(initialIngredients);
  const [substeps, setSubsteps] = useState(initialSubsteps);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(initialStep.user_note || '');
  const [addingSubstep, setAddingSubstep] = useState(false);
  const [substepDraft, setSubstepDraft] = useState('');
  // Sous-étape en cours de glisser (cf. `substepsBlock` plus bas) : permet de
  // repositionner une sous-étape tout juste ajoutée — toujours créée en fin
  // de liste (cf. addSubstep) — entre des sous-étapes existantes, sans quoi
  // elle resterait coincée en dernière position.
  const [dragSubstep, setDragSubstep] = useState<number | null>(null);
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

  // ── Déplacement de l'étape ───────────────────────────────────────────
  // Seul `day_offset` bouge : `base_day_offset` garde le jour de la recette,
  // ce qui permet d'afficher les deux et de rétablir. Une session déjà
  // démarrée n'est volontairement pas touchée — son `execution_steps.day_offset`
  // est figé, et c'est lui qui porte l'ossature de son déroulé (jalons, tempo).
  async function changeDay(next: number) {
    if (next === step.day_offset) return;
    const ok = await mutate(() => createClient().from('plan_steps').update({ day_offset: next } as never).eq('id', step.id), {
      errorLabel: 'Jour non enregistré',
    });
    if (ok) {
      setStep((s) => ({ ...s, day_offset: next }));
      await proposeDeleteRunningSessions();
    }
  }

  // Une session en cours garde le jour figé à son démarrage (cf. dayControl
  // ci-dessous) — elle ne reflète donc jamais ce déplacement. Proposée à la
  // suppression plutôt qu'un avertissement muet, sur le même principe que
  // PlanIngredientsEditor pour une modification d'ingrédient.
  async function proposeDeleteRunningSessions() {
    if (!runningExecSteps.length) return;
    const ids = [...new Set(runningExecSteps.map((r) => r.execution_id))];
    const plural = ids.length > 1;
    await mutate(() => createClient().from('executions').delete().in('id', ids), {
      confirm: `${plural ? 'Des sessions' : 'Une session'} de préparation en cours ${plural ? 'ont' : 'a'} été figée${plural ? 's' : ''} avant ce changement de jour et ne le reflète${plural ? 'nt' : ''} pas.\n\n${plural ? 'Les supprimer' : 'La supprimer'} ?`,
      errorLabel: 'Suppression impossible',
    });
  }

  async function saveNote() {
    const next = noteDraft.trim() || null;
    const ok = await mutate(() => createClient().from('plan_steps').update({ user_note: next } as never).eq('id', step.id), {
      errorLabel: 'Note non enregistrée',
    });
    if (ok) {
      setStep((s) => ({ ...s, user_note: next }));
      setEditingNote(false);
    }
  }

  // Ajout d'une sous-étape : à la fin de la liste (pas d'intercalation, qui
  // demanderait un `order_index` fractionnaire), puis répercussion sur les
  // sessions en cours — insertion pure, aucune colonne figée n'est réécrite.
  async function addSubstep() {
    const texte = substepDraft.trim();
    if (!texte) {
      dialog.alert('Indiquez le texte de la sous-étape.');
      return;
    }
    const nextOrder = substeps.length ? Math.max(...substeps.map((s) => s.order_index)) + 1 : 0;
    const supabase = createClient();
    setAddingSubstep(false);
    setSubstepDraft('');
    await mutate(
      async () => {
        const res = await supabase
          .from('plan_substeps')
          .insert({ step_id: step.id, order_index: nextOrder, texte, added: true } as never)
          .select('id')
          .single();
        if (res.error || !res.data) return res;
        const substepId = (res.data as { id: number }).id;
        if (runningExecSteps.length) {
          const propagated = await supabase.from('execution_substeps').insert(
            runningExecSteps.map((e) => ({
              execution_id: e.execution_id,
              execution_step_id: e.execution_step_id,
              plan_substep_id: substepId,
              texte,
              order_index: nextOrder,
            })),
          );
          if (propagated.error) return propagated;
        }
        return res;
      },
      { errorLabel: 'Ajout impossible' },
    );
  }

  // Supprimable seulement si elle a été ajoutée ici : une sous-étape de la
  // recette se neutralise par « déjà réalisé », jamais par suppression.
  // `execution_substeps.plan_substep_id` est en ON DELETE SET NULL — une
  // session qui l'avait déjà cochée en garde la trace, avec son texte figé.
  async function deleteSubstep(sub: SubRow) {
    const ok = await mutate(() => createClient().from('plan_substeps').delete().eq('id', sub.id), { errorLabel: 'Suppression impossible' });
    if (ok) setSubsteps((prev) => prev.filter((s) => s.id !== sub.id));
  }

  // Réordonne les sous-étapes à la poignée (`from`/`to` : positions dans la
  // liste triée affichée). `order_index` n'est pas fractionnaire ici (cf.
  // addSubstep) : on renumérote l'ensemble plutôt que d'intercaler une seule
  // valeur, ce qui reste bon marché — une étape compte rarement plus d'une
  // poignée de sous-étapes.
  async function moveSubstep(from: number, to: number) {
    if (from === to) return;
    const sorted = [...substeps].sort((a, b) => a.order_index - b.order_index);
    const [moved] = sorted.splice(from, 1);
    sorted.splice(to, 0, moved);
    const reindexed = sorted.map((s, i) => ({ ...s, order_index: i }));
    const prev = substeps;
    setSubsteps(reindexed);
    const supabase = createClient();
    const ok = await mutate(
      async () => {
        const results = await Promise.all(reindexed.map((s) => supabase.from('plan_substeps').update({ order_index: s.order_index }).eq('id', s.id)));
        const failed = results.find((r) => r.error);
        return failed ? { error: failed.error } : { error: null };
      },
      { errorLabel: 'Réorganisation impossible' },
    );
    if (!ok) setSubsteps(prev);
  }

  const dayText = (offset: number) => (plannedDate ? planDayLabel(offset, plannedDate) : dayLabel(offset));
  const moved = stepDayMoved(step);

  // Une ligne retirée à la main (éditeur de quantités) reste exclue quelle
  // que soit la case ici — elle ne s'affiche donc pas dans ce parcours.
  const visible = ingredients.filter((it) => !it.removed);

  // Jour de l'étape : modifiable ici, avec le jour de la recette rappelé à
  // côté dès qu'il diffère (même principe que « Quantité d'origine » sur les
  // ingrédients) et un retour en arrière possible.
  const dayControl = (
    <span className="no-print flex items-center gap-1.5">
      <select
        value={step.day_offset}
        onChange={(e) => changeDay(parseInt(e.target.value, 10))}
        title="Déplacer cette étape à un autre jour"
        className={`border border-outline-variant rounded px-2 py-1 font-label-md text-[11px] ${moved ? 'text-green-700' : 'text-on-surface-variant'}`}
      >
        {dayOptions.map((o) => (
          <option key={o} value={o}>
            {dayText(o)}
          </option>
        ))}
      </select>
      {moved && (
        <>
          <span className="font-label-md text-[11px] text-on-surface-variant" title="Jour prévu par la recette">
            recette : {dayText(step.base_day_offset as number)}
          </span>
          <button
            type="button"
            onClick={() => changeDay(step.base_day_offset as number)}
            title="Rétablir le jour de la recette"
            className="text-primary hover:opacity-70"
          >
            <span className="material-symbols-outlined text-[18px]">undo</span>
          </button>
        </>
      )}
      {/* Mention factuelle, pas un avertissement : une session déjà démarrée
          conserve son propre planning (day_offset figé au démarrage). */}
      {runningExecSteps.length > 0 && (
        <span className="font-label-md text-[11px] text-on-surface-variant italic">une session en cours conserve son planning</span>
      )}
    </span>
  );

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

  // Note personnelle : bloc distinct du texte de la recette (description,
  // astuces), qui n'est jamais modifié. Distincte aussi du commentaire de
  // session (execution_steps.commentaire), qui relate ce qui s'est
  // réellement passé le jour J. S'imprime. Placée avant les ingrédients :
  // c'est la première chose à relire en abordant l'étape (matériel à
  // sortir, adaptation…), pas une note de fin de liste.
  const noteBlock = (
    <div className="border-l-4 border-green-700 bg-surface-container-low pl-4 pr-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-label-md text-[10px] uppercase tracking-widest text-secondary">Ma note</span>
        {!editingNote && (
          <button
            type="button"
            onClick={() => {
              setNoteDraft(step.user_note || '');
              setEditingNote(true);
            }}
            title={step.user_note ? 'Modifier ma note' : 'Ajouter une note à cette étape'}
            className="no-print text-primary hover:opacity-70"
          >
            <span className="material-symbols-outlined text-[18px]">{step.user_note ? 'edit' : 'add_circle'}</span>
          </button>
        )}
      </div>
      {editingNote ? (
        <div className="no-print flex flex-col gap-3">
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={3}
            autoFocus
            placeholder="Ce que je veux retenir pour cette étape"
            className="border border-outline-variant rounded px-3 py-2 font-body-md text-sm w-full bg-white"
          />
          <div className="flex items-center gap-3">
            <button type="button" onClick={saveNote} className="bg-primary text-white font-label-md text-label-md px-4 py-2 rounded hover:opacity-90">
              Enregistrer
            </button>
            <button type="button" onClick={() => setEditingNote(false)} className="font-label-md text-label-md text-on-surface-variant hover:text-primary">
              Annuler
            </button>
          </div>
        </div>
      ) : step.user_note ? (
        <p className="font-body-md text-body-md whitespace-pre-line text-on-surface">{step.user_note}</p>
      ) : (
        <p className="no-print font-body-md text-sm italic text-on-surface-variant">Aucune note.</p>
      )}
    </div>
  );

  const ingredientsBlock =
    visible.length > 0 ? (
      <details className="group border border-outline-variant mb-2" open>
        <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
          <span className="font-label-md text-label-md text-primary">Ingrédients de l&apos;étape</span>
          <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
        </summary>
        <div className="p-4 bg-white">
          {/* Nom en `minmax(0,1fr)` pour qu'il se replie : une grille tout en
              `max-content` ne rétrécit pas et débordait du viewport mobile. */}
          <ul
            className={`grid gap-x-4 sm:gap-x-10 print:gap-x-10 ${
              step.already_done
                ? 'grid-cols-[max-content_max-content_minmax(0,1fr)]'
                : 'grid-cols-[max-content_minmax(0,1fr)]'
            }`}
          >
            {visible.map((it) => {
              // Ingrédient remplacé par une sous-recette : il reste listé,
              // barré, avec le renvoi — le faire disparaître laisserait
              // croire à un oubli. Rien à cocher dessus : il ne rentre plus
              // dans le parcours quel que soit l'état de l'étape.
              const replaced = it.expanded_into_recipe_id != null;
              const excluded = !replaced && step.already_done && it.excluded_when_done;
              // Barré en rouge comme une suppression : l'ingrédient ne
              // s'achète plus. La mention verte en dessous dit où il est
              // fabriqué à la place.
              const tone = replaced ? 'text-error line-through' : excluded ? 'text-on-surface-variant line-through opacity-60' : '';
              return (
                <li key={it.id} className="py-2 border-b border-outline-variant/30" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'center' }}>
                  {step.already_done && (
                    <span className="no-print">
                      {replaced ? null : (
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
                      )}
                    </span>
                  )}
                  <span className={`font-label-md text-label-md whitespace-nowrap ${tone || 'text-primary'}`}>
                    <span className="hidden print:inline-block align-text-bottom w-4 h-4 border-2 border-on-surface mr-2" />
                    {qtyText(it)} {it.unit || ''}
                  </span>
                  <span className={`font-body-md text-body-md break-words ${tone}`}>
                    {it.name}
                    {it.comment && <span className="print-fs-9 text-on-surface-variant text-sm italic"> — {it.comment}</span>}
                  </span>
                  {replaced && (
                    <span className="font-body-md text-[12px] text-green-700" style={{ gridColumn: '1/-1' }}>
                      Fabriqué à partir de{' '}
                      {it.expanded_recipe ? (
                        <Link href={`/recette/${it.expanded_recipe.id}`} className="underline underline-offset-2 hover:opacity-70">
                          {it.expanded_recipe.title}
                        </Link>
                      ) : (
                        <span className="italic">une recette qui n’est plus accessible</span>
                      )}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </details>
    ) : null;

  const sortedSubsteps = [...substeps].sort((a, b) => a.order_index - b.order_index);

  const substepsBlock = (
    <>
      {sortedSubsteps.length > 0 && (
        <ul className="flex flex-col gap-3 font-body-lg text-body-lg leading-relaxed text-on-surface">
          {sortedSubsteps.map((su, idx) => {
              const excluded = step.already_done && su.excluded_when_done;
              // Vert = ajoutée par l'utilisateur, comme un ingrédient ajouté
              // dans PlanIngredientsEditor. L'exclusion « déjà fait » prime.
              const tone = excluded ? 'text-on-surface-variant line-through opacity-60' : su.added ? 'text-green-700' : '';
              return (
                <li
                  key={su.id}
                  onDragOver={(e) => {
                    if (dragSubstep === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    if (dragSubstep === null) return;
                    e.preventDefault();
                    moveSubstep(dragSubstep, idx);
                    setDragSubstep(null);
                  }}
                  className={`flex gap-3 items-start${dragSubstep === idx ? ' opacity-50' : ''}`}
                >
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDragSubstep(idx);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDragSubstep(null)}
                    title="Glisser pour réordonner cette sous-étape"
                    className="no-print material-symbols-outlined text-[18px] text-outline-variant hover:text-secondary cursor-grab active:cursor-grabbing select-none shrink-0"
                  >
                    drag_indicator
                  </span>
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
                    <span className={`shrink-0 ${su.added ? 'text-green-700' : 'text-primary'}`}>–</span>
                  )}
                  <span className={`flex-1 min-w-0 ${tone}`}>{su.texte}</span>
                  {su.added && (
                    <button
                      type="button"
                      onClick={() => deleteSubstep(su)}
                      title="Retirer cette sous-étape ajoutée"
                      className="no-print text-error hover:opacity-70 shrink-0"
                    >
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      )}
      {addingSubstep ? (
        <div className="no-print flex flex-col gap-3">
          <textarea
            value={substepDraft}
            onChange={(e) => setSubstepDraft(e.target.value)}
            rows={2}
            autoFocus
            placeholder="Ce que j'ajoute à cette étape"
            className="border border-outline-variant rounded px-3 py-2 font-body-md text-sm w-full"
          />
          <div className="flex items-center gap-3">
            <button type="button" onClick={addSubstep} className="bg-primary text-white font-label-md text-label-md px-4 py-2 rounded hover:opacity-90">
              Ajouter
            </button>
            <button
              type="button"
              onClick={() => {
                setAddingSubstep(false);
                setSubstepDraft('');
              }}
              className="font-label-md text-label-md text-on-surface-variant hover:text-primary"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddingSubstep(true)}
          className="no-print flex items-center gap-1 text-primary font-label-md text-[12px] hover:underline self-start"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span> Ajouter une sous-étape
        </button>
      )}
    </>
  );

  const lists = (
    <>
      {noteBlock}
      {ingredientsBlock}
      {substepsBlock}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <LoadingOverlay visible={busy} label="Modification en cours…" />
      <div className="flex flex-col gap-3 border-b border-outline pb-4">
        {title}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            {dayControl}
            {meta}
          </div>
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
