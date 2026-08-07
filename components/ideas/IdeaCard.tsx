// Carte idée : vote à gauche, titre/description/statut/auteur à droite
// (motif visuel proche de RecipeCardLayout, sans image — la table `ideas`
// n'en porte pas).
import { formatDate } from '@/lib/format';
import type { IdeaCardData } from '@/lib/ideas';
import { StatusBadge } from '@/components/ideas/StatusBadge';
import { VoteButton } from '@/components/ideas/VoteButton';

export function IdeaCard({ idea }: { idea: IdeaCardData }) {
  return (
    <article
      id={`idee-${idea.id}`}
      className="flex items-start gap-4 bg-surface-container-lowest border border-outline-variant rounded-xl p-5 hover:shadow-md transition-shadow scroll-mt-24"
    >
      <VoteButton ideaId={idea.id} initialVotes={idea.votes_count} initialHasVoted={idea.has_voted} />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 mb-1.5">
          <h3 className="font-headline-md text-lg text-on-surface">{idea.title}</h3>
          <StatusBadge status={idea.status} />
        </div>
        {idea.description && (
          <p className="text-sm text-on-surface-variant line-clamp-2 mb-2">{idea.description}</p>
        )}
        {idea.status === 'declined' && idea.admin_note && (
          <p className="text-sm text-on-surface-variant italic mb-2">« {idea.admin_note} »</p>
        )}
        <div className="flex items-center gap-2 text-xs text-secondary">
          <span>{idea.author_name || idea.author_username || 'Un membre'}</span>
          <span aria-hidden>·</span>
          <span>{formatDate(idea.created_at)}</span>
        </div>
      </div>
    </article>
  );
}
