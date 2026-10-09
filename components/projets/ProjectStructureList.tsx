'use client';

// Liste des composants d'un projet, éditable : glisser-déposer, rôle, mode
// d'ajustement, renommer, retirer, ajouter. Partagée par l'étape 3 du
// parcours en onglets et par le bloc « Structure » de la v2, qui y branche en
// plus le statut de résolution et le bouton d'ouverture (`extra`).
import { useState, type ReactNode } from 'react';
import { COMPONENT_ROLES, COMPONENT_SCALING_MODES } from '@/lib/projects';
import type { ProjectComponent } from '@/lib/projects-data';
import type { useProjectComponents } from '@/components/projets/useProjectComponents';

const btnGhost =
  'rounded-pill border border-outline-variant px-5 py-2.5 font-label-md text-[13px] font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-40';

export function ProjectStructureList({
  components,
  extra,
}: {
  components: ReturnType<typeof useProjectComponents>;
  // Contenu ajouté sous chaque ligne (v2 : source, nombre d'étapes, bouton).
  extra?: (c: ProjectComponent) => ReactNode;
}) {
  const { ordered, reorder, setRole, setScalingMode, renameComponent, removeComponent, addComponent } = components;
  // Réordonnancement par glisser-déposer (poignée, pas de flèches — même
  // convention que la liste des étapes dans l'éditeur classique).
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div className="space-y-5">
      {ordered.length === 0 ? (
        <p className="rounded-xl border border-outline-variant bg-surface-container-low p-4 text-sm italic text-on-surface-variant">
          Aucun composant pour l’instant. Ajoutez la première préparation.
        </p>
      ) : (
        <>
          {/* En-tête de colonnes : les libellés « Rôle » et « Ajustement » ne
              sont donnés qu'une fois ici, plutôt que répétés dans chaque menu. */}
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
                className={`rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3${
                  dragIndex === i ? ' opacity-50' : ''
                }`}
              >
                <div className="flex flex-wrap items-center gap-3">
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
                    title={
                      COMPONENT_SCALING_MODES.find((m) => m.value === (c.scalingMode ?? ''))?.title ??
                      'Ajustement des quantités'
                    }
                    className="w-full shrink-0 rounded-pill border border-outline-variant bg-surface-container-low px-3 py-1.5 text-[12.5px] text-on-surface-variant outline-none focus:border-primary sm:w-[220px]"
                  >
                    {COMPONENT_SCALING_MODES.map((m) => (
                      <option key={m.value} value={m.value} title={m.title}>
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
                </div>
                {extra?.(c)}
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
    </div>
  );
}
