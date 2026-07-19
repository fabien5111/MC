import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllowlistMembers } from '@/lib/admin';
import { MembersManager } from '@/components/admin/MembersManager';

export const metadata: Metadata = { title: 'Membres | Admin — Maryse Club' };

export default async function AdminMembresPage() {
  const members = await getAllowlistMembers();
  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Membres</span>
        <Link href="/admin" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <MembersManager members={members} />
    </>
  );
}
