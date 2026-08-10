// Accès aux données du blog — lectures publiques.
//
// Deux choix structurants :
//
// 1. **Lectures mises en cache, pas de rendu statique.** Le handoff prévoyait
//    `/blog` et `/blog/[slug]` en SSG avec `revalidate`. C'est hors d'atteinte
//    tel quel : `Header` et `MobileNav` lisent la session en cookies, donc
//    toute page du site est rendue à la demande. Ce qui est réellement partagé
//    entre visiteurs, ce sont les données — elles passent donc par
//    `unstable_cache` (60 s, étiquettes `blog` / `blog:<slug>`) et par un
//    client Supabase sans session. Le rendu reste dynamique, la base n'est
//    interrogée qu'une fois par minute, et la publication d'un article pourra
//    invalider l'étiquette (`revalidateTag`) au lieu d'attendre le délai.
//
// 2. **Tolérance à l'absence de table.** Tant que la migration n'est pas
//    passée en base, les lectures échouent : on renvoie une liste vide plutôt
//    que de faire tomber la page — même parti pris que
//    `getImpersonationContext`. Le blog s'affiche alors vide, il ne casse pas.
import { unstable_cache } from 'next/cache';
import { createPublicClient } from '@/lib/supabase/public';
import { withBlogSchema, type ArticleRow, type ArticleCategoryRow } from '@/lib/blog-types';
import { asDoc, extractHeadings, readingMinutes, type Heading, type ProseDoc } from '@/lib/blog-content';

// Articles par page de la liste. Au-delà, pagination numérotée (pas de
// défilement infini : mauvais pour l'indexation).
export const ARTICLES_PER_PAGE = 12;

// Durée de vie des lectures publiques, en secondes.
const REVALIDATE = 60;

// Étiquettes de cache, à invalider depuis le back-office lors d'une
// publication ou d'une mise à jour (lot suivant).
export const BLOG_TAG = 'blog';
export const articleTag = (slug: string) => `blog:${slug}`;

// Colonnes de la liste : tout sauf `content`, qui peut peser lourd et n'est pas
// affiché en liste. Le temps de lecture, qui s'en déduit, est donc absent des
// cartes — c'est assumé, voir `ArticleCard`.
const LIST_COLUMNS =
  'id, title, slug, excerpt, cover_image_url, category, author_id, author_name, published_at, updated_at';

export type ArticleListItem = Pick<
  ArticleRow,
  | 'id'
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'cover_image_url'
  | 'category'
  | 'author_id'
  | 'author_name'
  | 'published_at'
  | 'updated_at'
>;

export type ArticleDetail = ArticleRow & {
  doc: ProseDoc;
  headings: Heading[];
  readingMinutes: number;
  authorAvatarUrl: string | null;
};

export type CategoryWithCount = ArticleCategoryRow & { count: number };

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------

export type ArticlesPage = {
  items: ArticleListItem[];
  total: number;
  page: number;
  pageCount: number;
};

async function fetchPublishedArticles(page: number): Promise<ArticlesPage> {
  const supabase = withBlogSchema(createPublicClient());
  const from = (page - 1) * ARTICLES_PER_PAGE;

  const { data, count, error } = await supabase
    .from('articles')
    .select(LIST_COLUMNS, { count: 'exact' })
    .eq('status', 'publie')
    .order('published_at', { ascending: false })
    .range(from, from + ARTICLES_PER_PAGE - 1);

  if (error) return { items: [], total: 0, page: 1, pageCount: 0 };

  const total = count ?? 0;
  return {
    items: (data ?? []) as ArticleListItem[],
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / ARTICLES_PER_PAGE)),
  };
}

export const getPublishedArticles = (page = 1): Promise<ArticlesPage> =>
  unstable_cache(() => fetchPublishedArticles(page), ['blog-articles', String(page)], {
    revalidate: REVALIDATE,
    tags: [BLOG_TAG],
  })();

// ---------------------------------------------------------------------------
// Catégories
// ---------------------------------------------------------------------------

// Catégories du référentiel, avec le nombre d'articles publiés de chacune.
//
// Le compte est fait sur **tous** les articles publiés, pas sur la page
// courante : les pastilles annoncent ce que contient le blog, pas ce que
// contient l'écran. Le filtrage, lui, reste sur la page courante (cf.
// `BlogList`) — l'écart est visible et voulu, un compteur faux serait pire.
async function fetchCategories(): Promise<CategoryWithCount[]> {
  const supabase = withBlogSchema(createPublicClient());

  const [{ data: cats, error }, { data: rows }] = await Promise.all([
    supabase.from('article_categories').select('*').order('order_index'),
    supabase.from('articles').select('category').eq('status', 'publie'),
  ]);

  if (error || !cats) return [];

  const counts = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.category) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  }

  return cats.map((c) => ({ ...c, count: counts.get(c.slug) ?? 0 }));
}

