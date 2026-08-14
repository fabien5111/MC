import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getPendingRecipes,
  getManagedRecipes,
  getRejectedRecipes,
  getLatestAnalyses,
  getMatchesForAnalyses,
  getFeedbackForMatches,
  getCalibrationStats,
} from '@/lib/admin';
import { RecipesManager } from '@/components/admin/RecipesManager';

export const metadata: Metadata = { title: 'Recettes | Admin — Je pâtisse !' };

export default async function AdminRecettesPage() {
  const [pending, managed, rejected] = await Promise.all([
    getPendingRecipes(),
    getManagedRecipes(),
    getRejectedRecipes(),
  ]);
  // Le panneau d'analyse IA (§9) n'a de sens que là où une décision de
  // modération est en jeu : la file « à valider » et les recettes déjà
  // refusées (pour comprendre le refus). Les recettes déjà publiées n'en
  // ont pas besoin — la modération s'est jouée à leur soumission.
  const analyses = await getLatestAnalyses([...pending, ...rejected].map((r) => r.id));
  const matches = await getMatchesForAnalyses(Object.values(analyses).map((a) => a.id));
  const matchIds = Object.values(matches).flat().map((m) => m.id);
  const [feedback, calibration] = await Promise.all([getFeedbackForMatches(matchIds), getCalibrationStats()]);
  return (
    <>
      <header className="flex items-center justify-between h-16 px-margin-mobile md:px-margin-desktop bg-surface/80 backdrop-blur-md border-b border-outline-variant sticky top-0 z-20">
        <span className="font-headline-md text-2xl text-primary">Recettes</span>
        <Link href="/admin" className="font-label-md text-label-md flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined text-sm">arrow_back</span> Tableau de bord
        </Link>
      </header>
      <RecipesManager
        pending={pending}
        managed={managed}
        rejected={rejected}
        analyses={analyses}
        matches={matches}
        feedback={feedback}
        calibration={calibration}
      />
    </>
  );
}
