'use client';

// Mode projet v2 — la page verticale (admins seulement, à côté du parcours
// en onglets pour comparer). Le projet s'y lit comme la recette qu'il
// deviendra : les blocs de la recette dans l'ordre de l'éditeur, entre
// lesquels s'intercalent les blocs « Atelier projet » (fond plus clair). Les
// blocs pas encore atteints restent visibles, grisés (`projectV2BlockStates`).
//
// Même doctrine que la v1 : chaque geste écrit en base puis resynchronise
// (`useMutation`), aucun miroir local de la liste des composants. Écarts
// voulus :
// - la v2 n'écrit JAMAIS `recipe_projects.wizard_step` — l'étape du parcours
//   en onglets lui appartient, ouvrir un projet ici ne doit pas l'y déplacer ;
// - la description du dessert se saisit pour tous les formats ;
// - les éléments de recette (photo, catégories, ustensiles…) s'écrivent
//   section par section, jamais par l'enregistrement global de `CreerForm`
//   (cf. RecipeDetailEditors).
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { LockedAction, LockedHint } from '@/components/LockedAction';
import { IngredientTotalList } from '@/components/IngredientTotalList';
import { ComponentResolver } from '@/components/projets/ComponentResolver';
import { ProjectFormatFields, type MoldTypeOption } from '@/components/projets/ProjectFormatFields';
import { ProjectStructureList } from '@/components/projets/ProjectStructureList';
import { DessertVise, QuantitiesStep } from '@/components/projets/ProjectQuantities';
import { ProjectTrials } from '@/components/projets/ProjectTrials';
import { useProjectComponents } from '@/components/projets/useProjectComponents';
import { ProjectV2Block } from '@/components/projets/v2/ProjectV2Block';
import { RecipeToc, stepAnchorId, type TocAction, type TocSections } from '@/components/recipe/RecipeToc';
import {
  ConseilsEditor,
  HeroEditor,
  OrganisationEditor,
  TagsEditor,
  type DifficultyOption,
  type RefOption,
} from '@/components/projets/v2/RecipeDetailEditors';
import {
  COMPONENT_SOURCE_LABELS,
  MAX_COMPONENTS,
  PROJECT_V2_ATELIER,
  buildProjectFormatUpdate,
  deduceProjectFormat,
  projectTargetForme,
  projectV2BlockStates,
  projectValidationBlockers,
  type ComponentSourceKind,
  type ProjectFormat,
  type ProjectV2Block as BlockKey,
} from '@/lib/projects';
import { resequenceProjectSteps, validateProject } from '@/lib/projects-write';
import { INTENT_MAX, type ProposedStructure } from '@/lib/ai/project-structure';
import { dayLabel, mergeIngredientLines, planningDays } from '@/lib/recipe-view';
import { groupWithTotal } from '@/lib/ingredients-recap';
import { ingredientKey } from '@/lib/ingredient-name';
import { ingredientConversionText } from '@/lib/ingredient-conversions';
import { RecipeStep } from '@/components/recipe/RecipeStep';
import type { ProjectComponent, ProjectFull, ProjectTrial } from '@/lib/projects-data';
import type { ConversionRef, IngredientRefOption, UnitRef } from '@/lib/ingredient-conversions';
import type { RecipeFull, RecipeStepView } from '@/lib/recipes';

const btnPrimary =
  'rounded-pill bg-primary px-6 py-3 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-40';
const btnGhost =
  'rounded-pill border border-outline-variant px-5 py-2.5 font-label-md text-[13px] font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-40';
const champ =
  'w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-body-md text-[15px] outline-none focus:border-primary';
const etiquette = 'mb-1 block font-label-md text-label-md text-outline';
const sousTitre = 'mb-3 font-label-md text-[13px] uppercase tracking-widest text-secondary';

