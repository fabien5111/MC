import type { Metadata } from 'next';
import { getAdminStats, getPendingRecipes, getPendingComments } from '@/lib/admin';
import { AdminDashboard } from '@/components/admin/AdminDashboard';

export const metadata: Metadata = { title: 'Tableau de bord | Admin — Maryse Club' };

export default async function AdminHomePage() {
  const [stats, pending, comments] = await Promise.all([
    getAdminStats(),
    getPendingRecipes(),
    getPendingComments(),
  ]);

  return (
    <>
      <header className="flex items-center h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Tableau de bord</span>
      </header>
      <AdminDashboard stats={stats} pending={pending} comments={comments} />
    </>
  );
}
