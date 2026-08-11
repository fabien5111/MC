import type { Metadata } from 'next';
import Link from 'next/link';
import { requireFullAdmin } from '@/lib/auth';
import { getAllowlistMembers } from '@/lib/admin';
import { MembersManager } from '@/components/admin/MembersManager';
import { ImpersonationAudit } from '@/components/admin/ImpersonationAudit';

export const metadata: Metadata = { title: 'Membres | Admin — Je pâtisse !' };

export default async function AdminMembresPage() {
  await requireFullAdmin(); // comptes, rôles et impersonation : admin complet
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
      <div className="px-margin-mobile md:px-margin-desktop max-w-[1400px] w-full pb-12">
        <ImpersonationAudit />
      </div>
    </>
  );
}
