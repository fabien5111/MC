'use client';

// Rendu d'un bloc d'aide contextuelle : texte et vidéo indépendants (un bloc
// peut n'avoir que l'un des deux). Repliable — l'en-tête (titre, croix,
// chevron) reste seule visible une fois replié. La mutation de masquage est
// portée par le parent (useHelpBlocks).
//
// Croix de fermeture logée dans une barre d'en-tête dédiée (plutôt qu'en
// position absolue par-dessus le contenu) : posée sur la vidéo, elle perdait
// tout contraste face à la miniature YouTube/Vimeo et devenait invisible.
import { useState } from 'react';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';
import type { VisibleHelpBlock } from '@/lib/help';

export function HelpBlock({
  block,
  onDismiss,
  defaultExpanded,
}: {
  block: VisibleHelpBlock;
  onDismiss: () => void;
  defaultExpanded: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (!block.showText && !block.showVideo) return null;

  return (
    <div className="no-print bg-secondary-container/30 border border-secondary-container rounded-xl p-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-primary min-w-0"
        >
          <span className="material-symbols-outlined text-[20px] shrink-0">help_center</span>
          <span className="font-label-md text-label-md uppercase tracking-wide">Aides et Conseils</span>
          <span className="material-symbols-outlined text-[20px] shrink-0">{expanded ? 'expand_less' : 'expand_more'}</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          title="Ne plus afficher cette aide"
          aria-label="Ne plus afficher cette aide"
          className="text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
      {expanded && (
        <div className="flex flex-col md:flex-row gap-6 items-start mt-4">
          {block.showText && block.text && (
            <p className="flex-1 min-w-0 font-body-md text-body-md text-on-surface whitespace-pre-line">{block.text}</p>
          )}
          {block.showVideo && block.videoUrl && (
            <div className="w-full md:w-64 shrink-0">
              <StepVideoPlayer url={block.videoUrl} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
