import type { Metadata } from 'next';
import Link from 'next/link';
import {
  getPendingRecipes,
  getManagedRecipes,
  getRejectedRecipes,
  getLatestAnalyses,
  getAnalysesByIds,
  getMatchesForAnalyses,
  getFeedbackForMatches,
  getCalibrationStats,
  getRejectionHistory,
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
  const analysisRecipeIds = [...pending, ...rejected].map((r) => r.id);
  const [analyses, rejectionHistory] = await Promise.all([
    getLatestAnalyses(analysisRecipeIds),
    getRejectionHistory([...pending, ...managed, ...rejected].map((r) => r.id)),
  ]);
  // Détail complet dépliable pour chaque refus précédent (§9 : « conserver
  // les anciennes analyses avec les anciens motifs »), dans les trois
  // tables — y compris « validées et privées » : retrouver le détail d'un
  // refus passé reste utile après l'acceptation, pas seulement pendant la
  // décision.
  const historicalAnalysisIds = Object.values(rejectionHistory)
    .flat()
    .map((h) => h.analysis_id)
    .filter((id): id is number => id != null);
  const historicalAnalyses = await getAnalysesByIds(historicalAnalysisIds);
  const matches = await getMatchesForAnalyses([
    ...Object.values(analyses).map((a) => a.id),
    ...Object.values(historicalAnalyses).map((a) => a.id),
  ]);
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
        rejectionHistory={rejectionHistory}
        historicalAnalyses={historicalAnalyses}
      />
    </>
  );
}
