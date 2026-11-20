'use client';

// Mode projet — la page verticale de `/projets/[id]` (l'ancien parcours en
// onglets a été retiré). Le projet s'y lit comme la recette qu'il
// deviendra : les blocs de la recette dans l'ordre de l'éditeur, entre
// lesquels s'intercalent les blocs « Atelier projet » (fond plus clair). Les
// blocs pas encore atteints restent visibles, grisés (`projectV2BlockStates`).
//
// Chaque geste écrit en base puis resynchronise (`useMutation`), aucun miroir
// local de la liste des composants. À connaître :
// - `recipe_projects.wizard_step` n'est plus écrit (colonne de l'ancien
//   parcours en onglets, désormais inutilisée) ;
// - la description du dessert se saisit pour tous les formats ;
// - les éléments de recette (photo, catégories, ustensiles…) s'écrivent
//   section par section, jamais par l'enregistrement global de `CreerForm`
//   (cf. RecipeDetailEditors).
import { useSeuilsArrondi } from '@/components/SeuilsArrondiProvider';
import { NomIngredient } from '@/components/IngredientNomsProvider';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useImpersonation } from '@/components/ImpersonationProvider';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ZoneRedaction, FenetreCompletion, RedactionIAProvider, libelleCompletion } from '@/components/redaction/RedactionIA';
import {
  ajouterNoteAvance,
  ajouterTexte,
  champsVides,
  coutCompletion,
  ligneIngredient,
  texteTemps,
  type EtatRedaction,
  type PropositionRedaction,
  type RecetteRedaction,
} from '@/lib/redaction-ia';
import { SCALING_OPTIONS } from '@/components/projets/StepEditorCard';
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
import { useRegisterSection, useSectionRegistry, type OptionsSauvegarde } from '@/components/projets/v2/sections';
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
  ROLE_ASSEMBLAGE,
  buildProjectFormatUpdate,
  deduceProjectFormat,
  PROJECT_FORMATS,
  projectFormatKey,
  projectTargetForme,
  quantitiesStale,
  projectV2BlockStates,
  projectValidationBlockers,
  type ComponentSourceKind,
  type ProjectFormat,
  type ProjectV2Block as BlockKey,
  empreinteEtapes,
  empreinteQuantites,
  pointsRestants,
  projectTodo,
  type TodoItem,
  scaledQuantityText,
} from '@/lib/projects';
import { resequenceProjectSteps, scaleAllLines, validateProject } from '@/lib/projects-write';
import { INTENT_MAX, type ProposedStructure } from '@/lib/ai/project-structure';
import { PlanningTimeline } from '@/components/recipe/PlanningTimeline';
import { HelpBlockSlot } from '@/components/help/HelpBlockSlot';
import { useHelpBlocks } from '@/components/help/useHelpBlocks';
import type { VisibleHelpBlock } from '@/lib/help';
import { ProjectTodo, allerA } from '@/components/projets/v2/ProjectTodo';
import { VerifCase } from '@/components/projets/v2/VerifCase';
import { PointsAVerifier } from '@/components/projets/v2/PointsAVerifier';
import { PhotosEtapeProjet } from '@/components/projets/v2/PhotosEtapeProjet';
import { useTotalEtape } from '@/lib/use-total-etape';
import { formatMasse, totalEtape } from '@/lib/total-etape';
import { mergeIngredientLines, planningDays } from '@/lib/recipe-view';
import { groupWithTotal } from '@/lib/ingredients-recap';
import { ingredientKey } from '@/lib/ingredient-name';
import { estimateWeightGrams, ingredientConversionText } from '@/lib/ingredient-conversions';
import { RecipeStep } from '@/components/recipe/RecipeStep';
import { LeconsProvider, NombreRetours, PorteeEdition, RetoursAuteur, RetoursEtape, RetoursIngredient, RetoursSousEtape, type AjustementEcart } from '@/components/batch/DerniereFois';
import { libelleEcartProduit } from '@/lib/batch-lecons';
import type { DonneesRemarques } from '@/lib/batch-lecons-data';
import type { Remarque } from '@/lib/batch-lecons';
import type { ProjectComponent, ProjectFull, ProjectTrial } from '@/lib/projects-data';
import type { ConversionRef, IngredientRefOption, UnitRef } from '@/lib/ingredient-conversions';
import type { RecipeFull, RecipeStepView } from '@/lib/recipes';
import { autoGrow, useAutoGrowOnResize } from '@/lib/auto-grow';
import { COUT_PROJET_STRUCTURE, creditsRestants, libelleCredits } from '@/lib/credits-ia';

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
// `icon` et `court` servent au sommaire (rail de gauche, `RecipeToc`) : les
// icônes de la recette reprennent celles de la fiche et de l'éditeur ; le champ
// se nomme `icon` pour que `scripts/material-symbols.mjs` l'ajoute à la police.
// Structure garde le picto de chantier des blocs « Atelier projet ».
const BLOCS: Record<BlockKey, { titre: string; apercu: string; court: string; icon: string }> = {
  intention: { titre: 'Votre intention', apercu: 'Ce que vous voulez réaliser, en quelques phrases.', court: 'Intention', icon: 'target' },
  identite: { titre: 'Le dessert', apercu: 'Nom, photo, description et catégories.', court: 'Le dessert', icon: 'edit_note' },
  format: { titre: 'Format et rendement', apercu: 'Moule, dimensions, nombre de parts (estimé d’après le moule si vous le laissez vide).', court: 'Format', icon: 'straighten' },
  structure: { titre: 'Structure', apercu: 'Les préparations qui composent le dessert, du bas vers le haut.', court: 'Structure', icon: 'construction' },
  etapes: { titre: 'Étapes', apercu: 'Le déroulé de chaque préparation, avec ses ingrédients et l’ajustement de ses quantités.', court: 'Étapes', icon: 'format_list_numbered' },
  ingredients: { titre: 'Liste complète des ingrédients', apercu: 'Tous les ingrédients du dessert, totalisés.', court: 'Ingrédients', icon: 'egg_alt' },
  organisation: { titre: 'Ustensiles, difficulté et temps', apercu: 'Le matériel, le niveau et le planning.', court: 'Ustensiles et temps', icon: 'blender' },
  conseils: { titre: 'Conseils et source', apercu: 'Astuces, conseils de service, provenance.', court: 'Conseils', icon: 'lightbulb' },
  validation: { titre: 'Essais et validation', apercu: 'Les fournées d’essai, puis le passage en recette.', court: 'Essais et validation', icon: 'science' },
};
// Format juste après l'intention (JEP-403) : les quantités de chaque
// préparation en dépendent, on le pose avant de composer la structure.
const ORDRE_BLOCS: BlockKey[] = [
  'intention',
  'format',
  'structure',
  'identite',
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
  ingredientDensities = [],
  ingredientRefs,
  referenceAllergenes,
  trials,
  remarques = null,
  remarquesEssais,
  userId,
  peutGenererIA,
  quotaProjetIA,
  quotaAjustementIA = null,
  tags,
  difficulties,
  utensilNames,
  difficultyId,
  peutCreerTag = false,
  helpBlocks = [],
  redactionIA = null,
}: {
  project: ProjectFull;
  // `null` si la recette du projet n'a pas pu être lue : les blocs de recette
  // affichent alors un message plutôt que de planter la page.
  recipe: RecipeFull | null;
  moldTypes: MoldTypeOption[];
  units: string[];
  unitRefs: UnitRef[];
  conversions: ConversionRef[];
  // Masse volumique par nom d'ingrédient (repli de `estimateWeightGrams`).
  ingredientDensities?: { name: string; density_g_per_ml: number }[];
  ingredientRefs: IngredientRefOption[];
  referenceAllergenes?: { names: string[]; byIngredient: Record<string, string> };
  trials: ProjectTrial[];
  // Retours de mes fournées d'essai (JEP-381), lus par la page ; `null` = aucun.
  remarques?: DonneesRemarques | null;
  userId: string;
  remarquesEssais?: Record<number, Remarque[]>;
  peutGenererIA: boolean;
  quotaProjetIA: { allowed: boolean; limit?: number; usage?: number } | null;
  // Quota `ajustement_ia_mensuel`, affichage seulement (« Ajuster avec l'IA »).
  quotaAjustementIA?: { allowed: boolean; limit?: number; usage?: number } | null;
  tags: RefOption[];
  difficulties: DifficultyOption[];
  utensilNames: string[];
  difficultyId: number | null;
  // Création d'un tag à la volée : réservée aux admins, comme dans /creer.
  peutCreerTag?: boolean;
  // Blocs d'aide de la page `projet` (JEP-373). Jamais passés en lecture seule :
  // `ProjectReadOnly` ne monte pas ce composant.
  helpBlocks?: VisibleHelpBlock[];
  // Rédaction des textes par IA (JEP-414) : droit et solde, lus par la page.
  redactionIA?: EtatRedaction | null;
}) {
  useAutoGrowOnResize();
  const router = useRouter();
  const help = useHelpBlocks(helpBlocks);
  const dialog = useDialog();
  // Seuils d'arrondi à l'unité des quantités calculées (JEP-389).
  const seuils = useSeuilsArrondi();
  const { mutate, busy, refresh, refreshSilencieux } = useMutation();
  const impersonation = useImpersonation();
  // Case « Afficher le total des ingrédients » des étapes (JEP-403) : même
  // réglage, mémorisé dans le navigateur, que dans le mode Préparer d'une fournée.
  const [totalVoulu, setTotalVoulu] = useTotalEtape();
  // Sections modifiées et non enregistrées (cf. sections.ts) : alimente les
  // boutons « Enregistrer le brouillon » / « Quitter » / « Valider » du rail.
  // Enregistrement AUTOMATIQUE (JEP-403) : plus de bouton par section. Après des
  // écritures silencieuses, le rendu serveur (« Reste à faire », résumés…) est
  // resynchronisé dès qu'aucun champ de saisie n'a le focus — une
  // resynchronisation en pleine frappe remonterait certains éditeurs.
  // Conditions : aucun champ de saisie n'a le focus ET aucune section n'attend
  // d'être écrite — la resynchronisation remonte certains éditeurs (clés liées
  // aux données), elle ne doit jamais effacer une saisie pas encore enregistrée.
  const resynchroEnAttente = useRef(false);
  const modificationsEnAttente = useRef<() => boolean>(() => false);
  const peutResynchroniser = useCallback(() => {
    const a = document.activeElement as HTMLElement | null;
    const champActif = !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
    return !champActif && !modificationsEnAttente.current();
  }, []);
  const resynchroQuandLibre = useCallback(() => {
    if (peutResynchroniser()) {
      resynchroEnAttente.current = false;
      refreshSilencieux();
    } else {
      // Rejouée au prochain départ du focus, ou après le prochain enregistrement.
      resynchroEnAttente.current = true;
    }
  }, [peutResynchroniser, refreshSilencieux]);
  useEffect(() => {
    const surPerteDeFocus = () => {
      // Le focus passe d'un champ à l'autre : on laisse le temps à l'autre de le prendre.
      window.setTimeout(() => {
        if (resynchroEnAttente.current && peutResynchroniser()) {
          resynchroEnAttente.current = false;
          refreshSilencieux();
        }
      }, 300);
    };
    document.addEventListener('focusout', surPerteDeFocus);
    return () => document.removeEventListener('focusout', surPerteDeFocus);
  }, [peutResynchroniser, refreshSilencieux]);
  const { registry: sectionRegistry, dirtyLabels, saveAll, etatAuto, aDesModifications } = useSectionRegistry({
    auto: impersonation?.mode !== 'read_only',
    apresEnregistrement: resynchroQuandLibre,
  });
  modificationsEnAttente.current = aDesModifications;
  const anyDirty = dirtyLabels.length > 0;
  const [leaving, setLeaving] = useState(false);
  // Coefficient proposé par la quantité obtenue d'une fournée d'essai, par
  // préparation : prérempli dans son volet « Ajustement des quantités ».
  const states = projectV2BlockStates({ ...project, intent: project.intent });

  const composants = useProjectComponents(project, mutate, dialog);
  const { ordered, resolving, resolvingInit, setResolvingInit, consultBusy, ouvrirComposant, changerRecette, retirerRecette, fermerResolution } =
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
  // Empreinte du format saisi, comparée à celle du dernier enregistrement : le
  // format affiché est DÉDUIT de la base (`deduceProjectFormat`) et pourrait
  // différer de la saisie après relecture — une comparaison avec les props
  // signalerait alors une modification fantôme. L'empreinte de référence est
  // donc posée à l'ouverture, puis à chaque enregistrement réussi.
  const empreinteFormat = (f: { format: ProjectFormat; dims: Record<string, string>; moldTypeId: string; servings: string; count: string }) =>
    JSON.stringify({
      format: f.format,
      dims: Object.entries(f.dims)
        .filter(([, v]) => String(v).trim() !== '')
        .sort(([a], [b]) => a.localeCompare(b)),
      moldTypeId: f.moldTypeId,
      servings: f.servings.trim(),
      count: f.count.trim(),
    });
  const [formatEnregistre, setFormatEnregistre] = useState(() => empreinteFormat({ format, dims, moldTypeId, servings, count }));
  // Format visé tel qu'il est ENREGISTRÉ (et non tel qu'affiché) : c'est lui
  // qui sert au calcul des quantités et à la description passée à l'IA.
  const formeCible = projectTargetForme({ measure_type: project.measure_type, forme: formeBase, dims: dimsBase, count: nbBase });
  // Préparations dont les quantités ont été calculées pour un autre format que
  // le format enregistré aujourd'hui : rien ne les recalcule d'office (un
  // recalcul automatique écraserait les ajustements voulus), on le signale.
  const cleFormat = projectFormatKey(project);
  const perimees = ordered.filter((c) => quantitiesStale(c, cleFormat));
  // Après un changement de format enregistré : dit lesquelles sont touchées.
  // Sans empreinte connue (ajustement antérieur à la colonne), tout coefficient
  // différent de ×1 est compté — mieux vaut prévenir une fois de trop ici.
  async function signalerQuantites(payload: Record<string, unknown>) {
    const nouvelle = projectFormatKey({ ...project, ...payload });
    if (nouvelle === cleFormat) return;
    const touchees = ordered.filter(
      (c) =>
        c.resolved &&
        c.stepCount > 0 &&
        (c.scaleFormatKey ? c.scaleFormatKey !== nouvelle : c.scaleFactor != null && c.scaleFactor !== 1),
    );
    if (!touchees.length) return;
    await dialog.alert(
      `Le format a changé. Les quantités de ${touchees.length} préparation(s) (${touchees.map((c) => c.name).join(', ')}) avaient été calculées pour l’ancien format : elles n’ont pas été recalculées. Faites-le dans le bloc « Étapes », volet « Ajustement des quantités » de chaque préparation (« Proposer », puis « Appliquer »).`,
    );
  }
  const formatLabel =
    [moldTypes.find((m) => m.id === project.mold_type_id)?.name, project.yield_desc].filter(Boolean).join(' — ') ||
    (project.servings ? `${project.servings} parts` : 'format libre');

  // Phrase de rappel du format ENREGISTRÉ (jamais la saisie en cours).
  const formatBase = deduceProjectFormat({ measure_type: project.measure_type, forme: formeBase, dims: dimsBase, count: nbBase });
  const resumeFormat =
    project.measure_type && project.servings
      ? [
          PROJECT_FORMATS[formatBase].label,
          formatBase === 'free' ? null : formatLabel,
          `${project.servings} part${project.servings > 1 ? 's' : ''}`,
        ]
          .filter(Boolean)
          .join(' · ')
      : '';

  async function saveFormat(options?: OptionsSauvegarde): Promise<boolean> {
    // Le titre passé est celui DÉJÀ enregistré : il se modifie dans « Le
    // dessert », le format ne doit pas l'écraser avec une saisie en cours.
    const built = buildProjectFormatUpdate({ format, title: project.title, servings, count, dims, moldTypeId });
    if ('error' in built) {
      // Enregistrement automatique : un format encore incomplet n'est pas une
      // erreur, on attend simplement la suite de la saisie (la section reste
      // « en attente »). Au geste explicite, le message s'affiche.
      if (options?.silencieux) return true;
      dialog.alert(built.error);
      return false;
    }
    const sigAppel = empreinteFormat({ format, dims, moldTypeId, servings, count });
    const ok = await mutate(() => createClient().from('recipes').update(built.payload as never).eq('id', project.id), {
      errorLabel: 'Enregistrement du format',
      silent: options?.silencieux,
    });
    if (ok) {
      setFormatEnregistre(sigAppel);
      // Au geste explicite seulement : en enregistrement automatique, les
      // préparations à recalculer apparaissent dans « Reste à faire ».
      if (!options?.silencieux) await signalerQuantites(built.payload);
    }
    return ok;
  }

  // ── Intention, et proposition de l'IA ─────────────────────────────────
  const [intent, setIntent] = useState(project.intent ?? '');
  const [thinking, setThinking] = useState(false);
  // Crédits IA (JEP-405) : une proposition de structure coûte 1 crédit.
  const soldeProjet = creditsRestants({ limite: quotaProjetIA?.limit ?? null, utilises: quotaProjetIA?.usage ?? null });
  const iaEpuise =
    peutGenererIA &&
    quotaProjetIA != null &&
    (!quotaProjetIA.allowed || (soldeProjet != null && soldeProjet < COUT_PROJET_STRUCTURE));
  const iaMessage = peutGenererIA
    ? `Crédits IA épuisés ce mois-ci (${quotaProjetIA?.usage ?? quotaProjetIA?.limit}/${quotaProjetIA?.limit}). Ils se renouvellent à la prochaine période.`
    : 'La proposition de format et de préparations par IA n’est pas incluse dans votre formule.';

  // Référence de « modifié » : ce qui est enregistré, tenu localement (cf.
  // `sections.ts` — les props ne sont resynchronisées qu'une fois la saisie finie).
  const [intentEnregistree, setIntentEnregistree] = useState((project.intent ?? '').trim());
  const signatureIntention = intent.trim().slice(0, INTENT_MAX);
  async function saveIntent(options?: OptionsSauvegarde): Promise<boolean> {
    const sigAppel = signatureIntention;
    const ok = await mutate(
      () =>
        createClient()
          .from('recipe_projects')
          .update({ intent: sigAppel || null } as never)
          .eq('recipe_id', project.id),
      { errorLabel: "Enregistrement de l'intention", silent: options?.silencieux },
    );
    if (ok) setIntentEnregistree(sigAppel);
    return ok;
  }

  // Une seule proposition pour le format ET les préparations
  // (`/api/projet/structure`). Tout est visible sur la même page : le
  // format proposé est enregistré d'emblée s'il est complet, et les
  // préparations ne sont écrites que si le projet n'en a encore aucune —
  // jamais par-dessus une structure déjà composée.
  // Déjà une proposition (ou un format saisi) : le bouton devient « Redemander
  // une proposition » et prévient avant d'écraser le format.
  const dejaPropose = !!project.measure_type || project.components.length > 0;
  const libelleIA = `${dejaPropose ? 'Redemander une proposition (IA)' : 'Proposer format et préparations (IA)'} · ${libelleCredits(COUT_PROJET_STRUCTURE)} IA`;
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
      const intentOk = await mutate(
        () => createClient().from('recipe_projects').update({ intent: texte } as never).eq('recipe_id', project.id),
        { errorLabel: "Enregistrement de l'intention" },
      );
      if (intentOk) setIntentEnregistree(texte);
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

    const ecrit = await mutate(
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
    if (ecrit) setIntentEnregistree(texte);
    if (ecrit && 'payload' in built) {
      setFormatEnregistre(empreinteFormat({ format: f, dims: d, moldTypeId: moule, servings: s, count: n }));
      await signalerQuantites(built.payload);
    }
    if ('error' in built) dialog.alert(`Proposition reportée dans le format : ${built.error}`);
  }

  // ── Le dessert : titre + description ──────────────────────────────────
  const [title, setTitle] = useState(project.title === 'Nouveau projet' ? '' : project.title);
  const [description, setDescription] = useState(project.description ?? '');
  const identiteDe = (t: string, d: string) => JSON.stringify([t.trim().slice(0, 120) || 'Nouveau projet', d.trim()]);
  const [identiteEnregistree, setIdentiteEnregistree] = useState(() => identiteDe(project.title === 'Nouveau projet' ? '' : project.title, project.description ?? ''));
  const signatureIdentite = identiteDe(title, description);
  async function saveIdentite(options?: OptionsSauvegarde): Promise<boolean> {
    const sigAppel = signatureIdentite;
    const ok = await mutate(
      () =>
        createClient()
          .from('recipes')
          .update({ title: title.trim().slice(0, 120) || 'Nouveau projet', description: description.trim() || null } as never)
          .eq('id', project.id),
      { errorLabel: 'Enregistrement du dessert', silent: options?.silencieux },
    );
    if (ok) setIdentiteEnregistree(sigAppel);
    return ok;
  }

  // ── Sections déclarées au registre (rail : enregistrer / quitter / valider) ──
  useRegisterSection(sectionRegistry, 'intention', {
    label: 'Intention',
    dirty: signatureIntention !== intentEnregistree,
    signature: signatureIntention,
    save: saveIntent,
  });
  useRegisterSection(sectionRegistry, 'dessert', {
    label: 'Nom et description',
    dirty: signatureIdentite !== identiteEnregistree,
    signature: signatureIdentite,
    save: saveIdentite,
  });
  useRegisterSection(sectionRegistry, 'format', {
    label: 'Format',
    dirty: empreinteFormat({ format, dims, moldTypeId, servings, count }) !== formatEnregistre,
    signature: empreinteFormat({ format, dims, moldTypeId, servings, count }),
    save: saveFormat,
  });

  // Fermeture ou rechargement de l'onglet avec une saisie non écrite. Les clics
  // sur les liens de l'en-tête ne sont pas interceptables en App Router :
  // seul « Quitter » du rail protège la navigation interne.
  useEffect(() => {
    if (!anyDirty) return;
    const avertir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', avertir);
    return () => window.removeEventListener('beforeunload', avertir);
  }, [anyDirty]);

  const versCarnet = '/carnet?scope=proj';
  async function quitter() {
    if (!anyDirty) {
      setLeaving(true);
      router.push(versCarnet);
      return;
    }
    // Enregistrement automatique : on écrit d'abord ce qui attendait encore son
    // échéance. Ce n'est qu'en cas d'échec qu'on demande quoi faire.
    if (await saveAll()) {
      setLeaving(true);
      router.push(versCarnet);
      return;
    }
    const choix = await dialog.choice(
      `Des modifications n’ont pas pu être enregistrées (${dirtyLabels.join(', ')}). Que souhaitez-vous faire ?`,
      [{ label: 'Quitter sans enregistrer', value: 'discard' }],
    );
    if (choix === 'discard') {
      setLeaving(true);
      router.push(versCarnet);
    }
    // choix === null (Annuler / Échap) : on reste sur la page.
  }

  // ── Validation (§8) ───────────────────────────────────────────────────
  const blockers = projectValidationBlockers({ measure_type: project.measure_type, components: project.components });
  async function valider() {
    if (blockers.length) {
      dialog.alert(`Le projet ne peut pas encore être validé :\n\n${blockers.join('\n')}`);
      return;
    }
    if (perimees.length) {
      const go = await dialog.confirm(
        `Les quantités de ${perimees.length} préparation(s) (${perimees.map((c) => c.name).join(', ')}) ont été calculées pour un autre format que le format visé. Valider quand même ?`,
      );
      if (!go) return;
    }
    // Ce qui est saisi mais pas encore écrit est enregistré d'abord : la
    // validation lit la base, pas les champs de la page.
    if (anyDirty && !(await saveAll())) return;
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
  // Table `order_index` du groupe → étape (titre + ancre `sec-etape-N`, posée par
  // `RecipeStep` à l'index dans `steps`), pour les renvois de la liste totale.
  const etapeParOrdre = new Map<number, { titre: string; ancre: string }>();
  steps.forEach((s, i) => {
    etapeParOrdre.set(s.order_index ?? 0, { titre: s.title || `Étape ${i + 1}`, ancre: stepAnchorId(i) });
  });
  const days = planningDays(steps);

  // Retour sur l'étape modifiée (JEP-403). « Modifier » réécrit toutes les
  // étapes de la préparation (supprimées puis réinsérées : nouveaux id) : on
  // retient donc la préparation et le RANG de l'étape cliquée, puis, une fois
  // le rendu serveur revenu (les id ont changé), on défile jusqu'à elle.
  const retourEtape = useRef<{ componentId: number; rang: number; attente: string | null } | null>(null);
  const signatureEtapes = steps.map((st) => st.id).join(',');
  useEffect(() => {
    const r = retourEtape.current;
    if (!r?.attente || r.attente === signatureEtapes) return;
    retourEtape.current = null;
    const siens = steps.filter((st) => componentOf(st) === r.componentId);
    const cible = siens.length
      ? document.getElementById(`etape-${(siens[Math.min(Math.max(r.rang, 0), siens.length - 1)]).id}`)
      : document.getElementById(`prep-${r.componentId}-etapes`);
    if (!cible) return;
    for (let d = cible.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
    cible.scrollIntoView({ block: 'start' });
    // `steps` est recalculé à chaque rendu : seule la signature des id compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatureEtapes]);

  // Note « points à vérifier » d'une étape (JEP-403). La colonne, posée à la
  // main, arrive par `recipe_steps(*)` : absente, la note n'est pas proposée.
  const noteDe = (st: RecipeStepView) => (st as RecipeStepView & { points_a_verifier?: string | null }).points_a_verifier ?? null;
  const notesDisponibles = steps.some((st) => 'points_a_verifier' in st);

  // ── Reste à faire ─────────────────────────────────────────────────────
  const todo = projectTodo({
    intent: project.intent,
    titleSet: !!project.title && project.title !== 'Nouveau projet',
    measure_type: project.measure_type,
    formatKey: cleFormat,
    verifsDispo: ordered.length > 0 && ordered.every((c) => c.checksAvailable),
    components: ordered.map((c) => ({
      id: c.id,
      name: c.name,
      resolved: c.resolved,
      stepCount: c.stepCount,
      scaleFormatKey: c.scaleFormatKey,
      checkedStepsKey: c.checkedStepsKey,
      checkedQuantitiesKey: c.checkedQuantitiesKey,
      cleEtapes: empreinteEtapes(steps.filter((s) => componentOf(s) === c.id)),
      cleQuantites: empreinteQuantites(c.lines, c.scaleFactor),
      sansIngredient: c.resolved && c.lines.length === 0,
      notes: steps
        .filter((st) => componentOf(st) === c.id && (noteDe(st) ?? '').trim())
        .map((st) => ({ stepId: st.id, titre: st.title || `Étape ${steps.indexOf(st) + 1}` })),
    })),
  });

  // Filet de « cocher replie le volet » (JEP-403) : `basculerVerif` ferme le
  // volet tout de suite, mais ce geste porte sur un élément du DOM que la
  // resynchronisation peut remplacer ou rouvrir. Quand un point passe à « fait »
  // (n'importe quelle porte : panneau du haut, du bas, pied du volet), on referme
  // donc son volet APRÈS le rendu, sur l'élément alors présent. Un point déjà
  // « fait » au chargement ne replie rien (pas d'état précédent).
  const etatsVerifPrecedents = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    const courants = new Map<string, string>();
    for (const i of todo) if (i.verif) courants.set(`${i.verif.componentId}|${i.verif.type}`, i.etat);
    const avant = etatsVerifPrecedents.current;
    etatsVerifPrecedents.current = courants;
    if (!avant) return;
    courants.forEach((etat, k) => {
      const ancien = avant.get(k);
      if (etat !== 'fait' || !ancien || ancien === 'fait') return;
      const [id, type] = k.split('|');
      const volet = document.getElementById(`prep-${id}-${type}`);
      if (volet instanceof HTMLDetailsElement && volet.open) volet.open = false;
    });
  });

  const verifDe = (componentId: number, type: 'etapes' | 'quantites') =>
    todo.find((i) => i.verif?.componentId === componentId && i.verif.type === type);

  // Volets repliés au chargement (jamais recalculés ensuite, comme
  // `ouvertAuChargement` : un état qui bougerait sous le doigt ferait refermer
  // ce que le membre vient d'ouvrir). « Reste à faire » : replié une fois tout
  // fait (seule la jauge reste). « Votre intention » : replié dès qu'elle est
  // écrite. « Structure » : repliée quand toutes les recettes sont choisies.
  const repliesInitiaux = useRef<{ todo: boolean; intention: boolean; format: boolean; structure: boolean; ingredients: boolean; organisation: boolean } | null>(null);
  if (repliesInitiaux.current == null) {
    const recettes = todo.filter((i) => i.id === 'preparations' || i.id.startsWith('recette-'));
    repliesInitiaux.current = {
      todo: todo.length > 0 && todo.every((i) => i.etat === 'fait'),
      intention: !!project.intent?.trim(),
      // Format et rendement : replié dès que le format ET le nombre de parts sont
      // enregistrés (JEP-403) ; le rappel reste visible dans l'en-tête.
      format: !!project.measure_type && !!project.servings,
      structure: recettes.length > 1 && recettes.every((i) => i.etat === 'fait'),
      // Consultation : la liste totale des ingrédients et le bloc ustensiles /
      // difficulté / temps sont repliés par défaut.
      ingredients: true,
      organisation: true,
    };
  }
  const replies = repliesInitiaux.current;

  // Ouverture des volets « quantités » et « étapes » d'une préparation : fixée
  // UNE fois, au premier rendu (chargement ou réouverture de la page) — ouverte
  // tant que le contenu n'est pas vérifié, repliée s'il l'est. Jamais recalculée
  // ensuite : cocher la case ne replie rien sous le doigt, et la valeur de
  // `open` restant constante d'un rendu à l'autre, React ne referme pas un volet
  // que le membre a ouvert ou fermé lui-même. Sans les colonnes de vérification
  // (`checksAvailable` faux) : étapes ouvertes, quantités repliées, comme avant.
  const ouvertInitial = useRef<Record<string, boolean>>({});
  const ouvertAuChargement = (c: ProjectComponent, type: 'etapes' | 'quantites') => {
    const k = `${c.id}-${type}`;
    if (!(k in ouvertInitial.current)) {
      const verifie = c.checksAvailable && verifDe(c.id, type)?.etat === 'fait';
      ouvertInitial.current[k] = type === 'etapes' ? !verifie : c.checksAvailable && !verifie;
    }
    return ouvertInitial.current[k];
  };

  // Coche / décoche une vérification : on y range l'empreinte du contenu
  // vérifié ; elle ne vaut plus dès que ce contenu change.
  async function basculerVerif(it: TodoItem) {
    const v = it.verif;
    if (!v) return;
    const comp = ordered.find((c) => c.id === v.componentId);
    if (!comp) return;
    const courant = v.type === 'etapes' ? comp.checkedStepsKey : comp.checkedQuantitiesKey;
    const colonne = v.type === 'etapes' ? 'checked_steps_key' : 'checked_quantities_key';
    const coche = courant !== v.cle;
    // Volet concerné, et si la case cochée est la sienne (au bas du volet)
    // plutôt que celle du « Reste à faire » : lu AVANT l'écriture, la case
    // perdant le focus pendant qu'elle est désactivée.
    const volet = document.getElementById(`prep-${v.componentId}-${v.type}`);
    const depuisVolet = !!volet && !!document.activeElement && volet.contains(document.activeElement);
    const ok = await mutate(
      () =>
        createClient()
          .from('recipe_project_components')
          .update({ [colonne]: coche ? v.cle : null } as never)
          .eq('id', v.componentId),
      { errorLabel: 'Vérification' },
    );
    // Vérifié : le volet se replie (JEP-403), et si on l'a coché depuis son
    // pied, la page revient sur son en-tête plutôt que de sauter plus bas.
    if (ok && coche && volet instanceof HTMLDetailsElement && volet.open) {
      volet.open = false;
      if (depuisVolet) volet.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // Ouvre « Modifier cette préparation » depuis une étape (crayon d'étape, de
  // sous-étape, bandeau collant) : le rang retenu sert à ouvrir l'éditeur sur
  // cette étape, puis à revenir sur elle après l'enregistrement (JEP-403).
  function modifierPreparation(c: ProjectComponent, rang: number) {
    retourEtape.current = { componentId: c.id, rang: Math.max(rang, 0), attente: null };
    void ouvrirComposant(c, true);
  }

  // Étape de la préparation que l'on est en train de lire : la dernière dont le
  // haut est passé sous l'en-tête du site et le bandeau collant.
  function rangEnVue(c: ProjectComponent): number {
    const seuil = 72 + 64 + 40;
    let rang = 0;
    steps
      .filter((st) => componentOf(st) === c.id)
      .forEach((st, k) => {
        const el = document.getElementById(`etape-${st.id}`);
        if (el && el.getBoundingClientRect().top <= seuil) rang = k;
      });
    return rang;
  }

  function boutonRecette(c: ProjectComponent) {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            // Préparation entière : au retour, la page revient sur sa première étape.
            retourEtape.current = c.resolved ? { componentId: c.id, rang: 0, attente: null } : null;
            void ouvrirComposant(c, c.resolved);
          }}
          className={btnGhost}
        >
          {c.resolved ? (c.role === ROLE_ASSEMBLAGE ? 'Modifier cette étape' : 'Modifier cette préparation') : 'Choisir une recette'}
        </button>
        {c.resolved && c.role !== ROLE_ASSEMBLAGE && (
          <button type="button" onClick={() => changerRecette(c)} disabled={busy} className={btnGhost}>
            Choisir une autre recette
          </button>
        )}
        {c.resolved && c.role !== ROLE_ASSEMBLAGE && (
          <button type="button" onClick={() => void retirerRecette(c)} className={btnGhost}>
            Retirer la recette
          </button>
        )}
      </span>
    );
  }

  // Quantité obtenue en essai (« 50 g en trop ») → coefficient de la
  // préparation. Un seul coefficient par préparation : le geste n'a de sens
  // que si l'étape porte TOUS ses ingrédients (sinon l'écart d'une étape ne
  // dit rien des autres) ; à défaut, le coefficient est seulement indiqué.
  function ajustementEcart(comp: ProjectComponent, s: RecipeStepView): AjustementEcart {
    const ings = groupByOrder.get(s.order_index ?? -1)?.ingredients ?? [];
    const autres = steps.filter((x) => componentOf(x) === comp.id && x.id !== s.id && (groupByOrder.get(x.order_index ?? -1)?.ingredients ?? []).length > 0);
    return {
      lignes: ings.map((it) => ({ quantity: it.quantity, unit: it.unit })),
      // Masse par le référentiel : l'écart porte sur le total de l'étape.
      lignesMasse: ings.map((it) => {
        const q = it.quantity == null ? NaN : parseFloat(String(it.quantity).replace(',', '.'));
        return { name: it.name, quantity: isFinite(q) ? q : null, unit: it.unit, ref_id: it.ref_id ?? null };
      }),
      estimerMasse: (ls) => {
        const e = estimateWeightGrams(ls, conversions, unitRefs, ingredientDensities);
        return { grammes: e.grams, nonConvertis: e.unconverted.map((u) => u.name) };
      },
      libelle: 'Modifier les quantités avec ce coefficient',
      indisponible: autres.length
        ? 'D’autres étapes de cette préparation ont des ingrédients : ajustez-la dans « Ajustement des quantités ».'
        : null,
      onAjuster: async (coef, r) => {
        const factor = Math.round((comp.scaleFactor ?? 1) * coef * 10000) / 10000;
        const ok = await dialog.confirm(
          `Multiplier par ×${String(Math.round(coef * 1000) / 1000).replace('.', ',')} toutes les quantités de « ${comp.name} » (${libelleEcartProduit(r.ecartProduit) ?? 'écart constaté'} en essai) ?\n\nLe coefficient de la préparation passe à ×${String(Math.round(factor * 100) / 100).replace('.', ',')}.`,
          { okLabel: 'Modifier les quantités', cancelLabel: 'Annuler' },
        );
        if (!ok) return;
        await mutate(
          async () => {
            const supabase = createClient();
            try {
              await scaleAllLines(supabase, comp.lines, coef, comp.scaleFactor ?? 1, (b, c, u) => scaledQuantityText(b, c, u, seuils));
            } catch (e) {
              return { error: { message: (e as Error).message } };
            }
            const res = await supabase
              .from('recipe_project_components')
              .update({
                scale_factor: factor,
                scale_reason: `Fournée d’essai : ${libelleEcartProduit(r.ecartProduit) ?? 'écart'} sur « ${s.title || 'cette étape'} » → ×${String(Math.round(coef * 1000) / 1000).replace('.', ',')} sur toutes les quantités.`,
                manually_adjusted: false,
              } as never)
              .eq('id', comp.id);
            if (res.error) return res;
            await supabase.from('recipe_project_components').update({ scale_format_key: cleFormat } as never).eq('id', comp.id);
            return res;
          },
          { errorLabel: 'Ajustement des quantités' },
        );
      },
    };
  }

  // « Ajustement des quantités de cette étape » : même réglage et même libellé
  // que dans l'éditeur de recette, sous le titre de l'étape. Le mode est celui
  // du groupe d'ingrédients de l'étape (`ingredient_groups.scaling_mode`) ; le
  // coefficient d'une préparation s'applique de toute façon à toutes ses lignes
  // (`coefPreparation`), le mode départage surface et volume et vaut pour les
  // fournées futures. Pas de sélecteur pour une étape sans ingrédient.
  function selecteurAjustement(s: RecipeStepView) {
    const g = groupByOrder.get(s.order_index ?? -1);
    if (!g || !g.ingredients.length) return undefined;
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-outline-variant/60 pb-4">
        <label htmlFor={`ajust-${s.id}`} className="font-label-md text-label-md text-outline uppercase">
          Ajustement des quantités de cette étape
        </label>
        <select
          id={`ajust-${s.id}`}
          value={g.scaling_mode ?? 'simple'}
          disabled={busy}
          onChange={(e) =>
            void mutate(
              async () => createClient().from('ingredient_groups').update({ scaling_mode: e.target.value } as never).eq('id', g.id),
              { errorLabel: 'Mode d’ajustement' },
            )
          }
          className="editorial-input max-w-full text-on-surface cursor-pointer shrink-0"
          style={{ width: 'auto' }}
        >
          {SCALING_OPTIONS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
    );
  }

  // Case et ligne « Total de l'étape » sous les ingrédients (JEP-403) : masse
  // estimée par le référentiel (`totalEtape`, comme en fournée) ; une ligne
  // sans conversion est nommée, jamais passée sous silence.
  function piedTotal(s: RecipeStepView) {
    const ings = groupByOrder.get(s.order_index ?? -1)?.ingredients ?? [];
    if (!ings.length) return undefined;
    const t = totalVoulu
      ? totalEtape(
          ings.map((it) => {
            const q = it.quantity == null ? NaN : parseFloat(String(it.quantity).replace(',', '.'));
            return {
              name: it.name,
              quantity: isFinite(q) ? q : null,
              base_quantity: null,
              unit: it.unit,
              ref_id: it.ref_id ?? null,
              removed: false,
              expanded_into_recipe_id: null,
            };
          }),
          conversions,
          unitRefs,
          ingredientDensities,
        )
      : null;
    return (
      <div className="no-print mt-3 space-y-2">
        {t && (
          <p className="flex flex-wrap items-baseline justify-between gap-2 border-t border-outline-variant pt-2 font-label-md text-label-md text-primary">
            <span>Total de l’étape</span>
            <span>{formatMasse(t.ajuste)}</span>
            {t.horsTotal.length > 0 && (
              <span className="block w-full font-body-md text-[12px] font-normal text-on-surface-variant">
                Hors total (conversion inconnue) : {t.horsTotal.join(', ')}
              </span>
            )}
          </p>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-[13px] text-on-surface-variant">
          <input
            type="checkbox"
            checked={totalVoulu}
            onChange={(e) => setTotalVoulu(e.target.checked)}
            className="h-4 w-4 rounded border-outline accent-primary"
          />
          <span>Afficher le total des ingrédients</span>
        </label>
      </div>
    );
  }

  // Même présentation que la fiche recette (`RecipeStep`, partagé). `dernier`
  // : pas de filet sous la dernière étape d'un groupe.
  function etape(s: RecipeStepView, i: number, dernier: boolean) {
    // Picto « modifier » : ouvre le même panneau que « Modifier cette
    // préparation » (toute la préparation, pas la seule étape). Pas pour
    // l'assemblage, qui n'appartient à aucune préparation.
    const comp = ordered.find((c) => c.id === componentOf(s));
    return (
      <div key={s.id} id={`etape-${s.id}`} className="scroll-mt-40">
      <RecipeStep
        step={s}
        decalage="scroll-mt-40"
        crayon={
          comp
            ? (zone) => (
                <button
                  type="button"
                  onClick={(e) => {
                    // Dans un <summary> (conseils, ingrédients) : ne pas replier le volet.
                    e.preventDefault();
                    e.stopPropagation();
                    modifierPreparation(comp, steps.filter((st) => componentOf(st) === comp.id).findIndex((st) => st.id === s.id));
                  }}
                  disabled={busy}
                  title={
                    zone === 'sous-etape'
                      ? `Modifier cette étape (ouvre « ${comp.name} » sur cette étape)`
                      : `Modifier ${zone === 'conseil' ? 'les conseils' : 'les ingrédients'} de cette étape (ouvre « ${comp.name} »)`
                  }
                  aria-label={`Modifier l’étape ${s.title || ''} de ${comp.name}`}
                  // Un seul axe vertical pour tous les crayons (JEP-403), en DÉBUT de
                  // ligne : les volets d'ingrédients et de conseils (cadre 1 px + 16 px
                  // de marge) y placent le crayon à 17 px du bord, les sous-étapes,
                  // sans cadre, le décalent d'autant.
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary/60 hover:bg-surface-variant hover:text-primary focus-visible:text-primary disabled:opacity-40 ${
                    zone === 'sous-etape' ? 'ml-1' : ''
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">edit</span>
                </button>
              )
            : undefined
        }
        action={
          comp ? (
            <button
              type="button"
              onClick={() =>
                modifierPreparation(comp, steps.filter((st) => componentOf(st) === comp.id).findIndex((st) => st.id === s.id))
              }
              disabled={busy}
              title={`Modifier cette préparation (« ${comp.name} », toutes ses étapes)`}
              aria-label={`Modifier la préparation ${comp.name}`}
              className="ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary hover:bg-surface-variant disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-[20px]">edit</span>
            </button>
          ) : undefined
        }
        ajustement={comp ? selecteurAjustement(s) : undefined}
        note={
          comp && notesDisponibles ? (
            <PointsAVerifier
              key={`${s.id}-${noteDe(s) ?? ''}`}
              valeur={noteDe(s)}
              busy={busy}
              stepId={s.id}
              retours={<RetoursEtape stepId={s.id} ajustement={comp ? ajustementEcart(comp, s) : undefined} />}
              onSave={(texte) =>
                mutate(
                  () => createClient().from('recipe_steps').update({ points_a_verifier: texte } as never).eq('id', s.id),
                  { errorLabel: 'Points à vérifier' },
                )
              }
            />
          ) : undefined
        }
        retoursEtape={comp && notesDisponibles ? undefined : <RetoursEtape stepId={s.id} ajustement={comp ? ajustementEcart(comp, s) : undefined} />}
        retoursIngredient={(it) => <RetoursIngredient stepId={s.id} ingredientId={it.id} />}
        retoursSousEtape={(t) => <RetoursSousEtape stepId={s.id} texte={t} />}
        piedIngredients={comp ? piedTotal(s) : undefined}
        photosEdition={
          comp ? (
            <PhotosEtapeProjet
              key={s.id}
              stepId={s.id}
              recipeId={project.id}
              titreEtape={s.title ?? ''}
              photos={[...(s.step_photos ?? [])]
                .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
                .map((p) => ({ url: p.url, original_url: p.original_url ?? null, ai_retouched: !!p.ai_retouched }))}
              mutate={mutate}
              sections={sectionRegistry}
            />
          ) : undefined
        }
        index={i}
        anchorId={stepAnchorId(i)}
        ingredients={groupByOrder.get(s.order_index ?? -1)?.ingredients ?? []}
        qty={(it) => {
          const conv = ingredientConversionText(conversions, unitRefs, it.ref_id, it.unit, it.quantity);
          return (
            <>
              <span className="whitespace-nowrap">{[it.quantity, it.unit].filter(Boolean).join(' ')}</span>
              {conv && <span className="block font-body-md text-[12px] text-on-surface-variant">{conv}</span>}
            </>
          );
        }}
        last={dernier}
      />
      </div>
    );
  }

  // Blocs verrouillés tant qu'aucune préparation n'a sa recette : le lien mène à
  // la première préparation « À résoudre » du bloc « Structure », à défaut au
  // bloc lui-même. Aucun lien si « Structure » est lui-même verrouillé.
  const BLOCS_APRES_RECETTE: ReadonlySet<BlockKey> = new Set(['etapes', 'ingredients', 'organisation', 'conseils']);
  const lienVersRecette = (key: BlockKey) => {
    if (!BLOCS_APRES_RECETTE.has(key) || !states.structure.unlocked) return undefined;
    const cible = project.components.find((c) => !c.resolved);
    return {
      texte: 'Choisir une recette →',
      onClick: () => allerA(cible ? `prep-${cible.id}-recette` : 'bloc-structure'),
    };
  };

  const bloc = (key: BlockKey, children: ReactNode, aide?: ReactNode, resume?: ReactNode) => (
    <ProjectV2Block
      key={key}
      id={`bloc-${key}`}
      atelier={PROJECT_V2_ATELIER.has(key)}
      titre={BLOCS[key].titre}
      apercu={BLOCS[key].apercu}
      state={states[key]}
      aide={aide}
      resume={resume}
      lienVerrou={lienVersRecette(key)}
      replie={
        key === 'intention'
          ? replies.intention
          : key === 'format'
            ? replies.format
            : key === 'structure'
            ? replies.structure
            : key === 'ingredients'
              ? replies.ingredients
              : key === 'organisation'
                ? replies.organisation
                : undefined
      }
    >
      {children}
    </ProjectV2Block>
  );

  // ── Sommaire (rail de gauche, comme sur la fiche recette) ─────────────
  // Tous les blocs y figurent, verrouillés compris : ils sont visibles dans la
  // page. Les étapes s'intercalent après « Étapes » (entrées de niveau 2),
  // seulement quand le bloc est ouvert — sinon leurs ancres n'existent pas.
  // Le panneau du haut n'apparaît qu'une fois le travail engagé : à la création
  // du projet, aucune préparation n'a encore sa recette (bloc « Étapes »
  // verrouillé) et il ne ferait qu'empiler une liste de points d'emblée ouverts.
  const afficherResteAFaire = states.etapes.unlocked;
  const avantEtapes = ORDRE_BLOCS.indexOf('etapes') + 1;
  const entree = (k: BlockKey) => ({ id: `bloc-${k}`, label: BLOCS[k].court, icon: BLOCS[k].icon, level: 1 as const });
  const tocSections: TocSections = {
    before: [
      ...(afficherResteAFaire
        ? [
            {
              id: 'reste-a-faire',
              label: `Reste à faire (${todo.filter((i) => i.etat === 'fait').length}/${todo.length})`,
              icon: 'checklist',
              level: 1 as const,
            },
          ]
        : []),
      ...ORDRE_BLOCS.slice(0, avantEtapes).map(entree),
    ],
    after: ORDRE_BLOCS.slice(avantEtapes).map(entree),
  };
  const tocSteps =
    states.etapes.unlocked && recipe ? steps.map((st, i) => ({ key: String(st.id), title: st.title || `Étape ${i + 1}` })) : [];
  // ── Rédaction par IA (JEP-414) ─────────────────────────────────────────
  // La recette du projet telle qu'enregistrée (étapes, conseils), avec le nom et
  // la description en cours de saisie. Les conseils de la recette sont ceux de
  // la base : l'enregistrement automatique les y écrit en deux secondes.
  const etapesIA = steps;
  const recetteIA: RecetteRedaction = {
    titre: title.trim(),
    description: description.trim(),
    rendement: formatLabel ?? '',
    etapes: etapesIA.map((st) => ({
      titre: (st.title ?? '').trim(),
      texte: (Array.isArray(st.sous_etapes) && st.sous_etapes.length ? st.sous_etapes.map(String).join('\n') : st.description ?? '').trim(),
      ingredients: (groupByOrder.get(st.order_index ?? -1)?.ingredients ?? [])
        .map((it) => ligneIngredient({ name: it.name, qty: it.quantity, unit: it.unit, comment: it.comment }))
        .filter(Boolean),
      temps: texteTemps({ prep: st.prep_time, cook: st.cook_time, wait: st.wait_time, temp: st.cook_temp }),
      conseils: (st.tips ?? '').trim(),
      avance: st.can_prepare_ahead === true,
      avanceNote: (st.advance_note ?? '').trim(),
    })),
    conseils: (recipe?.tips ?? '').trim(),
    degustation: (recipe?.serving_advice ?? '').trim(),
  };
  const completionIA = redactionIA && recipe ? champsVides(recetteIA) : null;
  const [completionOuverte, setCompletionOuverte] = useState(false);
  // Propositions destinées à l'éditeur « Conseils et source », qui tient sa
  // propre saisie (et son enregistrement automatique).
  const [ajoutsConseils, setAjoutsConseils] = useState<{ id: number; tips?: string; serving?: string } | null>(null);

  async function appliquerPropositions(ps: PropositionRedaction[]) {
    const desc = ps.find((p) => p.champ === 'description');
    if (desc) setDescription((v) => ajouterTexte(v, desc.texte).slice(0, 2000));
    const tips = ps.find((p) => p.champ === 'conseils')?.texte;
    const serving = ps.find((p) => p.champ === 'degustation')?.texte;
    if (tips || serving) setAjoutsConseils((a) => ({ id: (a?.id ?? 0) + 1, tips, serving }));
    // Étapes : écrites tout de suite (elles ne sont éditées que dans « Modifier
    // cette préparation »), puis la page est resynchronisée.
    const parEtape = new Map<number, { tips?: string | null; can_prepare_ahead?: boolean; advance_note?: string }>();
    for (const p of ps) {
      if (p.etape == null) continue;
      const st = etapesIA[p.etape];
      if (!st) continue;
      const maj = parEtape.get(st.id) ?? {};
      if (p.champ === 'conseil_etape') maj.tips = ajouterTexte(st.tips, p.texte);
      if (p.champ === 'avance_etape' && p.possible !== false) {
        maj.can_prepare_ahead = true;
        maj.advance_note = ajouterNoteAvance(st.can_prepare_ahead ? st.advance_note : '', p.texte);
      }
      parEtape.set(st.id, maj);
    }
    if (!parEtape.size) return;
    await mutate(
      async () => {
        const supabase = createClient();
        for (const [id, maj] of parEtape) {
          const { error } = await supabase.from('recipe_steps').update(maj as never).eq('id', id);
          if (error) return { error };
        }
        return { error: null };
      },
      { errorLabel: 'Ajout des propositions aux étapes' },
    );
  }

  const tocActions: TocAction[] = [
    ...(redactionIA && recipe
      ? [
          {
            id: 'completer-ia',
            icon: 'auto_awesome',
            label: libelleCompletion(completionIA ? { nbChamps: completionIA.cibles.length, cout: coutCompletion(completionIA.cibles.length) } : null),
            variant: 'outline' as const,
            onClick: () => setCompletionOuverte(true),
            disabled: busy || leaving,
          },
        ]
      : []),
    { id: 'quitter', icon: 'close', label: 'Quitter', variant: 'outline', onClick: () => void quitter(), disabled: busy || leaving },
    {
      id: 'brouillon',
      icon: 'save',
      label: anyDirty ? 'Enregistrer maintenant' : 'Brouillon enregistré',
      variant: 'outline-strong',
      onClick: () => void saveAll(),
      disabled: busy || leaving || !anyDirty,
    },
    {
      id: 'valider',
      icon: 'task_alt',
      label: blockers.length ? 'Valider le projet (des préparations restent à résoudre)' : 'Valider le projet',
      variant: 'filled',
      onClick: () => void valider(),
      disabled: busy || leaving || blockers.length > 0,
    },
  ];

  const sansRecette = <p className="text-sm text-on-surface-variant">La recette du projet n’a pas pu être lue.</p>;

  const contenu = (
    <LeconsProvider
      reference={remarques?.reference ?? null}
      decisions={remarques?.decisions ?? []}
      choixDisponibles={!!remarques?.choixDisponibles}
      plusRecenteId={remarques?.plusRecenteId ?? null}
      anciennes={remarques?.anciennes ?? []}
      toutesEpinglees={remarques?.toutesEpinglees ?? false}
      recetteModifieeDepuis={remarques?.recetteModifieeDepuis ?? null}
      courantes={steps.map((st) => ({ id: st.id, source_step_id: st.id, title: st.title, order_index: st.order_index ?? 0, sousEtapes: st.sous_etapes ?? [] }))}
      ingredientsCourants={steps.flatMap((st) =>
        (groupByOrder.get(st.order_index ?? -1)?.ingredients ?? []).map((it) => ({ id: it.id, batch_step_id: st.id, name: it.name, unit: it.unit })),
      )}
      userId={userId}
      recipeId={project.id}
      auteur
    >
    <>
      <LoadingOverlay
        visible={busy || thinking || consultBusy || leaving}
        label={thinking ? 'Composition du projet…' : undefined}
      />

      <RecipeToc
        sections={tocSections}
        steps={tocSteps}
        actions={tocActions}
        mobile="drawer"
        mobileInset="nav"
        // Les étapes d'une préparation vivent dans un volet « Étapes » qui peut
        // être replié (étapes relues) : sans le rouvrir AVANT de défiler, la
        // cible n'a pas de position et le défilement se cale sur ce qui suit.
        onNavigateToStep={(i) => {
          for (let d = document.getElementById(stepAnchorId(i))?.closest('details') ?? null; d; d = d.parentElement?.closest('details') ?? null) {
            d.open = true;
          }
        }}
        // Un bloc replié (intention, structure, ingrédients, ustensiles et temps)
        // se rouvre avant le défilement, sinon le clic ne montre que son titre.
        onNavigateToSection={(id) => {
          const el = document.getElementById(id);
          el?.querySelector<HTMLDetailsElement>(':scope > details')?.setAttribute('open', '');
        }}
      />

      <header className="mb-8">
        <p className="font-label-md text-label-md uppercase tracking-widest text-secondary">
          Mode projet
        </p>
        <h1 className="mb-3 font-headline-lg text-[26px] font-bold leading-tight text-primary md:text-[34px]">
          {project.title === 'Nouveau projet' ? 'Nouveau projet' : project.title}
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <span className="bg-secondary px-3 py-1 font-label-md text-[10px] uppercase tracking-widest text-white">Brouillon</span>
          {etatAuto.etat === 'echec' ? (
            <span className="flex flex-wrap items-center gap-2 border border-error px-3 py-1 font-label-md text-[10px] uppercase tracking-widest text-error">
              Enregistrement automatique impossible · {etatAuto.echecs.join(', ')}
              <button type="button" onClick={() => void saveAll()} className="underline underline-offset-2">
                Réessayer
              </button>
            </span>
          ) : etatAuto.etat === 'enregistrement' ? (
            <span className="font-label-md text-[12px] text-on-surface-variant">Enregistrement…</span>
          ) : anyDirty ? (
            <span className="font-label-md text-[12px] text-on-surface-variant" title={dirtyLabels.join(', ')}>
              Enregistrement dans un instant… · {dirtyLabels.join(', ')}
            </span>
          ) : (
            <span className="font-label-md text-[12px] text-green-700">Tout est enregistré</span>
          )}
        </div>
      </header>

      {afficherResteAFaire && <ProjectTodo id="reste-a-faire" aide={<HelpBlockSlot blockKey="projet.reste_a_faire" help={help} />} ouvert={!replies.todo} items={todo} onToggle={(it) => void basculerVerif(it)} busy={busy || leaving} />}

      <div className="space-y-6">
        {bloc(
          'intention',
          <div className="space-y-3">
            <textarea
              ref={autoGrow}
              value={intent}
              onChange={(e) => {
                setIntent(e.target.value.slice(0, INTENT_MAX));
                autoGrow(e.target);
              }}
              rows={4}
              placeholder="Une tarte au praliné pour huit, avec un croustillant et une crème légère…"
              className={`${champ} resize-none overflow-hidden`}
            />
            <div className="flex flex-wrap items-center gap-3">
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
              {peutGenererIA && soldeProjet != null && (
                <span className="self-center text-[12px] text-on-surface-variant">
                  (il vous en reste {soldeProjet} ce mois-ci)
                </span>
              )}
            </div>
            {project.components.length > 0 && (
              <p className="text-[12px] text-on-surface-variant">
                Une nouvelle proposition remplace le format et les préparations « À résoudre » ; celles qui ont déjà
                leur recette sont conservées.
              </p>
            )}
          </div>,
          <HelpBlockSlot blockKey="projet.intention" help={help} />,
          // Volet replié : rappel de l'intention enregistrée (4 lignes au plus,
          // texte entier en infobulle) ; le picto « modifier » rouvre le volet.
          project.intent?.trim() ? (
            <p className="line-clamp-4 whitespace-pre-line text-[20px] leading-7 text-on-surface" title={project.intent.trim()}>
              {project.intent.trim()}
            </p>
          ) : undefined,
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
                  <span className={`flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] ${c.resolved ? 'text-green-700' : 'text-secondary'}`}>
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
                    {/* Recette d'origine, dans un nouvel onglet : seulement pour une
                        préparation copiée (l'IA et la saisie à la main n'en ont pas). */}
                    {c.resolved && c.source_recipe_id && (
                      <a
                        href={`/recette/${c.source_recipe_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Voir la recette d'origine"
                        aria-label={`Voir la recette d'origine de ${c.name}`}
                        className="relative top-px shrink-0 text-on-surface-variant transition-colors hover:text-primary"
                      >
                        {/* Taille en style en ligne : la feuille des icônes (24 px) l'emporterait sur une classe. */}
                        <span className="material-symbols-outlined block" style={{ fontSize: 14, lineHeight: 1 }}>
                          visibility
                        </span>
                      </a>
                    )}
                  </span>
                  {boutonRecette(c)}
                </div>
              )}
            />
          </div>,
          <HelpBlockSlot blockKey="projet.structure" help={help} />,
        )}

        {bloc(
          'identite',
          <div className="space-y-6">
            {recipe && <HeroEditor recipe={recipe} mutate={mutate} busy={busy} sections={sectionRegistry} />}
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
              <ZoneRedaction cible={{ champ: 'description' }} valeur={description} onAppliquer={(t: string) => setDescription(t.slice(0, 2000))}>
              {(boutonIA, panneauIA) => (
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <label className="font-label-md text-label-md text-outline">DESCRIPTION</label>
                  {boutonIA}
                </div>
                <textarea
                  ref={autoGrow}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value.slice(0, 2000));
                    autoGrow(e.target);
                  }}
                  rows={3}
                  placeholder="Ce qui rend ce dessert unique, l’occasion, le goût recherché…"
                  className={`${champ} resize-none overflow-hidden`}
                />
                {panneauIA}
              </div>
              )}
              </ZoneRedaction>
            </div>
            {recipe && (
              <TagsEditor recipe={recipe} tags={tags} mutate={mutate} busy={busy} sections={sectionRegistry} peutCreer={peutCreerTag} />
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
          </div>,
          undefined,
          // Volet replié : rappel du format enregistré (type, moule, dimensions,
          // parts) ; le picto « modifier » rouvre le volet.
          resumeFormat ? (
            <p className="text-[20px] leading-7 text-on-surface" title={resumeFormat}>
              {resumeFormat}
            </p>
          ) : undefined,
        )}

        {bloc(
          'etapes',
          recipe ? (
            <div className="space-y-8">
              <DessertVise project={project} formatLabel={formatLabel} />
              <RetoursAuteur recipeId={project.id} etapes={steps.map((st) => ({ id: st.id, title: st.title }))} compact ancrePrefixe="etape-" />
              {ordered.map((c, ci) => {
                const own = steps.filter((s) => componentOf(s) === c.id);
                return (
                  // Filet épais entre deux préparations, plus marqué que celui
                  // qui sépare deux étapes : la hiérarchie préparation → étape
                  // se lit d'un coup d'œil.
                  <div
                    key={c.id}
                    id={own.length ? undefined : `prep-${c.id}-etapes`}
                    className={`scroll-mt-28 ${ci > 0 ? 'mt-4 border-t-2 border-primary pt-10' : ''}`}
                  >
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
                    {c.resolved && c.lines.length > 0 && (
                      <details id={`prep-${c.id}-quantites`} open={ouvertAuChargement(c, 'quantites')} className="group mb-6 scroll-mt-28 rounded-xl border border-dashed border-secondary/40 bg-surface-container-lowest">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                          <span className="font-label-md text-[12px] uppercase tracking-widest text-secondary">
                            Ajustement des quantités · ×{String(Math.round((c.scaleFactor ?? 1) * 100) / 100).replace('.', ',')}
                            {quantitiesStale(c, cleFormat) && <span className="text-error"> · à recalculer (format modifié)</span>}
                            {verifDe(c.id, 'quantites')?.etat === 'fait' && <span className="text-green-700"> · Vérifié</span>}
                          </span>
                          {c.id === ordered.find((o) => o.resolved)?.id && (
                            <span className="mr-auto">{<HelpBlockSlot blockKey="projet.ajustement" help={help} />}</span>
                          )}
                          <span className="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
                        </summary>
                        <div className="border-t border-outline-variant/40 px-4 py-4">
                          <QuantitiesStep project={project} targetForme={formeCible} formatLabel={formatLabel}
                            componentId={c.id}
                            etapeIds={own.map((st) => st.id)}
                            quotaAjustementIA={quotaAjustementIA}
                            estimerMasse={(ls) => {
                              const e = estimateWeightGrams(ls.map((l) => ({ ...l, ref_id: null })), conversions, unitRefs, ingredientDensities);
                              return { grammes: e.grams, nonConvertis: e.unconverted.map((u) => u.name) };
                            }}
                            pied={<VerifCase item={verifDe(c.id, 'quantites')} onToggle={(it) => void basculerVerif(it)} busy={busy} />}
                          />
                        </div>
                      </details>
                    )}
                    {own.length ? (
                      <details id={`prep-${c.id}-etapes`} open={ouvertAuChargement(c, 'etapes')} className="group scroll-mt-28 rounded-xl border border-dashed border-secondary/40">
                        {/* Un seul cadre autour de l'en-tête ET des étapes (comme le
                            volet « Ajustement des quantités ») : ouvert, on voit que
                            les étapes dessous appartiennent à ce bandeau. */}
                        {/* Bandeau collant (JEP-403) : sous l'en-tête du site, il reste
                            à l'écran tant qu'on lit les étapes de cette préparation,
                            avec son nom et le crayon — plus besoin de remonter. */}
                        <summary className="sticky top-[var(--site-header-h,72px)] z-30 flex cursor-pointer list-none items-center gap-3 rounded-xl bg-surface-container-lowest px-4 py-3 md:px-6 group-open:rounded-b-none group-open:border-b group-open:border-dashed group-open:border-secondary/40">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              modifierPreparation(c, rangEnVue(c));
                            }}
                            disabled={busy}
                            title={`Modifier cette préparation (« ${c.name} »), à l’étape en cours de lecture`}
                            aria-label={`Modifier la préparation ${c.name}`}
                            className="ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-primary hover:bg-surface-variant disabled:opacity-40"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <span className="min-w-0 flex-1 font-label-md text-[12px] uppercase tracking-widest text-secondary">
                            <b className="mr-2 truncate font-body-md text-[14px] font-semibold normal-case tracking-normal text-primary">{c.name}</b>
                            Étapes · {own.length}
                            {verifDe(c.id, 'etapes')?.etat === 'fait' && <span className="text-green-700"> · relues</span>}
                            <NombreRetours
                              stepIds={own.map((st) => st.id)}
                              lignes={own.map((st) => ({
                                id: st.id,
                                sousEtapes: st.sous_etapes ?? [],
                                ingredientIds: (groupByOrder.get(st.order_index ?? -1)?.ingredients ?? []).map((it) => it.id),
                              }))}
                            />
                          </span>
                          <span className="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
                        </summary>
                        <div className="px-4 py-6 md:px-6">
                          <div className="space-y-10">{own.map((s, k) => etape(s, steps.indexOf(s), k === own.length - 1))}</div>
                          <VerifCase item={verifDe(c.id, 'etapes')} onToggle={(it) => void basculerVerif(it)} busy={busy} />
                        </div>
                      </details>
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
                  // JEP-282 : le nom suit la quantité du total (ou de l'unique ligne).
                  name: (
                    <NomIngredient
                      nom={g.name}
                      quantite={g.subtotal ? g.subtotal.qty : g.lines[0].qty}
                      unite={g.subtotal ? g.subtotal.unit : g.lines[0].unit}
                      refId={g.lines[0].ref_id}
                    />
                  ),
                  allergen:
                    Array.from(new Set(g.lines.flatMap((m) => (m.allergen ? m.allergen.split(',').map((a) => a.trim()) : []))))
                      .filter(Boolean)
                      .join(', ') || null,
                  total: g.subtotal ? [g.subtotal.qty, g.subtotal.unit].filter(Boolean).join(' ') : null,
                  lines: g.lines.map((m, k) => {
                    // Étapes où cette ligne apparaît (même principe que la fiche
                    // recette et la fournée) : groupes d'ingrédients fusionnés
                    // → étapes, appariés par `order_index`.
                    const etapesDe = (m.groupOrders || [])
                      .map((o) => etapeParOrdre.get(o))
                      .filter((st): st is { titre: string; ancre: string } => !!st);
                    return {
                      key: `${k}-${m.comment || ''}`,
                      qty: [m.qty, m.unit].filter(Boolean).join(' '),
                      comment: m.comment,
                      links:
                        etapesDe.length > 0 ? (
                          <span className="no-print inline-flex flex-wrap gap-x-3 gap-y-1">
                            {etapesDe.map((st) => (
                              <a
                                key={st.ancre}
                                href={`#${st.ancre}`}
                                // Les étapes d'une préparation peuvent être dans un
                                // volet replié : on le rouvre avant de défiler.
                                onClick={(e) => {
                                  const cible = document.getElementById(st.ancre);
                                  if (!cible) return;
                                  e.preventDefault();
                                  for (let d = cible.closest('details'); d; d = d.parentElement?.closest('details') ?? null) d.open = true;
                                  cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                }}
                                className="text-[12px] text-secondary underline underline-offset-2 hover:text-primary"
                              >
                                {st.titre}
                              </a>
                            ))}
                          </span>
                        ) : null,
                    };
                  }),
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
                sections={sectionRegistry}
              />
              {days.length > 1 && (
                <PlanningTimeline
                  days={days}
                  className="py-6"
                  note="Le jour de chaque étape se règle dans « Modifier cette préparation »."
                />
              )}
            </div>
          ) : (
            sansRecette
          ),
        )}

        {bloc('conseils', recipe ? <ConseilsEditor recipe={recipe} mutate={mutate} busy={busy} sections={sectionRegistry} ajouts={ajoutsConseils} /> : sansRecette)}

        {/* Second exemplaire du « Reste à faire », juste avant la validation :
            mêmes `todo`, même écriture, donc synchronisé avec celui du haut.
            Sans `id` : l'ancre `reste-a-faire` (sommaire) reste sur le premier. */}
        <ProjectTodo ouvert={!replies.todo} items={todo} onToggle={(it) => void basculerVerif(it)} busy={busy || leaving} />

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
            {perimees.length > 0 && (
              <p className="flex items-start gap-2 rounded-lg border border-error/40 bg-error-container/40 px-3 py-2 text-on-error-container">
                <span className="material-symbols-outlined text-[18px] shrink-0">sync_problem</span>
                Quantités à recalculer (calculées pour un autre format que le format visé) :{' '}
                {perimees.map((c) => c.name).join(', ')}.
              </p>
            )}
            {recipe && (
              <ProjectTrials
                recipe={recipe}
                trials={trials}
                unresolved={ordered.filter((c) => !c.resolved).map((c) => c.name)}
                pointsRestants={pointsRestants(todo)}
                retoursEssais={remarquesEssais}
              />
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
          <HelpBlockSlot blockKey="projet.essais_validation" help={help} />,
        )}
      </div>

      {resolving && (
        // Une portée par préparation ouverte (`key`) : la case « ne plus
        // afficher ce message » ne survit pas au passage à une autre.
        <PorteeEdition key={resolving.id}>
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
          conversions={conversions}
          unitRefs={unitRefs}
          referenceAllergenes={referenceAllergenes}
          tagsReference={tags}
          peutGenererIA={peutGenererIA}
          quotaProjetIA={quotaProjetIA}
          initialMode={resolvingInit?.mode}
          initialDraft={resolvingInit?.draft}
          initialDraftKind={resolvingInit?.kind}
          initialSource={resolvingInit?.source}
          etapesRelues={verifDe(resolving.id, 'etapes')?.etat === 'fait'}
          rangInitial={retourEtape.current?.componentId === resolving.id ? retourEtape.current.rang : undefined}
          onClose={() => {
            retourEtape.current = null;
            fermerResolution();
          }}
          // La modale n'emporte pas sa propre resynchronisation : elle écrit,
          // ce parent-ci rafraîchit (il reste monté), puis elle se ferme.
          onDone={() => {
            // Le retour sur l'étape attend le rendu serveur (id renouvelés).
            if (retourEtape.current?.componentId === resolving.id) retourEtape.current.attente = signatureEtapes;
            else retourEtape.current = null;
            refresh();
            fermerResolution();
          }}
          onReset={() => {
            refresh();
            setResolvingInit(null);
          }}
        />
        </PorteeEdition>
      )}
      <FenetreCompletion ouvert={completionOuverte} onFermer={() => setCompletionOuverte(false)} onAppliquer={(ps) => void appliquerPropositions(ps)} />
    </>
    </LeconsProvider>
  );

  if (!redactionIA) return contenu;
  return (
    <RedactionIAProvider acces={redactionIA.acces} credits={redactionIA.credits} recette={recetteIA}>
      {contenu}
    </RedactionIAProvider>
  );
}
