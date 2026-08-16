// Rendu d'un bloc d'aide contextuelle : texte et vidéo indépendants (un bloc
// peut n'avoir que l'un des deux). Rendu pur, pas d'accès Supabase — la
// mutation de masquage est portée par le parent (HelpBlockList).
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';
import type { VisibleHelpBlock } from '@/lib/help';

export function HelpBlock({ block, onDismiss }: { block: VisibleHelpBlock; onDismiss: () => void }) {
  if (!block.showText && !block.showVideo) return null;

  return (
    <div className="no-print relative bg-secondary-container/30 border border-secondary-container rounded-xl p-6 flex flex-col md:flex-row gap-6 items-start">
      <button
        type="button"
        onClick={onDismiss}
        title="Ne plus afficher cette aide"
        aria-label="Ne plus afficher cette aide"
        className="absolute top-3 right-3 text-on-surface-variant hover:text-on-surface transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]">close</span>
      </button>
      {block.showText && block.text && (
        <p className="flex-1 min-w-0 pr-8 font-body-md text-body-md text-on-surface whitespace-pre-line">{block.text}</p>
      )}
      {block.showVideo && block.videoUrl && (
        <div className="w-full md:w-64 shrink-0">
          <StepVideoPlayer url={block.videoUrl} />
        </div>
      )}
    </div>
  );
}
