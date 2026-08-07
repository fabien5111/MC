import type { Metadata } from 'next';
import Link from 'next/link';
import { getAdminIdeas } from '@/lib/admin';
import { IdeasManager } from '@/components/admin/IdeasManager';

export const metadata: Metadata = { title: 'Boîte à idées | Admin — Maryse Club' };

export default async function AdminIdeesPage() {
  const ideas = await getAdminIdeas();
  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-mobile md:px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Boîte à idées</span>
        <Link href="/admin" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <IdeasManager ideas={ideas} />
    </>
  );
}
