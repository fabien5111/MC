'use client';

// Gestion des composants d'un projet — ajout, renommage, rôle, mode
// d'ajustement, suppression, réordonnancement, ouverture de la fenêtre de
// résolution. Partagée par le parcours en onglets (`ProjectWizard`, étapes 3
// et 4) et par la v2 (`ProjectV2`, bloc « Structure ») : les deux écrans
// écrivent exactement la même chose, de la même façon.
//
// Même doctrine que le reste du mode projet : aucune liste tenue en état
// local, chaque geste écrit puis resynchronise via le `mutate` du parent
// (son voile couvre l'écriture ET le nouveau rendu serveur).
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { useMutation } from '@/lib/use-mutation';
import type { useDialog } from '@/components/Dialog';
import {
  clearComponentContent,
  readComponentDraft,
  resequenceProjectSteps,
  resetComponent,
  setComponentScalingMode,
} from '@/lib/projects-write';
import { MAX_COMPONENTS, nextComponentPosition, type ComponentSourceKind, type ComponentStepDraft } from '@/lib/projects';
import type { ProjectComponent, ProjectFull } from '@/lib/projects-data';

type Mutate = ReturnType<typeof useMutation>['mutate'];
type Dialog = ReturnType<typeof useDialog>;

export type ResolvingInit = {
  mode: 'sources' | 'edit';
  draft?: ComponentStepDraft[];
  kind?: ComponentSourceKind;
  source?: { recipeId: string | null; authorId: string | null; title: string | null; authorName: string | null };
};

export function useProjectComponents(project: ProjectFull, mutate: Mutate, dialog: Dialog) {
  const ordered = [...project.components].sort((a, b) => a.position - b.position);

  const [resolving, setResolving] = useState<ProjectComponent | null>(null);
  // Contenu chargé pour « Consulter » (JEP-254) : pour une source « Proposée
  // par l'IA » / « Saisie à la main », la fenêtre s'ouvre directement sur ce
  // qui est déjà enregistré plutôt que sur la recherche.
  const [resolvingInit, setResolvingInit] = useState<ResolvingInit | null>(null);
  const [consultBusy, setConsultBusy] = useState(false);

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
  // qui permet d'appliquer le coefficient de surface à une pâte à foncer et
  // celui de volume à un appareil.
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

  // Ouvre la fenêtre de résolution. Pour « Proposée par l'IA » / « Saisie à
  // la main », il n'y a pas de recette séparée à consulter ailleurs (pas de
  // `source_recipe_id`) : on charge donc son contenu déjà enregistré et on
  // ouvre directement en édition. `edit` force ce mode quelle que soit la
  // source (v2, « Modifier cette préparation ») — le crédit d'une copie est
  // alors transmis pour être conservé à l'enregistrement.
  async function ouvrirComposant(c: ProjectComponent, edit = false) {
    if (c.resolved && (edit || c.source_kind === 'ai_generated' || c.source_kind === 'manual')) {
      setConsultBusy(true);
      try {
        const draft = await readComponentDraft(createClient(), project.id, c.id);
        setResolvingInit({
          mode: 'edit',
          draft,
          kind: c.source_kind as ComponentSourceKind,
          source: {
            recipeId: c.source_recipe_id,
            authorId: c.source_author_id,
            title: c.source_title,
            authorName: c.source_author_name,
          },
        });
        setResolving(c);
      } catch (e) {
        dialog.alert(`La lecture du contenu a échoué : ${(e as Error).message}`);
      } finally {
        setConsultBusy(false);
      }
      return;
    }
    setResolvingInit(null);
    setResolving(c);
  }

  function fermerResolution() {
    setResolving(null);
    setResolvingInit(null);
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

  // « Retirer la recette » : le composant reste dans la structure mais repasse
  // « À résoudre » (contenu effacé, source oubliée) — même geste que
  // « Réinitialiser » dans la fenêtre de résolution.
  async function retirerRecette(c: ProjectComponent) {
    await mutate(
      async () => {
        try {
          await resetComponent(createClient(), project.id, c.id);
        } catch (e) {
          return { error: { message: (e as Error).message } };
        }
        return { error: null };
      },
      {
        confirm: `Retirer la recette de « ${c.name} » ? Ses étapes et ses ingrédients seront effacés ; la préparation repassera « À résoudre ».`,
        errorLabel: 'Retrait de la recette',
      },
    );
  }

  // Réordonnancement par glisser-déposer. Renumérote TOUS les composants de 1
  // à n dans le nouvel ordre plutôt que d'échanger deux positions : un
  // déplacement de bout en bout de liste n'est qu'un cas particulier.
  //
  // Les étapes du projet doivent se lire dans l'ordre d'assemblage, donc
  // leurs blocs d'`order_index` sont redistribués dans la foulée (et les
  // groupes d'ingrédients suivent leurs étapes — sinon l'appariement se
  // romprait au premier déplacement).
  async function reorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const depart = [...ordered];
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

  return {
    ordered,
    resolving,
    resolvingInit,
    setResolvingInit,
    consultBusy,
    addComponent,
    renameComponent,
    setRole,
    setScalingMode,
    ouvrirComposant,
    fermerResolution,
    removeComponent,
    retirerRecette,
    reorder,
  };
}
