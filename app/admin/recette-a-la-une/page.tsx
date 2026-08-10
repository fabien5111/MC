import type { Metadata } from 'next';
import Link from 'next/link';
import { requireFullAdmin } from '@/lib/auth';
import { getFeaturedRecipesAdmin } from '@/lib/featured';
import { FeaturedRecipesManager } from '@/components/admin/FeaturedRecipesManager';

export const metadata: Metadata = { title: 'Recette à la une | Admin — Maryse Club' };

export default async function AdminFeaturedRecipesPage() {
  await requireFullAdmin(); // vitrine de l'accueil : admin complet
  const items = await getFeaturedRecipesAdmin();

  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Recette à la une</span>
        <Link href="/admin" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <FeaturedRecipesManager items={items} />
    </>
  );
}