// Ordre et libellés des blocs. `apercu` est ce que l'on voit d'un bloc encore
// verrouillé : la recette à venir se lit dès l'ouverture du projet.
// `icone` et `court` servent au sommaire (rail de gauche, `RecipeToc`) : les
// icônes de la recette reprennent celles de la fiche et de l'éditeur, les
// blocs « Atelier projet » partagent le même picto de chantier.
const BLOCS: Record<BlockKey, { titre: string; apercu: string; court: string; icone: string }> = {
  intention: { titre: 'Votre intention', apercu: 'Ce que vous voulez réaliser, en quelques phrases.', court: 'Intention', icone: 'construction' },
  identite: { titre: 'Le dessert', apercu: 'Nom, photo, description et catégories.', court: 'Le dessert', icone: 'edit_note' },
  format: { titre: 'Format et rendement', apercu: 'Moule, dimensions, nombre de parts.', court: 'Format', icone: 'straighten' },
  structure: { titre: 'Structure', apercu: 'Les préparations qui composent le dessert, du bas vers le haut.', court: 'Structure', icone: 'construction' },
  etapes: { titre: 'Étapes', apercu: 'Le déroulé de chaque préparation, avec ses ingrédients et l’ajustement de ses quantités.', court: 'Étapes', icone: 'format_list_numbered' },
  ingredients: { titre: 'Liste complète des ingrédients', apercu: 'Tous les ingrédients du dessert, totalisés.', court: 'Ingrédients', icone: 'egg_alt' },
  organisation: { titre: 'Ustensiles, difficulté et temps', apercu: 'Le matériel, le niveau et le planning.', court: 'Ustensiles et temps', icone: 'blender' },
  conseils: { titre: 'Conseils et source', apercu: 'Astuces, conseils de service, provenance.', court: 'Conseils', icone: 'lightbulb' },
  validation: { titre: 'Essais et validation', apercu: 'Les fournées d’essai, puis le passage en recette.', court: 'Essais et validation', icone: 'construction' },
};
const ORDRE_BLOCS: BlockKey[] = [
  'intention',
  'structure',
  'identite',
  'format',
  'etapes',
  'ingredients',
  'organisation',
  'conseils',
  'validation',
];