export const getArticleCategories = (): Promise<CategoryWithCount[]> =>
  unstable_cache(fetchCategories, ['blog-categories'], {
    revalidate: REVALIDATE,
    tags: [BLOG_TAG],
  })();

// ---------------------------------------------------------------------------
// Article
// ---------------------------------------------------------------------------

// Complète une ligne `articles` en `ArticleDetail` (document décodé, sommaire,
// temps de lecture, photo d'auteur). Partagé par la lecture publique cachée
// ci-dessous et par la prévisualisation (`getArticlePreview`, session
// authentifiée, non cachée) : les deux doivent produire un rendu identique.
export async function toArticleDetail(data: ArticleRow, client: ReturnType<typeof withBlogSchema>): Promise<ArticleDetail> {
  // Photo de l'auteur : lecture séparée (pas de jointure) — `profiles` a ses
  // propres policies et l'article doit rester lisible même si le profil ne
  // l'est pas, ou n'existe plus (`author_id` est en ON DELETE SET NULL).
  let authorAvatarUrl: string | null = null;
  if (data.author_id) {
    const { data: profile } = await client
      .from('profiles')
      .select('avatar_url')
      .eq('id', data.author_id)
      .maybeSingle();
    authorAvatarUrl = profile?.avatar_url ?? null;
  }

  const doc = asDoc(data.content);
  return {
    ...data,
    doc,
    headings: extractHeadings(doc),
    readingMinutes: readingMinutes(doc),
    authorAvatarUrl,
  };
}

async function fetchArticle(slug: string): Promise<ArticleDetail | null> {
  const supabase = withBlogSchema(createPublicClient());

  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'publie')
    .maybeSingle();

  if (error || !data) return null;
  return toArticleDetail(data, supabase);
}

export const getArticle = (slug: string): Promise<ArticleDetail | null> =>
  unstable_cache(() => fetchArticle(slug), ['blog-article', slug], {
    revalidate: REVALIDATE,
    tags: [BLOG_TAG, articleTag(slug)],
  })();

// Slugs publiés — plan du site, flux RSS, pré-génération.
async function fetchPublishedSlugs(): Promise<string[]> {
  const supabase = withBlogSchema(createPublicClient());
  const { data, error } = await supabase.from('articles').select('slug').eq('status', 'publie');
  if (error) return [];
  return (data ?? []).map((r) => r.slug);
}

export const getPublishedSlugs = (): Promise<string[]> =>
  unstable_cache(fetchPublishedSlugs, ['blog-slugs'], {
    revalidate: REVALIDATE,
    tags: [BLOG_TAG],
  })();

// ---------------------------------------------------------------------------
// À lire ensuite
// ---------------------------------------------------------------------------

// Trois articles : d'abord ceux de la même catégorie, puis les plus récents
// pour compléter — l'article courant étant exclu des deux.
async function fetchRelated(slug: string, category: string | null): Promise<ArticleListItem[]> {
  const supabase = withBlogSchema(createPublicClient());

  const base = () =>
    supabase
      .from('articles')
      .select(LIST_COLUMNS)
      .eq('status', 'publie')
      .neq('slug', slug)
      .order('published_at', { ascending: false });

  const picked: ArticleListItem[] = [];
  const seen = new Set<string>();

  if (category) {
    const { data } = await base().eq('category', category).limit(3);
    for (const a of (data ?? []) as ArticleListItem[]) {
      picked.push(a);
      seen.add(a.id);
    }
  }

  if (picked.length < 3) {
    // On demande 3 de plus que nécessaire : les articles déjà retenus
    // ci-dessus remontent aussi dans cette seconde requête.
    const { data } = await base().limit(6);
    for (const a of (data ?? []) as ArticleListItem[]) {
      if (picked.length >= 3) break;
      if (seen.has(a.id)) continue;
      picked.push(a);
      seen.add(a.id);
    }
  }

  return picked.slice(0, 3);
}

export const getRelatedArticles = (slug: string, category: string | null): Promise<ArticleListItem[]> =>
  unstable_cache(() => fetchRelated(slug, category), ['blog-related', slug, category ?? '-'], {
    revalidate: REVALIDATE,
    tags: [BLOG_TAG],
  })();

// ---------------------------------------------------------------------------
// Affichage
// ---------------------------------------------------------------------------

export function formatArticleDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Titre et description effectifs : les champs SEO priment, sinon repli sur le
// titre et l'extrait. Le back-office montre exactement ces valeurs de repli
// dans son aperçu de résultat de recherche (lot suivant).
export function seoTitle(a: Pick<ArticleRow, 'seo_title' | 'title'>): string {
  return a.seo_title?.trim() || a.title;
}

export function seoDescription(a: Pick<ArticleRow, 'seo_description' | 'excerpt'>): string {
  return a.seo_description?.trim() || a.excerpt?.trim() || '';
}
