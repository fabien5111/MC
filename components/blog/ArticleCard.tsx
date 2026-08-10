// Carte d'article — utilisée par la grille de `/blog` et par « À lire ensuite ».
//
// Le temps de lecture n'y figure pas : il se calcule depuis `content`, que la
// liste ne charge pas (un `jsonb` d'article complet par carte, pour une mention
// de trois mots, ne vaut pas son poids). Il reste affiché sur l'article et sur
// la mise en avant.
import Link from 'next/link';
import { formatArticleDate, type ArticleListItem } from '@/lib/blog';

export function ArticleCard({
  article,
  categoryName,
  compact = false,
}: {
  article: ArticleListItem;
  categoryName?: string;
  compact?: boolean;
}) {
  return (
    <Link href={`/blog/${article.slug}`} className="group block">
      <div className="relative overflow-hidden bg-surface-container mb-4 rounded-xl aspect-[3/2]">
        {article.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- data-URL
          <img
            src={article.cover_image_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-outline-variant text-[32px]">
            photo_camera
          </span>
        )}
      </div>
      {categoryName && (
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline mb-2">
          {categoryName}
        </p>
      )}
      <h3
        className={`font-headline-lg font-semibold leading-snug text-primary group-hover:text-secondary transition-colors line-clamp-3 ${
          compact ? 'text-[19px]' : 'text-[20px]'
        }`}
      >
        {article.title}
      </h3>
      {!compact && article.excerpt && (
        <p className="text-[14px] leading-relaxed text-on-surface-variant mt-2 line-clamp-2">
          {article.excerpt}
        </p>
      )}
      {!compact && (
        <p className="text-[12px] text-outline mt-3">{formatArticleDate(article.published_at)}</p>
      )}
    </Link>
  );
}
