// Vue de secours d'un projet en cours (`project_stage = 'wizard'`) dont le
// propriétaire a perdu le droit `mode_projet` — typiquement une
// rétrogradation depuis PRO.
//
// **Lecture seule, pas de dissolution ni de redirection.** L'existant reste
// entièrement visible : intention, format visé, composants et leur
// résolution. Rien ne s'écrit plus tant que le droit n'est pas rétabli — pas
// même la reprise du dialogue à l'étape où il a été laissé, qui exigerait
// d'écrire dans `recipe_projects.wizard_step`.
//
// Volontairement un composant à part plutôt qu'un mode de `ProjectWizard` :
// celui-ci suppose partout qu'il peut écrire (chaque étape enregistre au fil
// de l'eau), et le transformer en lecture seule aurait exigé de désarmer une
// douzaine de mutations une par une, pour un rendu qui n'a de toute façon
// rien d'interactif à montrer.
import Link from 'next/link';
import { COMPONENT_SOURCE_LABELS, PROJECT_FORMATS, formatYieldDesc, isProjectFormat } from '@/lib/projects';
import type { ProjectFull } from '@/lib/projects-data';

export function ProjectReadOnly({ project, planLabel }: { project: ProjectFull; planLabel: string }) {
  const format = isProjectFormat(project.measure_type) ? PROJECT_FORMATS[project.measure_type] : null;
  const dims = (project.mold_dims ?? {}) as Record<string, number>;
  const yieldDesc = format ? formatYieldDesc(project.measure_type as never, dims, project.servings) : null;

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-outline-variant bg-surface-container p-5">
        <p className="font-label-md text-[15px]">Lecture seule</p>
        <p className="mt-1 text-sm text-on-surface-variant">
          Le mode projet n’est pas inclus dans votre formule actuelle ({planLabel}). Ce projet reste entièrement
          visible, mais aucune modification n’est possible tant que vous n’avez pas retrouvé ce droit.
        </p>
        <Link href="/plans" className="mt-3 inline-block font-label-md text-[13px] text-primary underline">
          Voir les formules
        </Link>
      </div>

      {project.intent && (
        <section>
          <h2 className="mb-2 font-label-md text-[15px] text-primary">Intention</h2>
          <p className="text-sm text-on-surface-variant">{project.intent}</p>
        </section>
      )}

      {format && (
        <section>
          <h2 className="mb-2 font-label-md text-[15px] text-primary">Format visé</h2>
          <p className="text-sm text-on-surface-variant">
            {format.label}
            {yieldDesc ? ` — ${yieldDesc}` : ''}
            {project.servings ? ` — ${project.servings} parts` : ''}
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-label-md text-[15px] text-primary">
          Composants {project.components.length > 0 && `(${project.components.length})`}
        </h2>
        {project.components.length === 0 ? (
          <p className="text-sm italic text-on-surface-variant">Aucun composant n’a encore été ajouté.</p>
        ) : (
          <ul className="space-y-3">
            {project.components
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((c) => (
                <li key={c.id} className="rounded-lg border border-outline-variant p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-label-md text-[14px]">
                      {c.name}
                      {c.role && <span className="ml-2 text-xs text-on-surface-variant">({c.role})</span>}
                    </span>
                    <span className={`text-xs ${c.resolved ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                      {c.resolved ? 'Résolu' : 'À résoudre'}
                    </span>
                  </div>
                  {c.resolved && (
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {COMPONENT_SOURCE_LABELS[c.source_kind as keyof typeof COMPONENT_SOURCE_LABELS] ?? c.source_kind}
                      {c.source_title ? ` — ${c.source_title}` : ''}
                      {c.source_author_name ? ` (${c.source_author_name})` : ''}
                      {c.stepCount > 0 ? ` — ${c.stepCount} étape${c.stepCount > 1 ? 's' : ''}` : ''}
                    </p>
                  )}
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
}
