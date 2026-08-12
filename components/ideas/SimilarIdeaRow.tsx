// Ligne « idée proche » — utilisée sous le champ titre (suggestions
// lexicales instantanées) et dans les correspondances renvoyées par la
// vérification IA au moment de publier. `reason` n'existe que pour ces
// dernières (l'IA explique le rapprochement, la recherche lexicale non).
import { StatusBadge } from '@/components/ideas/StatusBadge';
import { VoteButton } from '@/components/ideas/VoteButton';

export function SimilarIdeaRow({
  id,
  title,
  status,
  votesCount,
  hasVoted,
  reason,
}: {
  id: string;
  title: string;
  status: string;
  votesCount: number;
  hasVoted: boolean;
  reason?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-outline-variant bg-surface-container-lowest">
      <VoteButton ideaId={id} initialVotes={votesCount} initialHasVoted={hasVoted} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] text-on-surface truncate">{title}</p>
        {reason && <p className="text-[11.5px] text-on-surface-variant italic truncate">{reason}</p>}
      </div>
      <StatusBadge status={status} />
    </div>
  );
}
