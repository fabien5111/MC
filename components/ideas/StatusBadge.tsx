// Badge de statut d'une idée (motif `RecipesManager` : pilule majuscule).
import { IDEA_STATUSES, isIdeaStatus } from '@/lib/ideas';

export function StatusBadge({ status }: { status: string }) {
  const entry = isIdeaStatus(status) ? IDEA_STATUSES[status] : IDEA_STATUSES.new;
  return (
    <span
      className={`px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider whitespace-nowrap ${entry.badgeClass}`}
    >
      {entry.label}
    </span>
  );
}
