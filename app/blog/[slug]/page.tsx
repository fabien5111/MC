// Page d'un article.
//
// Composition reprise du handoff : fil de retour, en-tête, ligne d'auteur,
// couverture pleine largeur, puis corps et sommaire collant côte à côte
// au-dessus de `lg` — le sommaire passant au-dessus du texte en dessous
// (`order-1` / `order-2`).
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { ArticleBody } from '@/components/blog/ArticleBody';
import { ArticleCard } from '@/components/blog/ArticleCard';
import { ArticleToc } from '@/components/blog/ArticleToc';
import { ReadingProgress } from '@/components/blog/ReadingProgress';
import {
  formatArticleDate,
  getArticle,
  getArticleCategories,
  getPublishedSlugs,
  getRelatedArticles,
  seoDescription,
  seoTitle,
} from '@/lib/blog';
import { getArticlePreview } from '@/lib/admin-blog';
import { siteUrl } from '@/lib/site-url';

// Pré-génération des slugs publiés au build ; Next bascule au rendu dynamique
// par requête si besoin (le reste de la page dépend de la session, via
// `Header`) — cette liste sert avant tout à `next build` et au cache.
//
// `generateStaticParams` s'exécute inconditionnellement au build, contexte où
// les variables Supabase peuvent ne pas être posées (poste sans `.env.local`,
// CI sans secrets). Un build qui échouerait pour ça casserait la vérification
// `npm run build` demandée avant tout push, pour un simple hint
// d'optimisation — la page reste de toute façon rendue à la demande.
export async function generateStaticParams() {
  try {
    const slugs = await getPublishedSlugs();
    return slugs.map((slug) => ({ slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { preview } = await searchParams;
  const article = preview ? await getArticlePreview(slug) : await getArticle(slug);
  if (!article) return { title: 'Article introuvable — Je pâtisse !' };

  const title = seoTitle(article);
  const description = seoDescription(article);

  return {
    title: `${title} — Je pâtisse !`,
    description,
    alternates: { canonical: `/blog/${article.slug}` },
    // Un aperçu de brouillon ne doit jamais être indexé.
    ...(preview ? { robots: { index: false, follow: false } } : {}),
    openGraph: {
      type: 'article',
      title,
      description,
      publishedTime: article.published_at ?? undefined,
      modifiedTime: article.updated_at,
      ...(article.cover_image_url ? { images: [article.cover_image_url] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(article.cover_image_url ? { images: [article.cover_image_url] } : {}),
    },
  };
}

export default async function ArticlePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  // La prévisualisation lit par la session authentifiée, sans cache ni filtre
  // de statut : la RLS décide seule qui a le droit de voir quoi (son propre
  // travail, ou l'admin). Un visiteur ordinaire qui ajoute `?preview=1` à
  // l'URL d'un brouillon retombe donc sur la lecture publique, qui ne le voit
  // pas plus qu'avant.
  const article = preview ? await getArticlePreview(slug) : await getArticle(slug);
  // Un article dépublié devra renvoyer 410 plutôt que 404 (il a existé) : cela
  // demande un traitement hors page, prévu avec le référencement.
  if (!article) notFound();

  const [related, categories] = await Promise.all([
    getRelatedArticles(article.slug, article.category),
    getArticleCategories(),
  ]);
  const names = new Map(categories.map((c) => [c.slug, c.name]));
  const categoryName = article.category ? (names.get(article.category) ?? article.category) : null;

  // JSON-LD `Article` : lu depuis les données déjà chargées ci-dessus, pas de
  // requête supplémentaire. `dangerouslySetInnerHTML` est sûr ici — le contenu
  // vient de `JSON.stringify`, pas d'un fragment HTML.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    ...(article.cover_image_url ? { image: [article.cover_image_url] } : {}),
    datePublished: article.published_at ?? article.created_at,
    dateModified: article.updated_at,
    ...(article.author_name ? { author: { '@type': 'Person', name: article.author_name } } : {}),
  };

  return (
    <>
      <Header current="blog" />
      <ReadingProgress />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger -- JSON.stringify, pas du HTML.
        // `<` échappé : un titre contenant littéralement "</script>" (saisi
        // par un rédacteur) ne doit pas pouvoir sortir de la balise.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      {preview && (
        <div className="bg-secondary text-white text-center text-[13px] font-semibold py-2 px-4">
          Aperçu · {article.status === 'publie' ? 'article publié' : 'brouillon non publié'} — non indexé
        </div>
      )}

      <main className="pb-32">
        <div className="max-w-[760px] mx-auto px-margin-mobile md:px-8 pt-10 md:pt-14">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-on-surface-variant hover:text-primary transition-colors mb-7"
          >
            <span className="material-symbols-outlined text-[18px]">arrow_back</span> Le blog
          </Link>
          {categoryName && (
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline mb-4">
              {categoryName}
            </p>
          )}
          <h1 className="font-headline-lg font-bold text-[32px] md:text-[46px] leading-[1.12] text-primary text-pretty">
            {article.title}
          </h1>
          {article.excerpt && (
            <p className="text-[17px] leading-relaxed text-on-surface-variant mt-5 text-pretty">
              {article.excerpt}
            </p>
          )}

          <div className="flex items-center gap-3 mt-7 pb-8">
            <span className="w-10 h-10 rounded-full overflow-hidden border border-outline-variant block bg-surface-container shrink-0">
              {article.authorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
                <img src={article.authorAvatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="material-symbols-outlined text-[20px] text-on-surface-variant flex items-center justify-center w-full h-full">
                  person
                </span>
              )}
            </span>
            <div className="text-[13px] leading-tight">
              {article.author_name && (
                <p className="font-semibold text-primary">{article.author_name}</p>
              )}
              <p className="text-outline mt-0.5">
                {formatArticleDate(article.published_at)} · {article.readingMinutes} min de lecture
              </p>
            </div>
          </div>
        </div>

        {article.cover_image_url && (
          <div className="max-w-[1100px] mx-auto px-margin-mobile md:px-8">
            <div className="relative overflow-hidden bg-surface-container rounded-xl aspect-[2.4/1]">
              {/* eslint-disable-next-line @next/next/no-img-element -- data-URL */}
              <img
                src={article.cover_image_url}
                alt=""
                className="w-full h-full object-cover"
                // Image la plus grande au-dessus de la ligne de flottaison :
                // elle est chargée en priorité, jamais en `lazy`.
                fetchPriority="high"
              />
            </div>
          </div>
        )}

        <div className="max-w-[1100px] mx-auto px-margin-mobile md:px-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-x-16 mt-12">
          <ArticleBody doc={article.doc} />
          <ArticleToc headings={article.headings} />
        </div>

        {related.length > 0 && (
          <section className="max-w-[1100px] mx-auto px-margin-mobile md:px-8 mt-24 pt-12 border-t border-outline-variant">
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-outline mb-6">
              À lire ensuite
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {related.map((a) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  categoryName={a.category ? names.get(a.category) : undefined}
                  compact
                />
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
      <MobileNav current="blog" />
    </>
  );
}
