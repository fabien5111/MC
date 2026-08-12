import type { Metadata } from 'next';
import Link from 'next/link';
import { getPendingRecipes, getManagedRecipes, getLatestAnalyses, getMatchesForAnalyses } from '@/lib/admin';
import { RecipesManager } from '@/components/admin/RecipesManager';

export const metadata: Metadata = { title: 'Recettes | Admin — Je pâtisse !' };

export default async function AdminRecettesPage() {
  const [pending, managed] = await Promise.all([getPendingRecipes(), getManagedRecipes()]);
  // Seule la file « à valider » a besoin du panneau d'analyse IA (§9) : la
  // modération se joue à la soumission, pas sur les recettes déjà publiées.
  const analyses = await getLatestAnalyses(pending.map((r) => r.id));
  const matches = await getMatchesForAnalyses(Object.values(analyses).map((a) => a.id));
  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-mobile md:px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Recettes</span>
        <Link href="/admin" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <RecipesManager pending={pending} managed={managed} analyses={analyses} matches={matches} />
    </>
  );
}
