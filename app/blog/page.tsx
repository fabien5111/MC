// Liste des articles du blog.
//
// Le Server Component ne rend qu'une page d'articles (12) ; le filtrage par
// catégorie et la recherche sont ensuite instantanés côté client, sans
// rechargement (cf. `BlogList`). La pagination reste des liens serveur.
import type { Metadata } from 'next';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { MobileNav } from '@/components/MobileNav';
import { BlogList } from '@/components/blog/BlogList';
import { getArticleCategories, getPublishedArticles } from '@/lib/blog';

export const metadata: Metadata = {
  title: 'Le blog — Je pâtisse !',
  description:
    'Des articles de fond sur la technique et les ingrédients, et les modes d’emploi du site.',
};

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const requested = Number.parseInt(pageParam ?? '1', 10);
  const page = Number.isFinite(requested) && requested > 0 ? requested : 1;

  const [articles, categories] = await Promise.all([
    getPublishedArticles(page),
    getArticleCategories(),
  ]);

  return (
    <>
      <Header current="blog" />
      <main className="max-w-[1200px] mx-auto px-margin-mobile md:px-margin-desktop pb-32">
        <div className="pt-12 pb-9 max-w-[62ch]">
          <h1 className="font-headline-lg text-[30px] md:text-[42px] font-bold leading-tight text-primary">
            Le blog
          </h1>
          <p className="text-[15px] leading-relaxed text-on-surface-variant mt-4">
            Des articles de fond sur la technique et les ingrédients, et les modes d&apos;emploi du
            site.
          </p>
        </div>

        <BlogList
          articles={articles.items}
          categories={categories}
          page={articles.page}
          pageCount={articles.pageCount}
          total={articles.total}
        />
      </main>
      <Footer />
      <MobileNav current="blog" />
    </>
  );
}
