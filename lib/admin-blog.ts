// Accès aux données du blog pour le back-office — lectures et écritures
// authentifiées (session en cookies, RLS appliquée).
//
// Un rédacteur (gestionnaire) ne doit voir dans cette liste QUE ses propres
// articles. La RLS seule n'y suffit pas : `articles_select_public` ouvre tout
// article `publie` à quiconque, admin ou non — une requête sans filtre
// ramènerait donc, en plus des brouillons du gestionnaire, les articles
// publiés de tous les autres auteurs. Le filtre par auteur est donc posé ici,
// en application, pour les non-admins.
import { createClient } from '@/lib/supabase/server';
import { withBlogSchema, type ArticleRow, type ArticleCategoryRow } from '@/lib/blog-types';
import { toArticleDetail, type ArticleDetail } from '@/lib/blog';
import type { AppRole } from '@/lib/auth';

const MANAGED_COLUMNS =
  'id, title, slug, excerpt, cover_image_url, status, category, author_id, author_name, published_at, updated_at, created_at';

export type ManagedArticle = Pick<
  ArticleRow,
  | 'id'
  | 'title'
  | 'slug'
  | 'excerpt'
  | 'cover_image_url'
  | 'status'
  | 'category'
  | 'author_id'
  | 'author_name'
  | 'published_at'
  | 'updated_at'
  | 'created_at'
>;

export async function getManagedArticles(userId: string, role: AppRole): Promise<ManagedArticle[]> {
  const supabase = withBlogSchema(await createClient());
  let query = supabase.from('articles').select(MANAGED_COLUMNS).order('updated_at', { ascending: false });
  if (role !== 'admin') query = query.eq('author_id', userId);

  const { data, error } = await query;
  if (error) return [];
  return data as ManagedArticle[];
}

// Article complet pour l'éditeur. La RLS (`articles_select_redaction`) borne
// déjà la lecture à son propre travail ou à l'admin ; `null` couvre aussi bien
// l'absence de ligne que le refus RLS, sans distinction utile côté page.
export async function getArticleForEdit(id: string): Promise<ArticleRow | null> {
  const supabase = withBlogSchema(await createClient());
  const { data, error } = await supabase.from('articles').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data;
}

// Prévisualisation : lecture par la session authentifiée, sans filtre de
// statut ni cache. La RLS fait tout le travail d'autorisation
// (`articles_select_redaction` : son propre travail, ou l'admin) — un
// visiteur quelconque qui devine un slug de brouillon reste bloqué là, sans
// jeton dédié à gérer.
export async function getArticlePreview(slug: string): Promise<ArticleDetail | null> {
  const supabase = withBlogSchema(await createClient());
  const { data, error } = await supabase.from('articles').select('*').eq('slug', slug).maybeSingle();
  if (error || !data) return null;
  return toArticleDetail(data, supabase);
}

export async function getArticleCategoriesAdmin(): Promise<ArticleCategoryRow[]> {
  const supabase = withBlogSchema(await createClient());
  const { data, error } = await supabase.from('article_categories').select('*').order('order_index');
  if (error) return [];
  return data;
}
