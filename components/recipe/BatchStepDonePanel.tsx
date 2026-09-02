'use client';

// Case unique d'une étape (cf. CLAUDE.md « Fournées » — fusion de l'ancien
// « déjà réalisé » du plan et du « fait » de la session) + exception ligne
// par ligne par ingrédient/sous-étape, affichées directement dans le déroulé
// de la fournée.
//
// Un seul composant pour la case de l'étape, la liste d'ingrédients et la
// liste de sous-étapes : les trois doivent rester synchronisés instantanément
// (cocher l'étape coche aussitôt tout son contenu), ce que des instances
// séparées ne garantiraient pas avant le prochain router.refresh().
//
// Une étape entièrement traitée (`collapsible`) se replie derrière son titre
// — la case reste néanmoins visible hors du volet replié, pour pouvoir
// revenir dessus sans déplier.
//
// Cocher ici a exactement le même effet que cocher en mode Pâtisser : il n'y
// a plus de copie séparée à garder synchronisée, donc plus de session à
// proposer de supprimer après un déplacement de jour ou l'ajout d'une
// sous-étape.
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { fmtNum, batchDayLabel, stepDayMoved, type BatchIngredientRow, type BatchStepRow, type BatchSubstepRow } from '@/lib/recipe-plan';
import { dayLabel } from '@/lib/recipe-view';

type StepFlags = Pick<BatchStepRow, 'id' | 'done' | 'day_offset' | 'base_day_offset' | 'user_note'>;
type IngRow = Pick<
  BatchIngredientRow,
  'id' | 'name' | 'quantity' | 'quantity_text' | 'unit' | 'comment' | 'removed' | 'excluded_when_done' | 'expanded_into_recipe_id'
> & { expanded_recipe?: { id: string; title: string } | null };
type SubRow = Pick<BatchSubstepRow, 'id' | 'texte' | 'order_index' | 'excluded_when_done' | 'added'>;

function qtyText(it: Pick<IngRow, 'quantity' | 'quantity_text'>): string {
  return it.quantity != null ? fmtNum(it.quantity) : it.quantity_text || '';
}

