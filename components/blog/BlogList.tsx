'use client';

// Liste des articles : pastilles de catégorie, recherche, mise en avant, grille.
//
// Le filtrage et la recherche portent sur **la page courante**, sans
// rechargement : le serveur a déjà rendu les douze articles de la page, les
// refiltrer côté client est instantané et évite un aller-retour pour un geste
// de tri. La pagination, elle, reste des liens serveur — numérotée, pas de
// défilement infini (mauvais pour l'indexation) ni de « Charger plus ».
//
// Conséquence à connaître : les compteurs des pastilles portent sur tout le
// blog alors que le filtre porte sur la page courante. C'est voulu — un
// compteur qui ne compterait que la page annoncerait « Technique 2 » sur un
// blog qui en contient quarante.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArticleCard } from '@/components/blog/ArticleCard';
import { formatArticleDate, type ArticleListItem, type CategoryWithCount } from '@/lib/blog';

const PILL = 'px-4 py-1.5 rounded-full text-[12.5px] font-semibold transition-all';
const PILL_ON = `${PILL} bg-primary text-on-primary`;
const PILL_OFF = `${PILL} border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary`;

export function BlogList({
  articles,
  categories,
  page,
  pageCount,
  total,
}: {
  articles: ArticleListItem[];
  categories: CategoryWithCount[];
  page: number;
  pageCount: number;
  total: number;
}) {
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');

  const query = q.trim().toLowerCase();
  const filtering = cat !== 'all' || query !== '';

  const names = useMemo(
    () => new Map(categories.map((c) => [c.slug, c.name])),
    [categories],
  );

  const filtered = useMemo(
    () =>
      articles.filter(
        (a) =>
          (cat === 'all' || a.category === cat) &&
          (!query || `${a.title} ${a.excerpt ?? ''}`.toLowerCase().includes(query)),
      ),
    [articles, cat, query],
  );

  // La mise en avant n'existe que sur la première page et hors filtre : dans une
  // liste filtrée, « à la une » ne veut plus rien dire. Elle sort alors de la
  // grille pour ne pas être affichée deux fois.
  const featured = page === 1 && !filtering ? articles[0] : null;
  const grid = featured ? filtered.slice(1) : filtered;

  return (
    <>
      <div className="border-y border-outline-variant py-4 mb-12">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCat('all')}
              aria-pressed={cat === 'all'}
              className={cat === 'all' ? PILL_ON : PILL_OFF}
            >
              Tous <span className="opacity-60">{total}</span>
            </button>
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => setCat(c.slug)}
                aria-pressed={cat === c.slug}
                className={cat === c.slug ? PILL_ON : PILL_OFF}
              >
                {c.name} <span className="opacity-60">{c.count}</span>
              </button>
            ))}
          </div>
          <div className="relative ml-auto">
            <label htmlFor="blog-q" className="sr-only">
              Chercher un article
            </label>
            <input
              id="blog-q"
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Chercher un article…"
              className="w-52 md:w-64 bg-surface-container-low border-none rounded-full pl-4 pr-10 py-2 text-[13px] focus:ring-1 focus:ring-primary outline-none"
            />
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-outline text-[18px] pointer-events-none">
              search
            </span>
          </div>
        </div>
      </div>

      {featured && (
        <Link href={`/blog/${featured.slug}`} className="group block mb-14">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
            <div className="relative overflow-hidden bg-surface-container rounded-xl aspect-[4/3]">
              {featured.cover_image_url ? (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL
                <img
                  src={featured.cover_image_url}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="material-symbols-outlined absolute inset-0 flex items-center justify-center text-outline-variant text-[40px]">
                  photo_camera
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-primary text-on-primary tracking-[.08em]">
                  À LA UNE
                </span>
                {featured.category && (
                  <span className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline">
                    {names.get(featured.category) ?? featured.category}
                  </span>
                )}
              </div>
              <h2 className="font-headline-lg font-bold text-[26px] md:text-[34px] leading-tight text-primary group-hover:text-secondary transition-colors">
                {featured.title}
              </h2>
              {featured.excerpt && (
                <p className="text-[15px] leading-relaxed text-on-surface-variant mt-4">
                  {featured.excerpt}
                </p>
              )}
              <p className="text-[12.5px] text-outline mt-5">
                {formatArticleDate(featured.published_at)}
              </p>
            </div>
          </div>
        </Link>
      )}

      {grid.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
          {grid.map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              categoryName={a.category ? names.get(a.category) : undefined}
            />
          ))}
        </div>
      ) : (
        <p className="text-[14px] text-on-surface-variant italic py-16 text-center">
          {filtering
            ? 'Aucun article dans cette catégorie.'
            : 'Aucun article publié pour le moment.'}
        </p>
      )}

      {pageCount > 1 && (
        <nav
          className="flex justify-center items-center gap-2 mt-16"
          aria-label="Pages du blog"
        >
          {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={n === 1 ? '/blog' : `/blog?page=${n}`}
              aria-current={n === page ? 'page' : undefined}
              className={
                n === page
                  ? 'w-9 h-9 flex items-center justify-center rounded-full bg-primary text-on-primary text-[13px] font-semibold'
                  : 'w-9 h-9 flex items-center justify-center rounded-full border border-outline-variant text-on-surface-variant text-[13px] font-semibold hover:border-primary hover:text-primary transition-colors'
              }
            >
              {n}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
