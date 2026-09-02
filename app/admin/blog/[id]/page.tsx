import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireUser, getRole } from '@/lib/auth';
import { getArticleForEdit, getArticleCategoriesAdmin } from '@/lib/admin-blog';
import { BlogEditor } from '@/components/admin/BlogEditor';

export const metadata: Metadata = { title: 'Rédiger un article | Admin — Je pâtisse !' };

export default async function AdminBlogEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const role = await getRole(user.id);

  // `getArticleForEdit` s'appuie sur la RLS (`articles_select_redaction`) :
  // un gestionnaire qui tente l'article d'un autre auteur reçoit `null`,
  // exactement comme un article inexistant — pas de distinction utile ici.
  const [article, categories] = await Promise.all([getArticleForEdit(id), getArticleCategoriesAdmin()]);
  if (!article) notFound();

  return <BlogEditor article={article} categories={categories} isFullAdmin={role === 'admin'} />;
}
