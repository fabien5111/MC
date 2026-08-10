import type { Metadata } from 'next';
import Link from 'next/link';
import { requireUser, getRole } from '@/lib/auth';
import { getManagedArticles, getArticleCategoriesAdmin } from '@/lib/admin-blog';
import { BlogManager } from '@/components/admin/BlogManager';

export const metadata: Metadata = { title: 'Blog | Admin — Maryse Club' };

export default async function AdminBlogPage() {
  const user = await requireUser();
  const role = await getRole(user.id);
  const [articles, categories] = await Promise.all([
    getManagedArticles(user.id, role),
    getArticleCategoriesAdmin(),
  ]);

  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-mobile md:px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Blog</span>
        <Link
          href="/admin"
          className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <BlogManager articles={articles} categories={categories} role={role} />
    </>
  );
}
