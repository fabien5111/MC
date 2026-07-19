import type { Metadata } from 'next';
import Link from 'next/link';
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
      <header className="flex justify-between items-center h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <div className="flex items-center gap-8">
          <span className="font-headline-md text-2xl text-primary">Tableau de bord</span>
          <nav className="hidden md:flex gap-6">
            <Link href="/admin" className="text-primary border-b-2 border-primary pb-1 font-label-md text-label-md">
              Général
            </Link>
            <Link href="/admin/listes" className="text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-all duration-300">
              Listes
            </Link>
            <span className="text-on-surface-variant/50 font-label-md text-label-md cursor-not-allowed">Historique</span>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative hidden lg:block">
            <input
              className="bg-surface-container-low border-none focus:ring-1 focus:ring-primary rounded-full px-6 py-2 text-sm w-64 font-body-md"
              placeholder="Rechercher…"
              type="text"
            />
            <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
          </div>
          <div className="flex items-center gap-2">
            <button className="p-2 text-on-surface-variant hover:text-primary transition-transform active:scale-95">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="p-2 text-on-surface-variant hover:text-primary transition-transform active:scale-95">
              <span className="material-symbols-outlined">help_outline</span>
            </button>
            <Link
              href="/profil"
              className="ml-4 w-10 h-10 rounded-full border border-outline-variant overflow-hidden bg-primary-fixed-dim flex items-center justify-center text-on-primary-fixed font-bold text-sm"
            >
              A
            </Link>
          </div>
        </div>
      </header>
      <AdminDashboard stats={stats} pending={pending} comments={comments} />
    </>
  );
}
