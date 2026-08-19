import type { Metadata } from 'next';
import Link from 'next/link';
import { requireFullAdmin } from '@/lib/auth';
import { getAdminComments } from '@/lib/admin';
import { CommentsManager } from '@/components/admin/CommentsManager';

export const metadata: Metadata = { title: 'Commentaires | Admin — Je pâtisse !' };

export default async function AdminCommentairesPage() {
  // Modération des avis : admin complet (cf. CLAUDE.md « Rôles du
  // back-office » — une page ajoutée sous app/admin/ sans cette garde serait
  // ouverte au gestionnaire).
  await requireFullAdmin();

  const comments = await getAdminComments();

  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-mobile md:px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Commentaires</span>
        <Link href="/admin" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <CommentsManager comments={comments} />
    </>
  );
}
