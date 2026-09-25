'use client';

// Parcours guidé du mode projet (spec §4) — quatre étapes, librement
// réversibles.
//
// **Tout est enregistré au fil de l'eau.** Il n'y a pas de « brouillon local »
// que l'on validerait à la fin : chaque geste écrit en base, et l'étape
// courante est mémorisée dans `recipe_projects.wizard_step`. Quitter
// l'application au milieu du dialogue et y revenir — depuis un autre appareil
// au besoin — restitue le projet là où il a été laissé (critère 8).
//
// Conséquence de méthode : la liste des composants n'est jamais tenue en
// état local. Elle vient des props (rendu serveur) et chaque modification
// écrit puis resynchronise via `useMutation`. Un miroir local aurait fini par
// diverger de la base au premier échec d'écriture — et c'est précisément ce
// que le mode projet ne peut pas se permettre, puisqu'il se poursuit sur
// plusieurs sessions.
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { ComponentResolver } from '@/components/projets/ComponentResolver';
import { QuantitiesStep, RecapStep } from '@/components/projets/ProjectQuantities';
import { ProjectTrials } from '@/components/projets/ProjectTrials';
import { ProjectIntentStep, type ProjectStartMode } from '@/components/projets/ProjectIntentStep';
import {
  clearComponentContent,
  resequenceProjectSteps,
  setComponentScalingMode,
  writeAssemblyStep,
} from '@/lib/projects-write';
import {
  COMPONENT_ROLES,
  COMPONENT_SCALING_MODES,
  COMPONENT_SOURCE_LABELS,
  MAX_COMPONENTS,
  PROJECT_FORMATS,
  PROJECT_FORMAT_KEYS,
  WIZARD_LABELS,
  WIZARD_STEPS,
  deduceProjectFormat,
  nextComponentPosition,
  projectFormatPayload,
  projectTargetForme,
  projectValidationBlockers,
  type ComponentSourceKind,
  type ProjectFormat,
  type WizardStep,
} from '@/lib/projects';
import { INTENT_MAX, type ProposedStructure } from '@/lib/ai/project-structure';
import type { ProjectComponent, ProjectFull } from '@/lib/projects-data';
import type { ConversionRef, IngredientRefOption, UnitRef } from '@/lib/ingredient-conversions';
import type { ProjectTrial } from '@/lib/projects-data';
import type { RecipeFull } from '@/lib/recipes';

type MoldType = { id: number; name: string; forme: string | null };

const btnPrimary =
  'rounded-pill bg-primary px-6 py-3 font-label-md text-[13px] font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95 disabled:opacity-40';
const btnGhost =
  'rounded-pill border border-outline-variant px-5 py-2.5 font-label-md text-[13px] font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-40';