export function ProjectV2({
  project,
  recipe,
  moldTypes,
  units,
  unitRefs,
  conversions,
  ingredientRefs,
  trials,
  peutGenererIA,
  quotaProjetIA,
  tags,
  difficulties,
  utensilNames,
  difficultyId,
}: {
  project: ProjectFull;
  // `null` si la recette du projet n'a pas pu être lue : les blocs de recette
  // affichent alors un message plutôt que de planter la page.
  recipe: RecipeFull | null;
  moldTypes: MoldTypeOption[];
  units: string[];
  unitRefs: UnitRef[];
  conversions: ConversionRef[];
  ingredientRefs: IngredientRefOption[];
  trials: ProjectTrial[];
  peutGenererIA: boolean;
  quotaProjetIA: { allowed: boolean; limit?: number; usage?: number } | null;
  tags: RefOption[];
  difficulties: DifficultyOption[];
  utensilNames: string[];
  difficultyId: number | null;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const { mutate, busy, refresh } = useMutation();
  const states = projectV2BlockStates({ ...project, intent: project.intent });
  const v1 = `/projets/${project.id}`;

  const composants = useProjectComponents(project, mutate, dialog);
  const { ordered, resolving, resolvingInit, setResolvingInit, consultBusy, ouvrirComposant, retirerRecette, fermerResolution } =
    composants;

  // ── Format (relu depuis la recette, comme l'étape 2 du parcours) ──────
  const dimsBase = (
    project.mold_dims && typeof project.mold_dims === 'object' && !Array.isArray(project.mold_dims)
      ? (project.mold_dims as Record<string, number>)
      : {}
  ) as Record<string, number>;
  const formeBase = moldTypes.find((m) => m.id === project.mold_type_id)?.forme ?? null;
  const nbBase = parseInt(project.yield_qty || '1', 10) > 0 ? parseInt(project.yield_qty || '1', 10) : 1;
  const [format, setFormat] = useState<ProjectFormat>(
    deduceProjectFormat({ measure_type: project.measure_type, forme: formeBase, dims: dimsBase, count: nbBase }),
  );
  const [dims, setDims] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(dimsBase).map(([k, v]) => [k, String(v)])),
  );
  const [moldTypeId, setMoldTypeId] = useState(project.mold_type_id ? String(project.mold_type_id) : '');
  const [servings, setServings] = useState(project.servings ? String(project.servings) : '');
  const [count, setCount] = useState(project.measure_type === 'mold' ? String(nbBase) : '1');
  // Format visé tel qu'il est ENREGISTRÉ (et non tel qu'affiché) : c'est lui
  // qui sert au calcul des quantités et à la description passée à l'IA.
  const formeCible = projectTargetForme({ measure_type: project.measure_type, forme: formeBase, dims: dimsBase, count: nbBase });
  const formatLabel =
    [moldTypes.find((m) => m.id === project.mold_type_id)?.name, project.yield_desc].filter(Boolean).join(' — ') ||
    (project.servings ? `${project.servings} parts` : 'format libre');

  async function saveFormat() {
    // Le titre passé est celui DÉJÀ enregistré : il se modifie dans « Le
    // dessert », le format ne doit pas l'écraser avec une saisie en cours.
    const built = buildProjectFormatUpdate({ format, title: project.title, servings, count, dims, moldTypeId });
    if ('error' in built) {
      dialog.alert(built.error);
      return;
    }
    await mutate(() => createClient().from('recipes').update(built.payload as never).eq('id', project.id), {
      errorLabel: 'Enregistrement du format',
    });
  }

  // ── Intention, et proposition de l'IA ─────────────────────────────────
  const [intent, setIntent] = useState(project.intent ?? '');
  const [thinking, setThinking] = useState(false);
  const iaEpuise = peutGenererIA && quotaProjetIA != null && !quotaProjetIA.allowed;
  const iaMessage = peutGenererIA
    ? `Quota de générations par IA atteint ce mois-ci (${quotaProjetIA?.usage ?? quotaProjetIA?.limit}/${quotaProjetIA?.limit}). Le crédit se renouvelle à la prochaine période.`
    : 'La proposition de format et de préparations par IA n’est pas incluse dans votre formule.';

  async function saveIntent() {
    await mutate(
      () =>
        createClient()
          .from('recipe_projects')
          .update({ intent: intent.trim().slice(0, INTENT_MAX) || null } as never)
          .eq('recipe_id', project.id),
      { errorLabel: "Enregistrement de l'intention" },
    );
  }

  // Une seule proposition pour le format ET les préparations (même route que
  // le parcours en onglets). Ici tout est visible sur la même page : le
  // format proposé est enregistré d'emblée s'il est complet, et les
  // préparations ne sont écrites que si le projet n'en a encore aucune —
  // jamais par-dessus une structure déjà composée.
  // Déjà une proposition (ou un format saisi) : le bouton devient « Redemander
  // une proposition » et prévient avant d'écraser le format.
  const dejaPropose = !!project.measure_type || project.components.length > 0;
  const libelleIA = dejaPropose ? 'Redemander une proposition (IA)' : 'Proposer format et préparations (IA)';
  async function proposerIA() {
    const texte = intent.trim().slice(0, INTENT_MAX);
    if (!texte) {
      dialog.alert('Décrivez d’abord ce que vous voulez réaliser.');
      return;
    }
    // Les préparations déjà résolues portent du travail : jamais touchées.
    // Celles « À résoudre » viennent d'une proposition précédente et sont
    // remplacées par la nouvelle.
    const resolues = project.components.filter((c) => c.resolved);
    const aRemplacer = project.components.filter((c) => !c.resolved);
    if (dejaPropose) {
      const parts = ['Le format actuel sera remplacé par la nouvelle proposition.'];
      if (aRemplacer.length) parts.push(`${aRemplacer.length} préparation(s) à résoudre seront remplacées.`);
      if (resolues.length) parts.push(`${resolues.length} préparation(s) déjà résolue(s) seront conservées.`);
      if (!(await dialog.confirm(`${parts.join(' ')} Continuer ?`))) return;
    }
    setThinking(true);
    let data: (ProposedStructure & { erreur?: string }) | null = null;
    try {
      const r = await fetch('/api/projet/structure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent: texte }),
      });
      data = r.ok ? ((await r.json()) as ProposedStructure & { erreur?: string }) : null;
    } catch {
      data = null;
    } finally {
      setThinking(false);
    }
    if (data?.erreur) await dialog.alert(data.erreur);
    if (!data || (!data.format && !data.components?.length)) {
      await mutate(
        () => createClient().from('recipe_projects').update({ intent: texte } as never).eq('recipe_id', project.id),
        { errorLabel: "Enregistrement de l'intention" },
      );
      if (!data?.erreur) dialog.alert('Aucune proposition n’a pu être établie. Vous pouvez composer le projet à la main.');
      return;
    }

    // Champs du format pré-remplis avec la proposition, puis enregistrés
    // s'ils suffisent (nombre de parts connu).
    const f = data.format ?? format;
    const d = Object.keys(data.dims || {}).length
      ? Object.fromEntries(Object.entries(data.dims).map(([k, v]) => [k, String(v)]))
      : dims;
    const s = data.servings ? String(data.servings) : servings;
    const n = data.count ? String(data.count) : count;
    const moule = f !== format ? '' : moldTypeId;
    setFormat(f);
    setDims(d);
    setServings(s);
    setCount(n);
    setMoldTypeId(moule);
    const titre = project.title === 'Nouveau projet' && data.title ? data.title : project.title;
    const built = buildProjectFormatUpdate({ format: f, title: titre, servings: s, count: n, dims: d, moldTypeId: moule });
    const proposees = (data.components ?? []).slice(0, Math.max(0, MAX_COMPONENTS - resolues.length));

    await mutate(
      async () => {
        const supabase = createClient();
        const { error } = await supabase.from('recipe_projects').update({ intent: texte } as never).eq('recipe_id', project.id);
        if (error) return { error };
        if ('payload' in built) {
          const { error: fErr } = await supabase.from('recipes').update(built.payload as never).eq('id', project.id);
          if (fErr) return { error: fErr };
        }
        if (!proposees.length) return { error: null };
        if (aRemplacer.length) {
          // Sans contenu (non résolues) : un simple delete suffit. Les blocs
          // d'étapes des composants gardés sont ensuite redistribués, sinon un
          // nouveau composant pourrait retomber sur le bloc d'un ancien.
          const { error: dErr } = await supabase
            .from('recipe_project_components')
            .delete()
            .in('id', aRemplacer.map((c) => c.id));
          if (dErr) return { error: dErr };
          try {
            await resequenceProjectSteps(supabase, project.id, resolues.map((c) => c.id));
          } catch (e) {
            return { error: { message: (e as Error).message } };
          }
        }
        const dernier = resolues.reduce((m, c) => Math.max(m, c.position), 0);
        return supabase.from('recipe_project_components').insert(
          proposees.map((c, i) => ({
            recipe_id: project.id,
            position: dernier + i + 1,
            name: c.name,
            role: c.role || null,
            source_kind: 'manual',
            resolved: false,
          })) as never,
        );
      },
      { errorLabel: 'Enregistrement de la proposition' },
    );
    if ('error' in built) dialog.alert(`Proposition reportée dans le format : ${built.error}`);
  }

  // ── Le dessert : titre + description ──────────────────────────────────
  const [title, setTitle] = useState(project.title === 'Nouveau projet' ? '' : project.title);
  const [description, setDescription] = useState(project.description ?? '');
  async function saveIdentite() {
    await mutate(
      () =>
        createClient()
          .from('recipes')
          .update({ title: title.trim().slice(0, 120) || 'Nouveau projet', description: description.trim() || null } as never)
          .eq('id', project.id),
      { errorLabel: 'Enregistrement du dessert' },
    );
  }

  // ── Validation (§8) ───────────────────────────────────────────────────
  const blockers = projectValidationBlockers({ measure_type: project.measure_type, components: project.components });
  async function valider() {
    if (blockers.length) {
      dialog.alert(`Le projet ne peut pas encore être validé :\n\n${blockers.join('\n')}`);
      return;
    }
    const ok = await mutate(
      async () => {
        try {
          await validateProject(
            createClient(),
            project.id,
            ordered.map((c) => ({ name: c.name, role: c.role })),
          );
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        return { error: null };
      },
      {
        confirm:
          'Valider le projet ? Il devient une recette de votre carnet (non publiée), sans perdre ses fournées d’essai. Vous pourrez le repasser en brouillon tant qu’il n’est pas publié.',
        errorLabel: 'Validation du projet',
        refresh: false,
      },
    );
    if (ok) router.push(`/recette/${project.id}`);
  }

  // ── Lectures pour les blocs de recette ────────────────────────────────
  const steps = [...(recipe?.recipe_steps ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  // Appariement étape ↔ groupe d'ingrédients par `order_index`, comme partout
  // ailleurs dans le mode projet (cf. lib/projects-write.ts).
  const groupByOrder = new Map((recipe?.ingredient_groups ?? []).map((g) => [g.order_index ?? -1, g]));
  // `component_id` est lu par `recipe_steps(*)` mais absent de `RecipeStepView`.
  const componentOf = (s: RecipeStepView) => (s as RecipeStepView & { component_id?: number | null }).component_id ?? null;
  const assemblage = steps.filter((s) => componentOf(s) == null);
  const ingredientGroups = recipe
    ? groupWithTotal(
        mergeIngredientLines(recipe, conversions, unitRefs),
        (m) => ({ name: m.name, qty: m.qty, unit: m.unit, refId: m.ref_id }),
        conversions,
        unitRefs,
      )
    : [];
  const days = planningDays(steps);

  function boutonRecette(c: ProjectComponent) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void ouvrirComposant(c, c.resolved)} className={btnGhost}>
          {c.resolved ? 'Modifier cette préparation' : 'Choisir une recette'}
        </button>
        {c.resolved && (
          <button type="button" onClick={() => void retirerRecette(c)} className={btnGhost}>
            Retirer la recette
          </button>
        )}
      </span>
    );
  }

  // Même présentation que la fiche recette (`RecipeStep`, partagé). `dernier`
  // : pas de filet sous la dernière étape d'un groupe.
  function etape(s: RecipeStepView, i: number, dernier: boolean) {
    return (
      <RecipeStep
        key={s.id}
        step={s}
        index={i}
        anchorId={stepAnchorId(i)}
        ingredients={groupByOrder.get(s.order_index ?? -1)?.ingredients ?? []}
        qty={(it) => {
          const conv = ingredientConversionText(conversions, unitRefs, it.ref_id, it.unit, it.quantity);
          return (
            <>
              <span className="whitespace-nowrap">{[it.quantity, it.unit].filter(Boolean).join(' ')}</span>
              {conv && <span className="font-body-md text-[12px] text-on-surface-variant"> ({conv})</span>}
            </>
          );
        }}
        last={dernier}
      />
    );
  }

  const bloc = (key: BlockKey, children: ReactNode) => (
    <ProjectV2Block
      key={key}
      id={`bloc-${key}`}
      atelier={PROJECT_V2_ATELIER.has(key)}
      titre={BLOCS[key].titre}
      apercu={BLOCS[key].apercu}
      state={states[key]}
    >
      {children}
    </ProjectV2Block>
  );

  // ── Sommaire (rail de gauche, comme sur la fiche recette) ─────────────
  // Tous les blocs y figurent, verrouillés compris : ils sont visibles dans la
  // page. Les étapes s'intercalent après « Étapes » (entrées de niveau 2),
  // seulement quand le bloc est ouvert — sinon leurs ancres n'existent pas.
  const avantEtapes = ORDRE_BLOCS.indexOf('etapes') + 1;
  const entree = (k: BlockKey) => ({ id: `bloc-${k}`, label: BLOCS[k].court, icon: BLOCS[k].icone, level: 1 as const });
  const tocSections: TocSections = {
    before: ORDRE_BLOCS.slice(0, avantEtapes).map(entree),
    after: ORDRE_BLOCS.slice(avantEtapes).map(entree),
  };
  const tocSteps =
    states.etapes.unlocked && recipe ? steps.map((st, i) => ({ key: String(st.id), title: st.title || `Étape ${i + 1}` })) : [];
  const tocActions: TocAction[] = [
    { id: 'v1', icon: 'arrow_back', label: 'Revenir à la version actuelle', variant: 'outline', onClick: () => router.push(v1) },
    {
      id: 'valider',
      icon: 'task_alt',
      label: blockers.length ? 'Valider le projet (des préparations restent à résoudre)' : 'Valider le projet',
      variant: 'filled',
      onClick: () => void valider(),
      disabled: busy || blockers.length > 0,
    },
  ];

  const sansRecette = <p className="text-sm text-on-surface-variant">La recette du projet n’a pas pu être lue.</p>;

  return (
    <>
      <LoadingOverlay
        visible={busy || thinking || consultBusy}
        label={thinking ? 'Composition du projet…' : undefined}
      />

      <RecipeToc sections={tocSections} steps={tocSteps} actions={tocActions} mobile="drawer" mobileInset="nav" />

      <header className="mb-8">
        <p className="font-label-md text-label-md uppercase tracking-widest text-secondary">
          Mode projet · nouvelle version (essai)
        </p>
        <h1 className="mb-3 font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[34px]">
          {project.title === 'Nouveau projet' ? 'Nouveau projet' : project.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href={v1} className="text-sm text-secondary underline underline-offset-2 hover:text-primary">
            Revenir à la version actuelle
          </Link>
          <span className="flex items-center gap-2 text-[12px] text-on-surface-variant">
            <span className="inline-block h-3 w-3 rounded border border-outline-variant bg-surface-container-low" />
            Recette
            <span className="ml-3 inline-block h-3 w-3 rounded border border-dashed border-secondary/40 bg-surface-container-lowest" />
            Atelier projet
          </span>
        </div>
      </header>

      <div className="space-y-6">
        {bloc(
          'intention',
          <div className="space-y-3">
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value.slice(0, INTENT_MAX))}
              rows={4}
              placeholder="Une tarte au praliné pour huit, avec un croustillant et une crème légère…"
              className={champ}
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={saveIntent}
                disabled={busy || intent.trim() === (project.intent ?? '').trim()}
                className={btnGhost}
              >
                Enregistrer
              </button>
              {!peutGenererIA ? (
                <LockedAction label={libelleIA} message={iaMessage} className={btnGhost}>
                  {libelleIA}
                </LockedAction>
              ) : (
                <LockedHint message={iaMessage} active={iaEpuise}>
                  <button type="button" onClick={() => void proposerIA()} disabled={busy || iaEpuise} className={dejaPropose ? btnGhost : btnPrimary}>
                    {libelleIA}
                  </button>
                </LockedHint>
              )}
            </div>
            {project.components.length > 0 && (
              <p className="text-[12px] text-on-surface-variant">
                Une nouvelle proposition remplace le format et les préparations « À résoudre » ; celles qui ont déjà
                leur recette sont conservées.
              </p>
            )}
          </div>,
        )}

        {bloc(
          'structure',
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              Du bas vers le haut de l’assemblage. Le rôle et l’ajustement (volume ou surface) décident du calcul des
              quantités.
            </p>
            <ProjectStructureList
              components={composants}
              extra={(c) => (
                <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-outline-variant/40 pt-2">
                  <span className={`min-w-0 flex-1 text-[12.5px] ${c.resolved ? 'text-green-700' : 'text-secondary'}`}>
                    {c.resolved
                      ? [
                          COMPONENT_SOURCE_LABELS[c.source_kind as ComponentSourceKind] ?? c.source_kind,
                          c.source_title,
                          c.source_author_name,
                          c.stepCount ? `${c.stepCount} étape${c.stepCount > 1 ? 's' : ''}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')
                      : 'À résoudre'}
                  </span>
                  {boutonRecette(c)}
                </div>
              )}
            />
          </div>,
        )}

        {bloc(
          'identite',
          <div className="space-y-6">
            {recipe && <HeroEditor recipe={recipe} mutate={mutate} busy={busy} />}
            <div className="space-y-4">
              <div>
                <label className={etiquette}>NOM DU DESSERT</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                  placeholder="Tarte aux fruits rouges"
                  className={champ}
                />
              </div>
              <div>
                <label className={etiquette}>DESCRIPTION</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                  rows={3}
                  placeholder="Ce qui rend ce dessert unique, l’occasion, le goût recherché…"
                  className={champ}
                />
              </div>
              {((title.trim() || 'Nouveau projet') !== project.title ||
                description.trim() !== (project.description ?? '').trim()) && (
                <button type="button" onClick={saveIdentite} disabled={busy} className={btnPrimary}>
                  Enregistrer le nom et la description
                </button>
              )}
            </div>
            {recipe && (
              <TagsEditor recipe={recipe} tags={tags} mutate={mutate} busy={busy} />
            )}
          </div>,
        )}

        {bloc(
          'format',
          <div className="space-y-6">
            <ProjectFormatFields
              moldTypes={moldTypes}
              format={format}
              setFormat={setFormat}
              dims={dims}
              setDims={setDims}
              count={count}
              setCount={setCount}
              moldTypeId={moldTypeId}
              setMoldTypeId={setMoldTypeId}
              servings={servings}
              setServings={setServings}
              disabled={busy}
            />
            <button type="button" onClick={saveFormat} disabled={busy} className={btnPrimary}>
              Enregistrer le format
            </button>
          </div>,
        )}

        {bloc(
          'etapes',
          recipe ? (
            <div className="space-y-8">
              <DessertVise project={project} formatLabel={formatLabel} />
              {ordered.map((c, ci) => {
                const own = steps.filter((s) => componentOf(s) === c.id);
                return (
                  // Filet épais entre deux préparations, plus marqué que celui
                  // qui sépare deux étapes : la hiérarchie préparation → étape
                  // se lit d'un coup d'œil.
                  <div key={c.id} className={ci > 0 ? 'mt-4 border-t-2 border-primary pt-10' : ''}>
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="font-headline-md text-headline-md text-primary">{c.name}</h3>
                      {boutonRecette(c)}
                    </div>
                    {/* Ustensiles recopiés de la recette source : portés par la
                        préparation (la source ne les rattache à aucune étape). */}
                    {c.utensils.length > 0 && (
                      <p className="-mt-3 mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-on-surface-variant">
                        <span className="material-symbols-outlined text-[18px] text-primary">blender</span>
                        <span className="font-label-md text-[11px] uppercase tracking-widest text-outline">Ustensiles</span>
                        {c.utensils.map((u) => u.name + (u.comment ? ` (${u.comment})` : '')).join(' · ')}
                      </p>
                    )}
                    {/* Ajustement des quantités de CETTE préparation (un seul
                        coefficient par préparation, comme en base), replié
                        par défaut : les étapes dessous montrent déjà les
                        quantités ajustées. */}
                    {c.resolved && (
                      <details className="group mb-6 rounded-xl border border-dashed border-secondary/40 bg-surface-container-lowest">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                          <span className="font-label-md text-[12px] uppercase tracking-widest text-secondary">
                            Ajustement des quantités · ×{String(Math.round((c.scaleFactor ?? 1) * 100) / 100).replace('.', ',')}
                          </span>
                          <span className="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
                        </summary>
                        <div className="border-t border-outline-variant/40 px-4 py-4">
                          <QuantitiesStep project={project} targetForme={formeCible} formatLabel={formatLabel} componentId={c.id} />
                        </div>
                      </details>
                    )}
                    {own.length ? (
                      <div className="space-y-10">{own.map((s, k) => etape(s, steps.indexOf(s), k === own.length - 1))}</div>
                    ) : (
                      <p className="text-sm italic text-on-surface-variant">Pas encore de recette pour cette préparation.</p>
                    )}
                  </div>
                );
              })}
              {assemblage.length > 0 && (
                <div className="mt-4 border-t-2 border-primary pt-10">
                  <h3 className="mb-6 font-headline-md text-headline-md text-primary">Assemblage</h3>
                  <div className="space-y-10">{assemblage.map((s, k) => etape(s, steps.indexOf(s), k === assemblage.length - 1))}</div>
                </div>
              )}
            </div>
          ) : (
            sansRecette
          ),
        )}

        {bloc(
          'ingredients',
          recipe ? (
            ingredientGroups.length ? (
              <IngredientTotalList
                groups={ingredientGroups.map((g) => ({
                  key: ingredientKey(g.name),
                  name: g.name,
                  allergen:
                    Array.from(new Set(g.lines.flatMap((m) => (m.allergen ? m.allergen.split(',').map((a) => a.trim()) : []))))
                      .filter(Boolean)
                      .join(', ') || null,
                  total: g.subtotal ? [g.subtotal.qty, g.subtotal.unit].filter(Boolean).join(' ') : null,
                  lines: g.lines.map((m, k) => ({
                    key: `${k}-${m.comment || ''}`,
                    qty: [m.qty, m.unit].filter(Boolean).join(' '),
                    comment: m.comment,
                  })),
                }))}
              />
            ) : (
              <p className="text-sm text-on-surface-variant">Aucun ingrédient pour l’instant.</p>
            )
          ) : (
            sansRecette
          ),
        )}

        {bloc(
          'organisation',
          recipe ? (
            <div className="space-y-6">
              <OrganisationEditor
                // Remonté quand la liste en base change (ustensiles ajoutés par
                // la copie d'une préparation) : son état local, initialisé une
                // fois, ne les montrerait pas et les effacerait à l'enregistrement.
                key={recipe.recipe_utensils.map((u) => u.id).join(',')}
                recipe={recipe}
                difficultyId={difficultyId}
                difficulties={difficulties}
                utensilNames={utensilNames}
                mutate={mutate}
                busy={busy}
              />
              {days.length > 1 && (
                <div className="text-sm">
                  <h3 className={sousTitre}>Planning</h3>
                  <ul className="space-y-1">
                    {days.map((d) => (
                      <li key={d.offset}>
                        <span className="font-label-md text-primary">{dayLabel(d.offset)}</span> —{' '}
                        {d.items.map((it) => it.title || 'Sans titre').join(', ')}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[12px] text-on-surface-variant">
                    Le jour de chaque étape se règle dans « Modifier cette préparation ».
                  </p>
                </div>
              )}
            </div>
          ) : (
            sansRecette
          ),
        )}

        {bloc('conseils', recipe ? <ConseilsEditor recipe={recipe} mutate={mutate} busy={busy} /> : sansRecette)}

        {bloc(
          'validation',
          <div className="space-y-5 text-sm">
            {blockers.length ? (
              <ul className="list-disc space-y-1 pl-5 text-secondary">
                {blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="text-green-700">Le projet peut être validé.</p>
            )}
            {recipe && (
              <ProjectTrials recipe={recipe} trials={trials} unresolved={ordered.filter((c) => !c.resolved).map((c) => c.name)} />
            )}
            <div className="border-t border-outline-variant pt-5">
              <button type="button" onClick={() => void valider()} disabled={busy || blockers.length > 0} className={btnPrimary}>
                Valider le projet
              </button>
              <p className="mt-3 text-[12px] text-on-surface-variant">
                La validation ne copie ni ne migre rien : le projet devient une recette ordinaire du carnet, sans perdre
                ses fournées d’essai.
              </p>
            </div>
          </div>,
        )}
      </div>

      {resolving && (
        <ComponentResolver
          projectId={project.id}
          projectTitle={project.title}
          servings={project.servings}
          formatLabel={formatLabel}
          component={resolving}
          componentIndex={ordered.findIndex((c) => c.id === resolving.id)}
          componentIds={ordered.map((c) => c.id)}
          units={units}
          ingredientRefs={ingredientRefs}
          peutGenererIA={peutGenererIA}
          quotaProjetIA={quotaProjetIA}
          initialMode={resolvingInit?.mode}
          initialDraft={resolvingInit?.draft}
          initialDraftKind={resolvingInit?.kind}
          initialSource={resolvingInit?.source}
          onClose={fermerResolution}
          // La modale n'emporte pas sa propre resynchronisation : elle écrit,
          // ce parent-ci rafraîchit (il reste monté), puis elle se ferme.
          onDone={() => {
            refresh();
            fermerResolution();
          }}
          onReset={() => {
            refresh();
            setResolvingInit(null);
          }}
        />
      )}
    </>
  );
}
