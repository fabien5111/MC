// Avis publiés sous une recette (bas de fiche) — cf. CLAUDE.md « Avis sur
// une recette ». Server Component : les avis affichés ici sont déjà filtrés
// par la RLS (`status = 'approved'`), pas de logique de visibilité côté
// client à dupliquer.
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { StepPhotoGallery } from '@/components/recipe/StepPhotoGallery';
import type { RecipeComment } from '@/lib/reviews-data';

function Stars({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="material-symbols-outlined text-[16px] text-tertiary" style={{ fontVariationSettings: value && n <= value ? "'FILL' 1" : "'FILL' 0" }}>
          star
        </span>
      ))}
    </div>
  );
}

export function RecipeComments({ comments }: { comments: RecipeComment[] }) {
  if (!comments.length) return null;

  return (
    <div id="sec-commentaires" className="no-print scroll-mt-28 mt-12 pt-10 border-t border-outline-variant">
      <h3 className="font-headline-md text-headline-md text-primary mb-8">
        Avis ({comments.length})
      </h3>
      <div className="flex flex-col gap-6">
        {comments.map((c) => (
          <div key={c.id} className="flex gap-4 pb-6 border-b border-outline-variant/40 last:border-0">
            <span className="w-9 h-9 rounded-full overflow-hidden border border-outline-variant shrink-0 bg-surface-container flex items-center justify-center">
              {c.profiles?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL
                <img src={c.profiles.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">person</span>
              )}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                {c.profiles?.username ? (
                  <Link href={`/u/${c.profiles.username}`} className="font-label-md text-label-md text-primary hover:underline">
                    {c.profiles.full_name || 'Membre'}
                  </Link>
                ) : (
                  <span className="font-label-md text-label-md text-primary">{c.profiles?.full_name || 'Membre'}</span>
                )}
                <Stars value={c.rating} />
                {c.created_at && <span className="text-[12px] text-on-surface-variant">{formatDate(c.created_at)}</span>}
              </div>
              {c.content && <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">{c.content}</p>}
              {c.photo_urls.length > 0 && (
                <div className="w-40 mt-3">
                  <StepPhotoGallery photos={c.photo_urls.map((url) => ({ url, ai_retouched: false }))} compact />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