export function ProjectWizard({
  project,
  moldTypes,
  units,
  conversions,
  unitRefs,
  ingredientRefs = [],
  recipe,
  trials,
  peutGenererIA = true,
  quotaProjetIA = null,
  fromAI = false,
}: {
  project: ProjectFull;
  moldTypes: MoldType[];
  units: string[];
  // Table de conversions et unités de référence : servent au récapitulatif,
  // qui consolide les ingrédients avec la fonction de la fiche recette
  // (`mergeIngredients`) plutôt qu'avec une seconde implémentation.
  conversions: ConversionRef[];
  unitRefs: UnitRef[];
  // Référentiel des ingrédients : aide à la saisie des ingrédients d'un
  // composant saisi à la main, comme dans l'éditeur de recette (JEP-254).
  ingredientRefs?: IngredientRefOption[];
  // Projet tout juste créé à partir d'une proposition de l'IA
  // (`/projets/nouveau`) : l'étape 2 le dit.
  fromAI?: boolean;
  // Recette du projet, pour la fournée d'essai (étape 6). `null` si elle n'a
  // pas pu être lue — le bloc des essais est alors simplement absent.
  recipe: RecipeFull | null;
  trials: ProjectTrial[];
  // Droit `mode_projet_ia_mensuel` (défaut `true` : la page a déjà vérifié
  // l'accès de base au mode projet avant de monter ce composant, seul le
  // gate spécifique aux générations IA transite ici).
  peutGenererIA?: boolean;
  // État du quota (`mc_check_quota`, affichage seulement — la garde réelle
  // reste `mc_consume`), transmis à `ComponentResolver` pour griser
  // « Demander une proposition à l'IA » une fois épuisé (JEP-77).
  quotaProjetIA?: { allowed: boolean; limit?: number; usage?: number } | null;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const { mutate, busy, refresh } = useMutation();
  const [step, setStep] = useState<WizardStep>(project.wizardStep);

  // Appel IA en cours (proposition de structure) : l'écriture, elle, est
  // couverte par `busy`.
  const [thinking, setThinking] = useState(false);

  const [intent, setIntent] = useState(project.intent ?? '');

  // Format visé. Déduit de ce que porte déjà la recette — le format d'un
  // projet vit sur `recipes` (measure_type / mold_type_id / mold_dims), pas
  // dans une table à part : c'est de là que la mise à l'échelle tirera ses
  // coefficients (cf. CLAUDE.md « Mode projet »).
  const dimsBase = (project.mold_dims && typeof project.mold_dims === 'object' && !Array.isArray(project.mold_dims)
    ? (project.mold_dims as Record<string, number>)
    : {}) as Record<string, number>;
  const formeBase = moldTypes.find((m) => m.id === project.mold_type_id)?.forme ?? null;
  const nbBase = parseInt(project.yield_qty || '1', 10) > 0 ? parseInt(project.yield_qty || '1', 10) : 1;
  const [format, setFormat] = useState<ProjectFormat>(
    deduceProjectFormat({ measure_type: project.measure_type, forme: formeBase, dims: dimsBase, count: nbBase }),
  );
  const [dims, setDims] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(dimsBase).map(([k, v]) => [k, String(v)])),
  );
  const [moldTypeId, setMoldTypeId] = useState<string>(project.mold_type_id ? String(project.mold_type_id) : '');
  const [servings, setServings] = useState(project.servings ? String(project.servings) : '');
  // Nombre d'exemplaires (gâteaux, bûches, empreintes) — JEP-254, point 3.
  const [count, setCount] = useState(project.measure_type === 'mold' ? String(nbBase) : '1');
  const [title, setTitle] = useState(project.title === 'Nouveau projet' ? '' : project.title);
  // Description du dessert visé, saisie en format libre uniquement — les
  // autres formats se décrivent déjà par leurs dimensions (JEP-254).
  const [description, setDescription] = useState(project.description ?? '');

  // Proposition de l'IA conservée entre l'étape 2 et l'étape 3 : les
  // composants ne sont écrits qu'à l'arrivée sur l'étape 3, pour ne pas
  // remplir la base d'une structure que l'utilisateur n'a pas encore vue.
  const [proposal, setProposal] = useState<ProposedStructure | null>(null);

  const [resolving, setResolving] = useState<ProjectComponent | null>(null);
  // Réordonnancement de la structure (étape 3) par glisser-déposer.
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Format visé, tel qu'il est effectivement enregistré sur la recette — et
  // non tel que l'écran 2 l'affiche : c'est lui qui sert au calcul des
  // coefficients et à la description passée à l'IA.
  const formeCible = projectTargetForme({
    measure_type: project.measure_type,
    forme: formeBase,
    dims: dimsBase,
    count: nbBase,
  });
  const formatLabel =
    [moldTypes.find((m) => m.id === project.mold_type_id)?.name, project.yield_desc].filter(Boolean).join(' — ') ||
    (project.servings ? `${project.servings} parts` : 'format libre');

  const moldsForFormat = moldTypes.filter((m) => {
    const forme = PROJECT_FORMATS[format].forme;
    return !forme || m.forme === forme;
  });

  const goStep = useCallback(
    async (next: WizardStep) => {
      setStep(next);
      // Mémorisation de l'étape courante : silencieuse (pas de
      // resynchronisation, pas d'alerte). Si elle échoue, l'utilisateur
      // reprendra une étape plus tôt — sans rien perdre, puisque le contenu,
      // lui, est écrit à chaque geste.
      await createClient().from('recipe_projects').update({ wizard_step: next } as never).eq('recipe_id', project.id);
    },
    [project.id],
  );

  // ── Étape 1 → 2 : intention, puis proposition de l'IA ───────────────────
  // Retour à l'étape 1 d'un projet existant : l'intention se met à jour, et
  // l'IA n'est sollicitée que si on le lui demande (JEP-254, point 2).
  async function submitIntent(mode: ProjectStartMode, texteSaisi: string) {
    const texte = texteSaisi.trim().slice(0, INTENT_MAX);
    setIntent(texte);
    if (mode === 'manual') {
      if (texte !== (project.intent ?? '')) {
        const ok = await mutate(
          () => createClient().from('recipe_projects').update({ intent: texte || null } as never).eq('recipe_id', project.id),
          { errorLabel: "Enregistrement de l'intention", refresh: false },
        );
        if (!ok) return;
      }
      await goStep(2);
      return;
    }
    const ok = await mutate(
      () => createClient().from('recipe_projects').update({ intent: texte } as never).eq('recipe_id', project.id),
      { errorLabel: "Enregistrement de l'intention", refresh: false },
    );
    if (!ok) return;

    // Best-effort : une proposition indisponible ne bloque rien, l'écran
    // reste utilisable entièrement à la main (spec §12).
    setThinking(true);
    try {
      const r = await fetch('/api/projet/structure', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ intent: texte }),
      });
      const data = (await r.json()) as ProposedStructure & { erreur?: string };
      // Quota de générations épuisé : la route rend 200 avec une proposition
      // vide pour ne pas interrompre le parcours, mais le membre doit savoir
      // pourquoi l'étape suivante s'ouvre vierge.
      if (data?.erreur) await dialog.alert(data.erreur);
      if (r.ok && data) {
        setProposal(data);
        if (data.title && !title.trim()) setTitle(data.title);
        if (data.format) setFormat(data.format);
        if (Object.keys(data.dims || {}).length) {
          setDims(Object.fromEntries(Object.entries(data.dims).map(([k, v]) => [k, String(v)])));
        }
        if (data.servings) setServings(String(data.servings));
        if (data.count) setCount(String(data.count));
      }
    } catch {
      // Silencieux : l'étape suivante s'ouvre vierge, ce qui est le
      // comportement attendu sans IA.
    } finally {
      setThinking(false);
    }
    await goStep(2);
  }

  // ── Étape 2 → 3 : format visé, écrit sur la recette ─────────────────────
  async function submitFormat() {
    const parts = parseInt(servings, 10);
    if (!(parts > 0)) {
      dialog.alert('Indiquez le nombre de parts visé.');
      return;
    }
    const nb = parseInt(count, 10);
    if (PROJECT_FORMATS[format].countLabel && !(nb > 0)) {
      dialog.alert(`Indiquez le nombre à réaliser (${PROJECT_FORMATS[format].countLabel?.toLowerCase()}).`);
      return;
    }
    const parsedDims: Record<string, number> = {};
    for (const d of PROJECT_FORMATS[format].dims) {
      const v = parseFloat((dims[d.key] ?? '').replace(',', '.'));
      if (!isNaN(v) && v > 0) parsedDims[d.key] = v;
    }

    const payload = {
      ...projectFormatPayload({
        format,
        title,
        servings: parts,
        dims: parsedDims,
        count: nb > 0 ? nb : 1,
        moldTypeId: format !== 'free' && moldTypeId ? Number(moldTypeId) : null,
      }),
      // Seul le format libre porte cette description : les autres formats
      // se décrivent déjà par leurs dimensions.
      description: format === 'free' ? description.trim() || null : null,
    };

    const ok = await mutate(() => createClient().from('recipes').update(payload as never).eq('id', project.id), {
      errorLabel: 'Enregistrement du format',
      refresh: false,
    });
    if (!ok) return;

    // Première arrivée sur l'étape 3 : la proposition de l'IA est écrite
    // maintenant, pas avant — l'utilisateur va la voir et pouvoir la
    // remanier. Si elle est vide (pas d'IA, panne), il compose à la main.
    if (!project.components.length && proposal?.components.length) {
      await mutate(
        async () => {
          const rows = proposal.components.slice(0, MAX_COMPONENTS).map((c, i) => ({
            recipe_id: project.id,
            position: i + 1,
            name: c.name,
            role: c.role || null,
            source_kind: 'manual',
            resolved: false,
          }));
          return createClient().from('recipe_project_components').insert(rows as never);
        },
        { errorLabel: 'Enregistrement de la structure', refresh: false },
      );
    }
    await goStep(3);
    router.refresh();
  }

  // ── Validation (spec §8) ────────────────────────────────────────────────
  async function valider() {
    const blockers = projectValidationBlockers({ measure_type: project.measure_type, components: project.components });
    if (blockers.length) {
      dialog.alert(`Le projet ne peut pas encore être validé :\n\n${blockers.join('\n')}`);
      return;
    }
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        try {
          await writeAssemblyStep(
            supabase,
            project.id,
            ordered.map((c) => ({ name: c.name, role: c.role })),
          );
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        // `status` ne bouge pas : la validation rend le projet utilisable
        // comme une recette (§8.2), elle ne le publie pas. Publier reste un
        // geste séparé, dans l'éditeur classique ou depuis la fiche.
        return supabase.from('recipes').update({ project_stage: 'ready' } as never).eq('id', project.id);
      },
      { errorLabel: 'Validation du projet', refresh: false },
    );
    if (ok) router.push(`/recette/${project.id}`);
  }

  // ── Étape 3 : structure ────────────────────────────────────────────────
  async function addComponent() {
    if (project.components.length >= MAX_COMPONENTS) {
      dialog.alert(`Un projet est limité à ${MAX_COMPONENTS} composants.`);
      return;
    }
    const nom = await dialog.prompt('Nom de la préparation à ajouter :', {
      required: true,
      singleLine: true,
      maxLength: 80,
      placeholder: 'Pâte sucrée',
    });
    if (!nom) return;
    await mutate(
      () =>
        createClient()
          .from('recipe_project_components')
          .insert({
            recipe_id: project.id,
            position: nextComponentPosition(project.components.map((c) => c.position)),
            name: nom.trim().slice(0, 80),
            source_kind: 'manual',
            resolved: false,
          } as never),
      { errorLabel: 'Ajout du composant' },
    );
  }

  async function renameComponent(c: ProjectComponent) {
    const nom = await dialog.prompt(`Renommer « ${c.name} » :`, {
      required: true,
      singleLine: true,
      maxLength: 80,
      defaultValue: c.name,
    });
    if (!nom || nom.trim() === c.name) return;
    await mutate(
      () =>
        createClient()
          .from('recipe_project_components')
          .update({ name: nom.trim().slice(0, 80) } as never)
          .eq('id', c.id),
      { errorLabel: 'Renommage' },
    );
  }

  async function setRole(c: ProjectComponent, role: string) {
    await mutate(
      () =>
        createClient()
          .from('recipe_project_components')
          .update({ role: role || null } as never)
          .eq('id', c.id),
      { errorLabel: 'Rôle du composant' },
    );
  }

  // Mode d'ajustement du composant (JEP-254, point 4) : volume ou surface,
  // comme pour un groupe d'ingrédients dans l'éditeur de recette. C'est ce
  // qui permet à l'étape 5 d'appliquer le coefficient de surface à une pâte
  // à foncer et celui de volume à un appareil.
  async function setScalingMode(c: ProjectComponent, mode: string) {
    await mutate(
      async () => {
        try {
          await setComponentScalingMode(createClient(), project.id, c.id, mode || null);
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        return { error: null };
      },
      { errorLabel: 'Mode d’ajustement' },
    );
  }

  async function removeComponent(c: ProjectComponent) {
    const restants = ordered.filter((x) => x.id !== c.id).map((x) => x.id);
    await mutate(
      async () => {
        const supabase = createClient();
        try {
          // `clearComponentContent` et non un simple delete sur
          // `recipe_steps` : les groupes d'ingrédients ne portent pas de
          // `component_id` (ils s'apparient aux étapes par `order_index`).
          // Supprimer les étapes seules laisserait des groupes orphelins, qui
          // se rattacheraient à l'étape d'un AUTRE composant dès la première
          // redistribution des blocs — les ingrédients d'une préparation
          // réapparaîtraient sous une autre.
          await clearComponentContent(supabase, project.id, c.id);
          const { error } = await supabase.from('recipe_project_components').delete().eq('id', c.id);
          if (error) return { error };
          await resequenceProjectSteps(supabase, project.id, restants);
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        return { error: null };
      },
      { confirm: `Retirer « ${c.name} » du projet ?`, errorLabel: 'Suppression du composant' },
    );
  }

  // Réordonnancement par glisser-déposer (poignée, pas de flèches — même
  // convention que la liste des étapes dans l'éditeur classique,
  // components/CreerForm.tsx). Renumérote TOUS les composants de 1 à n dans
  // le nouvel ordre plutôt que d'échanger deux positions : un déplacement de
  // bout en bout de liste n'est qu'un cas particulier, pas un cas à part.
  //
  // Les étapes du projet doivent se lire dans l'ordre d'assemblage, donc
  // leurs blocs d'`order_index` sont redistribués dans la foulée (et les
  // groupes d'ingrédients suivent leurs étapes — sinon l'appariement se
  // romprait au premier déplacement).
  async function reorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const depart = [...project.components].sort((a, b) => a.position - b.position);
    const [deplace] = depart.splice(fromIndex, 1);
    depart.splice(toIndex, 0, deplace);

    await mutate(
      async () => {
        const supabase = createClient();
        for (let i = 0; i < depart.length; i++) {
          if (depart[i].position === i + 1) continue;
          const { error } = await supabase
            .from('recipe_project_components')
            .update({ position: i + 1 } as never)
            .eq('id', depart[i].id);
          if (error) return { error };
        }
        try {
          await resequenceProjectSteps(supabase, project.id, depart.map((x) => x.id));
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        return { error: null };
      },
      { errorLabel: 'Réordonnancement' },
    );
  }

  const ordered = [...project.components].sort((a, b) => a.position - b.position);
  const nonResolus = ordered.filter((c) => !c.resolved);

  // Boutons de navigation de l'étape courante. Rendus deux fois — sous le fil
  // des étapes ET en bas de page (JEP-254, point 16) : sur une étape longue
  // (dix composants, leurs quantités), le bas de page est loin, et le fil
  // des étapes ne sait que revenir en arrière.
  function navigation(position: 'haut' | 'bas') {
    const cadre =
      position === 'haut'
        ? 'mb-8 flex flex-wrap gap-3'
        : 'mt-6 flex flex-wrap gap-3 border-t border-outline-variant pt-5';
    const terminerPlusTard = (
      <button type="button" onClick={() => router.push('/carnet?scope=proj')} className={btnGhost}>
        Terminer plus tard
      </button>
    );
    switch (step) {
      case 2:
        return (
          <div className={cadre}>
            <button type="button" onClick={() => goStep(1)} className={btnGhost}>
              Retour
            </button>
            <button type="button" onClick={submitFormat} disabled={busy} className={btnPrimary}>
              Continuer
            </button>
          </div>
        );
      case 3:
        return (
          <div className={cadre}>
            <button type="button" onClick={() => goStep(2)} className={btnGhost}>
              Retour
            </button>
            <button type="button" onClick={() => goStep(4)} disabled={!ordered.length} className={btnPrimary}>
              Valider la structure
            </button>
          </div>
        );
      case 4:
        return (
          <div className={cadre}>
            <button type="button" onClick={() => goStep(3)} className={btnGhost}>
              Retour
            </button>
            {terminerPlusTard}
            <button type="button" onClick={() => goStep(5)} className={btnPrimary}>
              Continuer
            </button>
          </div>
        );
      case 5:
        return (
          <div className={cadre}>
            <button type="button" onClick={() => goStep(4)} className={btnGhost}>
              Retour
            </button>
            <button type="button" onClick={() => goStep(6)} className={btnPrimary}>
              Voir le récapitulatif
            </button>
          </div>
        );
      case 6:
        return (
          <div className={cadre}>
            <button type="button" onClick={() => goStep(5)} className={btnGhost}>
              Retour
            </button>
            {terminerPlusTard}
          </div>
        );
      default:
        return null;
    }
  }

  // Lien vers la recette d'origine d'un composant, dans un nouvel onglet
  // (JEP-254, point 14) : on la consulte sans quitter le parcours. Une source
  // supprimée ou dépubliée garde son nom affiché, sans lien (`source_recipe_id`
  // repassé à `null` par la clé étrangère).
  function sourceLink(c: ProjectComponent) {
    if (!c.source_title) return null;
    if (!c.source_recipe_id) return <> · {c.source_title}</>;
    return (
      <>
        {' · '}
        <a
          href={`/recette/${c.source_recipe_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid"
        >
          {c.source_title}
          <span className="material-symbols-outlined text-[14px]" aria-hidden>
            open_in_new
          </span>
        </a>
      </>
    );
  }

  return (
    <>
      <LoadingOverlay visible={busy || thinking} label={thinking ? 'Composition du projet…' : undefined} />

      {/* Fil des étapes — cliquable : la spec veut un parcours séquentiel
          mais librement réversible (§4). */}
      <ol className="mb-6 flex flex-wrap items-center gap-2">
        {WIZARD_STEPS.map((s) => {
          const actif = s === step;
          const atteint = s <= step;
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => atteint && goStep(s)}
                disabled={!atteint}
                className={`rounded-pill px-4 py-1.5 font-label-md text-[12.5px] transition-all ${
                  actif
                    ? 'bg-primary text-on-primary'
                    : atteint
                      ? 'border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
                      : 'border border-outline-variant text-outline'
                }`}
              >
                {s}. {WIZARD_LABELS[s]}
              </button>
            </li>
          );
        })}
      </ol>

      {navigation('haut') ?? <div className="mb-4" />}

      {step === 1 && (
        <ProjectIntentStep
          initialIntent={intent}
          peutGenererIA={peutGenererIA}
          quotaProjetIA={quotaProjetIA}
          disabled={busy || thinking}
          onSubmit={(mode, texte) => void submitIntent(mode, texte)}
        />
      )}

      {step === 2 && (
        <section className="space-y-6">
          <h2 className="font-headline-md text-2xl text-primary">Quel format visez-vous ?</h2>
          <p className="text-sm text-on-surface-variant">
            {proposal?.format || fromAI
              ? 'Proposition établie à partir de votre intention — corrigez ce qui ne convient pas.'
              : 'Choisissez le format du dessert fini.'}
          </p>

          <div>
            <label className="mb-1 block font-label-md text-label-md text-outline">NOM DU DESSERT</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 120))}
              placeholder="Tarte aux fruits rouges"
              className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 font-body-md text-[15px] outline-none focus:border-primary"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PROJECT_FORMAT_KEYS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFormat(f);
                  // Le moule choisi dans le référentiel ne vaut que pour sa
                  // forme : changer de format le remet « à préciser ».
                  if (f !== format) setMoldTypeId('');
                }}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  format === f ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary'
                }`}
              >
                <span className="block font-label-md text-[13px] font-semibold text-on-surface">
                  {PROJECT_FORMATS[f].label}
                </span>
                <span className="block text-[12px] text-on-surface-variant">{PROJECT_FORMATS[f].hint}</span>
              </button>
            ))}
          </div>

          {(PROJECT_FORMATS[format].dims.length > 0 || PROJECT_FORMATS[format].countLabel) && (
            <div className="flex flex-wrap gap-4">
              {PROJECT_FORMATS[format].dims.map((d) => (
                <div key={d.key}>
                  <label className="mb-1 block font-label-md text-label-md text-outline">{d.label.toUpperCase()} (CM)</label>
                  <input
                    value={dims[d.key] ?? ''}
                    onChange={(e) => setDims((prev) => ({ ...prev, [d.key]: e.target.value }))}
                    inputMode="decimal"
                    className="w-32 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
              ))}
              {PROJECT_FORMATS[format].countLabel && (
                <div>
                  <label className="mb-1 block font-label-md text-label-md text-outline">
                    {PROJECT_FORMATS[format].countLabel?.toUpperCase()}
                  </label>
                  <input
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    inputMode="numeric"
                    className="w-32 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary"
                  />
                </div>
              )}
            </div>
          )}

          {format !== 'free' && (
            <div>
              <label className="mb-1 block font-label-md text-label-md text-outline">MOULE (RÉFÉRENTIEL)</label>
              <select
                value={moldTypeId}
                onChange={(e) => setMoldTypeId(e.target.value)}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary"
              >
                <option value="">— À préciser —</option>
                {moldsForFormat.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[12px] text-on-surface-variant">
                Le moule sert au calcul des quantités : deux cercles de diamètres différents ne demandent pas la même
                recette.
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block font-label-md text-label-md text-outline">NOMBRE DE PARTS</label>
            <input
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              inputMode="numeric"
              className="w-32 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 outline-none focus:border-primary"
            />
          </div>

          {/* Format libre seulement : aucune dimension ni moule où
              s'accrocher, la description est le seul repère sur ce que le
              dessert doit être (JEP-254). */}
          {format === 'free' && (
            <div>
              <label className="mb-1 block font-label-md text-label-md text-outline">
                QUE VOULEZ-VOUS RÉALISER ?
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                rows={3}
                placeholder="Un assortiment de mignardises pour un buffet, avec au moins une version sans gluten…"
                className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest p-4 font-body-md text-[15px] outline-none focus:border-primary"
              />
            </div>
          )}

          {navigation('bas')}
        </section>
      )}

      {step === 3 && (
        <section className="space-y-5">
          <h2 className="font-headline-md text-2xl text-primary">De quoi se compose votre dessert ?</h2>
          <p className="text-sm text-on-surface-variant">
            Du bas vers le haut de l’assemblage. Ajoutez, retirez, renommez, réordonnez — c’est votre structure.
            Précisez pour chaque préparation si elle suit le volume du moule ou recouvre une surface : c’est ce qui
            ajustera ses quantités à l’étape 5.
          </p>

          {ordered.length === 0 ? (
            <p className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm italic text-on-surface-variant">
              Aucun composant pour l’instant. Ajoutez la première préparation.
            </p>
          ) : (
            <>
              {/* En-tête de colonnes : les libellés « Rôle » et
                  « Ajustement » ne sont donnés qu'une fois ici, plutôt que
                  répétés dans chaque menu déroulant. */}
              <div className="hidden items-center gap-3 px-4 text-[11px] font-label-md uppercase tracking-wide text-outline sm:flex">
                <span className="w-5 shrink-0" aria-hidden />
                <span className="w-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">Préparation</span>
                <span className="w-[132px] shrink-0">Rôle</span>
                <span className="w-[220px] shrink-0">Ajustement</span>
                <span className="w-[52px] shrink-0" aria-hidden />
              </div>
              <ul className="space-y-2">
              {ordered.map((c, i) => (
                <li
                  key={c.id}
                  onDragOver={(e) => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    void reorder(dragIndex, i);
                    setDragIndex(null);
                  }}
                  className={`flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3${
                    dragIndex === i ? ' opacity-50' : ''
                  }`}
                >
                  <span
                    className="material-symbols-outlined shrink-0 cursor-grab text-outline-variant select-none active:cursor-grabbing"
                    title="Glisser pour réordonner"
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(i);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    drag_indicator
                  </span>
                  <span className="font-label-md text-[12px] text-outline">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-body-md text-[15px] text-on-surface">{c.name}</span>
                  <select
                    value={c.role ?? ''}
                    onChange={(e) => setRole(c, e.target.value)}
                    className="w-full shrink-0 rounded-pill border border-outline-variant bg-surface-container-low px-3 py-1.5 text-[12.5px] text-on-surface-variant outline-none focus:border-primary sm:w-[132px]"
                  >
                    <option value="">Rôle…</option>
                    {COMPONENT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                    {c.role && !(COMPONENT_ROLES as readonly string[]).includes(c.role) && (
                      <option value={c.role}>{c.role}</option>
                    )}
                  </select>
                  <select
                    value={c.scalingMode ?? ''}
                    onChange={(e) => setScalingMode(c, e.target.value)}
                    title="Ajustement des quantités"
                    className="w-full shrink-0 rounded-pill border border-outline-variant bg-surface-container-low px-3 py-1.5 text-[12.5px] text-on-surface-variant outline-none focus:border-primary sm:w-[220px]"
                  >
                    {COMPONENT_SCALING_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                  <span className="flex items-center gap-1">
                    <button type="button" onClick={() => renameComponent(c)} title="Renommer" className="p-1">
                      <span className="material-symbols-outlined text-[20px] text-primary">edit_note</span>
                    </button>
                    <button type="button" onClick={() => removeComponent(c)} title="Retirer" className="p-1">
                      <span className="material-symbols-outlined text-[20px] text-error">delete</span>
                    </button>
                  </span>
                </li>
              ))}
              </ul>
            </>
          )}

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={addComponent} className={btnGhost}>
              Ajouter une préparation
            </button>
          </div>

          {navigation('bas')}
        </section>
      )}

      {step === 4 && (
        <section className="space-y-5">
          <h2 className="font-headline-md text-2xl text-primary">Quelle recette pour chaque préparation ?</h2>
          <p className="text-sm text-on-surface-variant">
            Dans l’ordre que vous voulez. Un composant peut rester en attente : le projet reste un brouillon tant que
            vous ne l’avez pas validé.
          </p>

          <ul className="space-y-2">
            {ordered.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3"
              >
                <span className="material-symbols-outlined text-[20px] text-primary">
                  {c.resolved ? 'check_circle' : 'radio_button_unchecked'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-body-md text-[15px] text-on-surface">{c.name}</span>
                  <span className="block text-[12px] text-on-surface-variant">
                    {c.resolved ? (
                      <>
                        {COMPONENT_SOURCE_LABELS[c.source_kind as ComponentSourceKind] ?? c.source_kind}
                        {sourceLink(c)}
                        {c.source_author_name ? ` · ${c.source_author_name}` : ''}
                        {c.stepCount ? ` · ${c.stepCount} étape${c.stepCount > 1 ? 's' : ''}` : ''}
                      </>
                    ) : (
                      'À résoudre'
                    )}
                  </span>
                </span>
                {/* Renommer et retirer, comme à l'étape 3 (JEP-254, points 10
                    et 12) : on découvre souvent qu'une préparation est de trop
                    ou mal nommée en cherchant sa recette. */}
                <span className="flex items-center gap-1">
                  <button type="button" onClick={() => renameComponent(c)} title="Renommer" className="p-1">
                    <span className="material-symbols-outlined text-[20px] text-primary">edit_note</span>
                  </button>
                  <button type="button" onClick={() => removeComponent(c)} title="Retirer" className="p-1">
                    <span className="material-symbols-outlined text-[20px] text-error">delete</span>
                  </button>
                </span>
                <button type="button" onClick={() => setResolving(c)} className={btnGhost}>
                  {c.resolved ? 'Changer' : 'Choisir une recette'}
                </button>
              </li>
            ))}
          </ul>

          <p className="text-[12px] text-on-surface-variant">
            {nonResolus.length === 0
              ? 'Tous les composants sont résolus.'
              : `${nonResolus.length} composant${nonResolus.length > 1 ? 's' : ''} en attente.`}
          </p>

          {navigation('bas')}
        </section>
      )}

      {step === 5 && (
        <>
          <QuantitiesStep project={project} targetForme={formeCible} formatLabel={formatLabel} />
          {navigation('bas')}
        </>
      )}

      {step === 6 && (
        <>
          <RecapStep project={project} formatLabel={formatLabel} conversions={conversions} unitRefs={unitRefs} />
          {recipe && (
            <div className="mt-6">
              <ProjectTrials
                recipe={recipe}
                trials={trials}
                unresolved={ordered.filter((c) => !c.resolved).map((c) => c.name)}
              />
            </div>
          )}
          {navigation('bas')}

          <div className="mt-6 flex flex-wrap gap-3 border-t border-outline-variant pt-5">
            <button type="button" onClick={() => void valider()} disabled={busy} className={btnPrimary}>
              Valider le projet
            </button>
          </div>
          <p className="mt-3 text-[12px] text-on-surface-variant">
            La validation ne copie ni ne migre rien : le projet devient une recette ordinaire du carnet, sans perdre
            ses fournées d’essai. Vous pourrez le repasser en brouillon tant que vous ne l’avez pas publié.
          </p>
        </>
      )}

      {resolving && (
        <ComponentResolver
          projectId={project.id}
          projectTitle={title || project.title}
          servings={project.servings}
          formatLabel={formatLabel}
          component={resolving}
          componentIndex={ordered.findIndex((c) => c.id === resolving.id)}
          componentIds={ordered.map((c) => c.id)}
          units={units}
          ingredientRefs={ingredientRefs}
          peutGenererIA={peutGenererIA}
          quotaProjetIA={quotaProjetIA}
          onClose={() => setResolving(null)}
          // La modale n'emporte pas sa propre resynchronisation : elle écrit,
          // ce parent-ci rafraîchit (il reste monté), puis la fenêtre se
          // ferme — le voile est déjà en place au rendu qui la démonte.
          onDone={() => {
            refresh();
            setResolving(null);
          }}
        />
      )}
    </>
  );
}
