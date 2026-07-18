import type { Metadata } from 'next';
import Link from 'next/link';
import { getListEntries } from '@/lib/admin';
import { ListsManager, SECTIONS } from '@/components/admin/ListsManager';

export const metadata: Metadata = { title: 'Listes | Admin — Maryse Club' };

const ORDER: Record<string, string> = { recipe_types: 'id', difficulties: 'level' };

export default async function AdminListesPage() {
  const entries = await Promise.all(SECTIONS.map((s) => getListEntries(s.table, ORDER[s.table] || 'name')));
  const data: Record<string, Awaited<ReturnType<typeof getListEntries>>> = {};
  SECTIONS.forEach((s, i) => (data[s.table] = entries[i]));

  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Gestion des listes</span>
        <Link href="/admin" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <ListsManager data={data} />
    </>
  );
}