// Conversions jour ↔ date, pour le sélecteur de jour ci-dessous : la donnée
// reste un décalage (`day_offset`, jours avant la dégustation — cf. lib/
// recipe-plan.ts), le calendrier n'en est qu'une autre façon de le saisir.
function offsetToDate(offset: number, plannedDate: string): string {
  const d = new Date(plannedDate + 'T00:00:00');
  d.setDate(d.getDate() - Math.max(0, offset || 0));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dateToOffset(dateStr: string, plannedDate: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const p = new Date(plannedDate + 'T00:00:00');
  return Math.max(0, Math.round((p.getTime() - d.getTime()) / 86400000));
}

export function BatchStepDonePanel({
  step: initialStep,
  ingredients: initialIngredients,
  substeps: initialSubsteps,
  plannedDate,
  dayOptions,
  collapsible = false,
  title,
  meta,
  children,
  canPersonalNotes = true,
  canSubsteps = true,
  readOnly = false,
}: {
  step: StepFlags;
  ingredients: IngRow[];
  substeps: SubRow[];
  // Fournée close (terminée/abandonnée), consultation `?lecture=1` ou session
  // « en tant que » lecture seule : mêmes conditions que le mode Pâtisser,
  // qui désactive ses cases depuis toujours. Sans cette prop, le mode
  // Préparer restait modifiable sur une fournée terminée — l'interface
  // mentait sur l'état de la fournée, et cocher/décocher y réécrivait
  // l'historique de ce qui avait été réellement fait. Défaut à `false` :
  // l'appelant qui ne la passe pas garde le comportement d'avant.
  readOnly?: boolean;
  // Droits d'abonnement (§4 « Lancer une fournée »). Défaut à `true` : les
  // appelants qui ne les passent pas encore (aucun aujourd'hui) gardent le
  // comportement d'avant ce câblage plutôt que de se retrouver bridés par
  // omission.
  canPersonalNotes?: boolean;
  canSubsteps?: boolean;
  // Date de dégustation de la fournée : rend les jours sous forme de vraies
  // dates dans le sélecteur, comme les badges de la fiche.
  plannedDate: string | null;
  // Jours proposés au déplacement (0 = jour J), calculés une fois pour toute
  // la fournée par la page — l'étape seule ne connaît pas l'amplitude des
  // autres.
  dayOptions: number[];
  // Étape entièrement traitée : repliée derrière un chevron, fermée par
  // défaut — la case reste visible hors du volet replié, pour pouvoir
  // revenir dessus sans déplier. Sans chevron sinon, toujours dépliée (étape
  // active).
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
  // Bascule sur repliée dès que l'étape DEVIENT repliable en cours de
  // session (ex. remplacement par une recette venant d'aboutir) : l'état
  // initial de `open` n'est lu qu'au montage, or ce composant reste monté
  // (même `key`) à travers le `router.refresh()` qui suit l'écriture — sans
  // cet effet, une étape ouverte au moment du remplacement resterait
  // dépliée malgré son nouveau statut. Ne force rien tant que `collapsible`
  // ne change pas de valeur : un dépliage manuel sur une étape déjà
  // repliable n'est donc jamais écrasé par un rendu qui ne change rien.
  useEffect(() => {
    if (collapsible) setOpen(false);
  }, [collapsible]);
  // `busy` repasse à false dès que l'écriture réseau aboutit, avant que
  // router.refresh() n'ait fini de resynchroniser les props — état local mis
  // à jour au succès de la mutation pour que les cases changent en même temps
  // que la disparition du spinner (cf. CLAUDE.md « Suppression optimiste dans
  // une liste »).
  useEffect(() => setStep(initialStep), [initialStep]);
  useEffect(() => setIngredients(initialIngredients), [initialIngredients]);
  useEffect(() => setSubsteps(initialSubsteps), [initialSubsteps]);

  async function toggleDone() {
    if (readOnly) return;
    const next = !step.done;
    const ok = await mutate(
      () => createClient().from('batch_steps').update({ done: next } as never).eq('id', step.id),
      { errorLabel: 'Modification non enregistrée' },
    );
    if (ok) setStep((s) => ({ ...s, done: next }));
  }

  async function toggleIngredient(row: IngRow) {
    if (readOnly) return;
    const next = !row.excluded_when_done;
    const ok = await mutate(
      () => createClient().from('batch_ingredients').update({ excluded_when_done: next } as never).eq('id', row.id),
      { errorLabel: 'Modification non enregistrée' },
    );
    if (ok) setIngredients((prev) => prev.map((r) => (r.id === row.id ? { ...r, excluded_when_done: next } : r)));
  }

  // Même exception, pour une puce de sous-étape (ex. « Porter à ébullition »
  // gardée alors que le reste de l'étape est déjà fait).
  async function toggleSubstep(sub: SubRow) {
    if (readOnly) return;
    const next = !sub.excluded_when_done;
    const ok = await mutate(
      () => createClient().from('batch_substeps').update({ excluded_when_done: next } as never).eq('id', sub.id),
      { errorLabel: 'Modification non enregistrée' },
    );
    if (ok) setSubsteps((prev) => prev.map((s) => (s.id === sub.id ? { ...s, excluded_when_done: next } : s)));
  }

  // ── Déplacement de l'étape ───────────────────────────────────────────
  // Seul `day_offset` bouge : `base_day_offset` garde le jour de la recette,
  // ce qui permet d'afficher les deux et de rétablir.
  async function changeDay(next: number) {
    if (readOnly) return;
    if (next === step.day_offset) return;
    const ok = await mutate(() => createClient().from('batch_steps').update({ day_offset: next } as never).eq('id', step.id), {
      errorLabel: 'Jour non enregistré',
    });
    if (ok) setStep((s) => ({ ...s, day_offset: next }));
  }

  async function saveNote() {
    if (readOnly) return;
    const next = noteDraft.trim() || null;
    const ok = await mutate(() => createClient().from('batch_steps').update({ user_note: next } as never).eq('id', step.id), {
      errorLabel: 'Note non enregistrée',
    });
    if (ok) {
      setStep((s) => ({ ...s, user_note: next }));
      setEditingNote(false);
    }
  }

  // Ajout d'une sous-étape, à la fin de la liste (pas d'intercalation, qui
  // demanderait un `order_index` fractionnaire).
  async function addSubstep() {
    if (readOnly) return;
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
      () => supabase.from('batch_substeps').insert({ batch_step_id: step.id, order_index: nextOrder, texte, added: true } as never),
      { errorLabel: 'Ajout impossible' },
    );
  }

  // Supprimable seulement si elle a été ajoutée ici : une sous-étape de la
  // recette se neutralise par « déjà réalisé », jamais par suppression.
  async function deleteSubstep(sub: SubRow) {
    if (readOnly) return;
    const ok = await mutate(() => createClient().from('batch_substeps').delete().eq('id', sub.id), { errorLabel: 'Suppression impossible' });
    if (ok) setSubsteps((prev) => prev.filter((s) => s.id !== sub.id));
  }

  // Réordonne les sous-étapes à la poignée (`from`/`to` : positions dans la
  // liste triée affichée). `order_index` n'est pas fractionnaire ici (cf.
  // addSubstep) : on renumérote l'ensemble plutôt que d'intercaler une seule
  // valeur, ce qui reste bon marché — une étape compte rarement plus d'une
  // poignée de sous-étapes.
  async function moveSubstep(from: number, to: number) {
    if (readOnly) return;
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
        const results = await Promise.all(reindexed.map((s) => supabase.from('batch_substeps').update({ order_index: s.order_index }).eq('id', s.id)));
        const failed = results.find((r) => r.error);
        return failed ? { error: failed.error } : { error: null };
      },
      { errorLabel: 'Réorganisation impossible' },
    );
    if (!ok) setSubsteps(prev);
  }

  const dayText = (offset: number) => (plannedDate ? batchDayLabel(offset, plannedDate) : dayLabel(offset));
  const moved = stepDayMoved(step);

  // Une ligne retirée à la main (éditeur de quantités) reste exclue quelle
  // que soit la case ici — elle ne s'affiche donc pas dans ce parcours.
  const visible = ingredients.filter((it) => !it.removed);

  // Jour de l'étape : modifiable ici, avec le jour de la recette rappelé à
  // côté dès qu'il diffère (même principe que « Quantité d'origine » sur les
  // ingrédients) et un retour en arrière possible.
  // Calendrier natif (input date) plutôt qu'une liste de jours : la liste
  // n'allait que jusqu'au jour le plus reculé utilisé par une étape (+ une
  // marge de 2), donc invisible pour reculer davantage. Le calendrier n'a pas
  // cette limite — plafonné au jour de dégustation (`max`), puisqu'une étape
  // ne peut pas tomber après. Repli sur la liste de décalages si la fournée
  // n'a pas de date (rien à quoi ancrer un calendrier).
  const dayControlCls = `h-7 border border-outline-variant rounded px-2 font-label-md text-[12px] ${moved ? 'text-green-700' : 'text-on-surface-variant'}${
    readOnly ? ' opacity-60' : ''
  }`;
  const dayInput = plannedDate ? (
    <input
      type="date"
      value={offsetToDate(step.day_offset ?? 0, plannedDate)}
      max={plannedDate}
      disabled={readOnly}
      onChange={(e) => e.target.value && changeDay(dateToOffset(e.target.value, plannedDate))}
      title={readOnly ? 'Fournée close : le jour n’est plus modifiable' : 'Déplacer cette étape à un autre jour'}
      className={dayControlCls}
    />
  ) : (
    <select
      value={step.day_offset}
      disabled={readOnly}
      onChange={(e) => changeDay(parseInt(e.target.value, 10))}
      title={readOnly ? 'Fournée close : le jour n’est plus modifiable' : 'Déplacer cette étape à un autre jour'}
      className={dayControlCls}
    >
      {dayOptions.map((o) => (
        <option key={o} value={o}>
          {dayText(o)}
        </option>
      ))}
    </select>
  );
  const dayControl = (
    <span className="no-print flex items-center gap-1.5">
      {dayInput}
      {moved && (
        <>
          <span className="font-label-md text-[11px] text-on-surface-variant" title="Jour prévu par la recette">
            recette : {dayText(step.base_day_offset as number)}
          </span>
          {!readOnly && (
            <button
              type="button"
              onClick={() => changeDay(step.base_day_offset as number)}
              title="Rétablir le jour de la recette"
              className="text-primary hover:opacity-70"
            >
              <span className="material-symbols-outlined text-[18px]">undo</span>
            </button>
          )}
        </>
      )}
    </span>
  );

  const doneToggle = (
    <label
      className={`flex items-center gap-1.5 font-label-md text-[11px] text-on-surface-variant ${readOnly ? 'opacity-60' : 'cursor-pointer'}`}
      title={
        readOnly
          ? 'Fournée close : reprenez-la pour modifier ce qui a été réalisé'
          : step.done
            ? "Cette étape est à refaire : ses ingrédients reviennent dans les courses et la mise en place"
            : "J'ai déjà réalisé cette étape : retirer ses ingrédients des courses et de la mise en place"
      }
    >
      <input
        type="checkbox"
        checked={step.done}
        disabled={readOnly}
        onChange={toggleDone}
        className={`w-5 h-5 rounded border-outline accent-primary focus:ring-primary ${readOnly ? '' : 'cursor-pointer'}`}
      />
      Réalisée partiellement ou complètement
    </label>
  );

  // Affiché uniquement quand l'étape vient d'être (ou est déjà) cochée : au
  // survol, chaque ligne d'ingrédient/sous-étape porte déjà un `title`
  // explicatif, mais un `title` ne se découvre pas — ce bandeau rend le geste
  // visible sans avoir à survoler chaque case une à une.
  const partialHint = step.done && !readOnly && (
    <p className="font-body-md text-[12px] text-on-surface-variant italic">
      Les ingrédients et sous-étapes déjà pris en compte sont grisés et barrés — décochez ceux que vous voulez
      conserver dans les courses et le déroulé.
    </p>
  );

  // Note personnelle : bloc distinct du texte de la recette (description,
  // astuces), qui n'est jamais modifié. Distincte aussi du constat du jour J
  // (`commentaire`, saisi en mode Pâtisser) — l'une est l'intention, l'autre
  // la réalisation. S'imprime. Placée avant les ingrédients : c'est la
  // première chose à relire en abordant l'étape (matériel à sortir,
  // adaptation…), pas une note de fin de liste.
  const noteBlock = (
    <div className="border-l-4 border-green-700 bg-surface-container-low pl-4 pr-3 py-3 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-label-md text-[10px] uppercase tracking-widest text-secondary">Ma note</span>
        {!editingNote && canPersonalNotes && !readOnly && (
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
      {/* Une note déjà saisie AVANT une rétrogradation reste visible telle
          quelle (§7.4, l'existant est préservé) : seule la saisie d'une
          nouvelle note est bridée, jamais l'affichage de celle qui existe. */}
      {!canPersonalNotes && !step.user_note ? (
        <p className="no-print font-body-md text-sm italic text-on-surface-variant">
          Non incluses dans votre formule —{' '}
          <Link href="/plans" className="text-primary underline">
            voir les formules
          </Link>
          .
        </p>
      ) : editingNote ? (
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
              step.done ? 'grid-cols-[max-content_max-content_minmax(0,1fr)]' : 'grid-cols-[max-content_minmax(0,1fr)]'
            }`}
          >
            {visible.map((it) => {
              // Ingrédient remplacé par une sous-recette : il reste listé,
              // barré, avec le renvoi — le faire disparaître laisserait
              // croire à un oubli. Rien à cocher dessus : il ne rentre plus
              // dans le parcours quel que soit l'état de l'étape.
              const replaced = it.expanded_into_recipe_id != null;
              const excluded = !replaced && step.done && it.excluded_when_done;
              // Barré en rouge comme une suppression : l'ingrédient ne
              // s'achète plus. La mention verte en dessous dit où il est
              // fabriqué à la place.
              const tone = replaced ? 'text-error line-through' : excluded ? 'text-on-surface-variant line-through opacity-60' : '';
              return (
                <li key={it.id} className="py-2 border-b border-outline-variant/30" style={{ display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'center' }}>
                  {step.done && (
                    <span className="no-print">
                      {replaced ? null : (
                      <input
                        type="checkbox"
                        checked={it.excluded_when_done}
                        disabled={readOnly}
                        onChange={() => toggleIngredient(it)}
                        title={
                          readOnly
                            ? 'Fournée close : reprenez-la pour modifier ce qui a été réalisé'
                            : it.excluded_when_done
                              ? 'Déjà pris en compte — décocher pour le conserver quand même (ex. un ingrédient utile plus tard dans la même étape)'
                              : 'Conservé malgré l’étape déjà réalisée'
                        }
                        className={`w-5 h-5 rounded border-outline accent-primary focus:ring-primary ${readOnly ? 'opacity-60' : 'cursor-pointer'}`}
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
              const excluded = step.done && su.excluded_when_done;
              // Vert = ajoutée par l'utilisateur, comme un ingrédient ajouté
              // dans BatchIngredientsEditor. L'exclusion « déjà fait » prime.
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
                  className={`flex gap-1.5 items-start${dragSubstep === idx ? ' opacity-50' : ''}`}
                >
                  {readOnly ? (
                    <span className="no-print shrink-0 w-[18px]" />
                  ) : (
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
                  )}
                  {step.done ? (
                    <input
                      type="checkbox"
                      checked={su.excluded_when_done}
                      disabled={readOnly}
                      onChange={() => toggleSubstep(su)}
                      title={
                        readOnly
                          ? 'Fournée close : reprenez-la pour modifier ce qui a été réalisé'
                          : excluded
                            ? 'Déjà pris en compte — décocher pour garder cette sous-étape (ex. la cuisson)'
                            : 'Conservée malgré l’étape déjà réalisée'
                      }
                      className={`no-print w-5 h-5 rounded border-outline accent-primary focus:ring-primary shrink-0 mt-1 ${
                        readOnly ? 'opacity-60' : 'cursor-pointer'
                      }`}
                    />
                  ) : (
                    <span className="shrink-0 w-5 print:hidden" />
                  )}
                  {/* Case à cocher sur papier, où il n'y a ni case à cocher
                      interactive ni case déjà réalisée à distinguer — même
                      glyphe que les ingrédients de la liste totale. */}
                  <span className="hidden print:inline-block align-text-bottom w-4 h-4 border-2 border-on-surface shrink-0 mt-1 mr-1.5" />
                  <span className={`flex-1 min-w-0 ${tone}`}>{su.texte}</span>
                  {su.added && !readOnly && (
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
      ) : readOnly ? null : canSubsteps ? (
        <button
          type="button"
          onClick={() => setAddingSubstep(true)}
          className="no-print flex items-center gap-1 text-primary font-label-md text-[12px] hover:underline self-start"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span> Ajouter une sous-étape
        </button>
      ) : substeps.length === 0 ? (
        // Sous-étapes déjà présentes AVANT une rétrogradation restent
        // affichées et cochables ci-dessus (§7.4) : seule l'AJOUT d'une
        // nouvelle en est bridé, jamais visible sur une liste déjà garnie
        // pour ne pas répéter le message à chaque étape d'une longue fournée.
        <p className="no-print font-body-md text-[12px] italic text-on-surface-variant">
          Sous-étapes non incluses dans votre formule —{' '}
          <Link href="/plans" className="text-primary underline">
            voir les formules
          </Link>
          .
        </p>
      ) : null}
    </>
  );

  const lists = (
    <>
      {partialHint}
      {ingredientsBlock}
      {substepsBlock}
    </>
  );

  return (
    <div className="flex flex-col gap-3">
      <LoadingOverlay visible={busy} label="Modification en cours…" />
      <div className="flex flex-col gap-3 border-b border-outline pb-4">
        {/* Case + chevron sur la même ligne que le titre, jamais couplés aux
            badges de date/temps (dayControl/meta) : ces badges peuvent à eux
            seuls remplir la largeur et passer sur une seconde ligne (étape
            avec cuisson + attente + total, ex. étape remplacée), ce qui
            reléguait la case sur une troisième ligne isolée. Ancrés en haut
            (items-start) : un titre sur plusieurs lignes (étape ajoutée ou
            remplacée, avec sa mention verte/rouge en dessous) ne doit pas
            centrer la case sur toute sa hauteur. */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">{title}</div>
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
        <div className="flex items-center flex-wrap gap-3 min-w-0">
          {dayControl}
          {meta}
        </div>
      </div>
      {/* Reste visible même étape repliée (`collapsible`) : contrairement aux
          ingrédients/sous-étapes (qui n'ont plus d'utilité une fois l'étape
          traitée), la note personnelle sert justement à ajuster la recette
          après coup — la replier avec le reste la rendrait invisible sans
          qu'on pense à dérouler le chevron pour aller la chercher. */}
      {noteBlock}
      {open && (
        <div className="flex flex-col gap-6">
          {lists}
          {children}
        </div>
      )}
    </div>
  );
}
