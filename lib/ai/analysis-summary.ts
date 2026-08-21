// Phrase de synthèse en français naturel pour l'en-tête du panneau
// « Analyse automatique » (§9 : « Similarité rédactionnelle élevée (78 %)
// avec une recette publiée sur marmiton.org. 41 mots consécutifs
// identiques. »). Fonction pure — priorise le signal le plus sévère plutôt
// que de tout énumérer, pour rester lisible en une phrase.
import { MODERATION_CATEGORIES, type ModerationVerdict } from '@/lib/ai/moderation';
import { COVERAGE_ROUGE_PCT, COVERAGE_ORANGE_PCT } from '@/lib/ai/similarity';

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(MODERATION_CATEGORIES.map((c) => [c.code, c.label]));

// Catégorie relâchée en `string` (pas `ModerationCategoryCode`) : la
// lecture passe par `recipe_analysis.moderation_details` (jsonb non typé
// avant régénération, cf. lib/admin.ts `RecipeAnalysisCategory`), qui ne
// porte pas l'union stricte du prompt de modération.
export type SummaryInput = {
  moderationVerdict: ModerationVerdict | null;
  moderationCategories: { code: string; score: number }[];
  editorialMax: number;
  longestSequence: number;
  topMatchTitle: string | null;
  topMatchIsExternal: boolean;
};

export function buildAnalysisSummary(a: SummaryInput): string {
  const topCategory = a.moderationCategories[0]; // déjà trié par score décroissant

  if (a.moderationVerdict === 'bloquant' && topCategory) {
    return `Modération : contenu bloquant détecté (${CATEGORY_LABEL[topCategory.code] || topCategory.code}, score ${topCategory.score.toFixed(2)}).`;
  }

  if (a.editorialMax >= COVERAGE_ROUGE_PCT) {
    const source = a.topMatchTitle
      ? a.topMatchIsExternal
        ? `une page externe (${a.topMatchTitle})`
        : `une recette publiée sur le site (${a.topMatchTitle})`
      : 'une autre source';
    const seq = a.longestSequence > 0 ? ` ${a.longestSequence} mots consécutifs identiques.` : '';
    return `Copie mot pour mot détectée (${a.editorialMax.toFixed(0)} % du texte) avec ${source}.${seq}`;
  }

  if (a.moderationVerdict === 'attention' && topCategory) {
    return `Modération : signalement à vérifier (${CATEGORY_LABEL[topCategory.code] || topCategory.code}, score ${topCategory.score.toFixed(2)}).`;
  }

  if (a.editorialMax >= COVERAGE_ORANGE_PCT) {
    const source = a.topMatchTitle ? ` avec ${a.topMatchTitle}` : '';
    return `Copie mot pour mot partielle (${a.editorialMax.toFixed(0)} % du texte)${source} — à vérifier.`;
  }

  return 'Aucun signalement. Recette prête à valider.';
}
