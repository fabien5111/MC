// Types des tables du blog, déclarés à la main — volontairement, et sur le
// même motif que `lib/impersonation-types.ts`.
//
// `lib/database.types.ts` est généré depuis la base live (`npm run gen:types`)
// et ne doit jamais être édité à la main : `articles` et `article_categories`
// y apparaîtront à la prochaine régénération. En attendant, ce module étend le
// type `Database` pour que les accès restent typés au lieu d'être des `any`.
//
// À la régénération des types, ce module reste valide (les définitions locales
// deviennent redondantes, sans conflit) et pourra être réduit aux seuls alias.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { ProseDoc } from '@/lib/blog-content';

// Statuts d'un article. `archive` est le retrait doux réservé à l'admin : il
// dépublie sans supprimer, et garde l'article dans le back-office.
export type ArticleStatus = 'brouillon' | 'publie' | 'archive';

export const ARTICLE_STATUSES: ArticleStatus[] = ['brouillon', 'publie', 'archive'];

export function isArticleStatus(v: unknown): v is ArticleStatus {
  return v === 'brouillon' || v === 'publie' || v === 'archive';
}

export function articleStatusLabel(status: ArticleStatus): string {
  return status === 'publie' ? 'Publié' : status === 'archive' ? 'Archivé' : 'Brouillon';
}

export type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  content: ProseDoc;
  excerpt: string | null;
  cover_image_url: string | null;
  status: ArticleStatus;
  category: string | null;
  // `author_id` est en ON DELETE SET NULL et `author_name` prend le relais pour
  // la signature — même motif que `planning.recipe_title` : la suppression d'un
  // compte ne doit ni effacer ni décapiter un article publié.
  author_id: string | null;
  author_name: string | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type ArticleInsert = {
  id?: string;
  title: string;
  slug: string;
  content?: ProseDoc;
  excerpt?: string | null;
  cover_image_url?: string | null;
  status?: ArticleStatus;
  category?: string | null;
  author_id?: string | null;
  author_name?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ArticleCategoryRow = {
  slug: string;
  name: string;
  order_index: number;
  status: string | null;
  created_at: string | null;
};

type ArticleCategoryInsert = {
  slug: string;
  name: string;
  order_index?: number;
  status?: string | null;
  created_at?: string | null;
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type PublicSchema = Database['public'];

// `Database` augmenté des objets créés par la migration du blog.
//
// `Omit` puis réajout plutôt qu'une simple intersection (`&`) : à la
// régénération des types (`npm run gen:types`), `articles`,
// `article_categories` et `gone_article_slugs` finissent par apparaître dans
// `PublicSchema` elle-même (contrairement à ce que laissait supposer le
// commentaire ci-dessus à l'origine). Une intersection sur une clé déjà
// présente ne l'écrase pas : elle combine les deux définitions, et
// `content: Json` (généré) ∩ `content: ProseDoc` (ici) produit
// `content: Json & ProseDoc`, qu'aucune valeur concrète ne peut satisfaire.
// `Omit` retire d'abord la clé générée pour que le type local la remplace
// proprement, que la régénération ait eu lieu ou non.
export type BlogDatabase = Omit<Database, 'public'> & {
  public: Omit<PublicSchema, 'Tables' | 'Functions'> & {
    Tables: Omit<PublicSchema['Tables'], 'articles' | 'article_categories'> & {
      articles: Table<ArticleRow, ArticleInsert, Partial<ArticleInsert>>;
      article_categories: Table<
        ArticleCategoryRow,
        ArticleCategoryInsert,
        Partial<ArticleCategoryInsert>
      >;
    };
    Functions: Omit<PublicSchema['Functions'], 'gone_article_slugs'> & {
      // Slugs d'articles ayant déjà été publiés (`published_at` non nul) mais
      // dont le statut n'est plus `publie` — voir `getGoneSlugs` (lib/blog.ts)
      // et `lib/blog-gone.ts` (410 côté middleware).
      gone_article_slugs: { Args: Record<string, never>; Returns: { slug: string }[] };
    };
  };
};

export type BlogClient = SupabaseClient<BlogDatabase>;

// Relit un client Supabase existant (navigateur ou serveur) avec le schéma
// étendu. Aucune conversion à l'exécution : uniquement du typage.
export function withBlogSchema(client: unknown): BlogClient {
  return client as BlogClient;
}
