// Avis (note + commentaire) laissé sur une recette depuis une fournée
// terminée — accès base et écriture complète, côté SERVEUR uniquement
// (pendant de `lib/reviews.ts`, qui reste pur) ; même séparation que
// `ideas.ts` / `ideas-data.ts` ou `pseudo.ts` / `pseudo-data.ts`.
//
// Réutilise la table `comments` déjà en place (modération admin existante,
// cf. lib/admin.ts `getPendingComments`) plutôt que d'en créer une nouvelle.
// `batch_id`, `ai_score`, `ai_reason`, `rejection_reason` sont absentes de
// lib/database.types.ts tant que la migration (affichée en chat, à coller
// dans l'éditeur SQL Supabase) n'a pas été régénérée (npm run gen:types) —
// accès non typé sur ces colonnes en attendant, comme le reste du contrôle
// IA de recettes (cf. lib/admin.ts `getRejectedRecipes`).
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { callClaude, parseStrictJson, COMMENT_MODERATION_MODEL } from '@/lib/ai/claude';
import {
  buildCommentModerationContent,
  parseCommentModeration,
  COMMENT_MODERATION_PROMPT_VERSION,
  COMMENT_MODERATION_SYSTEM_PROMPT,
} from '@/lib/ai/comment-moderation';
import { validateReview } from '@/lib/reviews';
import type { BatchFull } from '@/lib/recipe-plan';

export type MyRecipeReview = {
  id: number;
  batch_id: number | null;
  status: string;
  rating: number | null;
  content: string;
  rejection_reason: string | null;
  photo_urls: string[];
};

// Avis courant du membre pour CETTE recette (une seule ligne possible, cf.
// CLAUDE.md « un avis par recette et par membre »). `null` si aucun avis
// n'a encore été déposé : c'est ce qui autorise le bouton « Donner votre
// avis » sur n'importe quelle fournée terminée de cette recette.
export async function getMyRecipeReview(recipeId: string, userId: string): Promise<MyRecipeReview | null> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('comments')
    .select('id, batch_id, status, rating, content, rejection_reason, photo_urls')
    .eq('recipe_id', recipeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) console.error('getMyRecipeReview:', error.message);
  return (data as unknown as MyRecipeReview | null) ?? null;
}

export type RecipeComment = {
  id: number;
  content: string;
  rating: number | null;
  created_at: string | null;
  photo_urls: string[];
  profiles: { full_name: string | null; avatar_url: string | null; username: string | null } | null;
};

// Avis publiés sous une recette (bas de fiche, cf. CLAUDE.md). Filtré côté
// base par la RLS (`status = 'approved'` pour tout visiteur) — le `.eq` ici
// documente l'intention sans y ajouter de sécurité propre.
export async function getApprovedComments(recipeId: string): Promise<RecipeComment[]> {
  const supabase = await createClient();
  const { data, error } = await (supabase as any)
    .from('comments')
    .select('id, content, rating, created_at, photo_urls, profiles(full_name, avatar_url, username)')
    .eq('recipe_id', recipeId)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getApprovedComments:', error.message);
    return [];
  }
  return (data as unknown as RecipeComment[]) ?? [];
}

export type SubmitReviewResult = { ok: true } | { ok: false; message: string };

// Dépose ou corrige (après refus) l'avis d'une fournée terminée sur sa
// recette d'origine. Écrit avec la clé service_role : la route appelante a
// déjà vérifié la session (auth + lecture seule) et la propriété de la
// fournée, mais le score IA et le passage en modération ne doivent pas
// dépendre de ce que la RLS autoriserait un membre à écrire lui-même sur
// `comments` — même doctrine que `enregistrerPseudo`.
export async function submitOrUpdateReview(
  batch: Pick<BatchFull, 'id' | 'user_id' | 'recipe_id' | 'status'>,
  userId: string,
  rating: number,
  comment: string,
  photos: string[] = [],
): Promise<SubmitReviewResult> {
  if (batch.user_id !== userId) return { ok: false, message: 'Cette fournée ne vous appartient pas.' };
  if (batch.status !== 'terminee') return { ok: false, message: 'Cette fournée n’est pas encore terminée.' };
  if (!batch.recipe_id) return { ok: false, message: 'Recette d’origine introuvable.' };

  const validation = validateReview(rating, comment, photos);
  if (!validation.ok) return validation;
  const texte = comment.trim();

  const admin = createAdminClient();

  // Avis déjà déposé pour cette recette (un seul par membre, cf.
  // CLAUDE.md) : autorisé UNIQUEMENT en resoumission après refus, et
  // UNIQUEMENT depuis la fournée d'origine — les autres fournées terminées
  // de la même recette ne proposent d'ailleurs pas ce formulaire une fois
  // qu'un avis existe (cf. BatchReview, `myReview.batch_id`).
  const { data: existing, error: readError } = await (admin as any)
    .from('comments')
    .select('id, batch_id, status')
    .eq('recipe_id', batch.recipe_id)
    .eq('user_id', userId)
    .maybeSingle();
  if (readError) {
    console.error('submitOrUpdateReview (lecture):', readError.message);
    return { ok: false, message: 'Erreur lors de la vérification de votre avis.' };
  }
  if (existing && (existing.batch_id !== batch.id || existing.status !== 'rejected')) {
    return { ok: false, message: 'Vous avez déjà donné votre avis sur cette recette.' };
  }

  // Contrôle IA. Best-effort assumé, comme la modération des pseudos : clé
  // absente, panne ou réponse illisible → score neutre, l'avis part quand
  // même en modération humaine (contrairement au pseudo, l'IA ne bloque
  // jamais la publication elle-même ici).
  let aiScore: number | null = null;
  let aiReason: string | null = null;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey && texte) {
    try {
      const { text } = await callClaude(
        apiKey,
        buildCommentModerationContent(rating, texte),
        200,
        12_000,
        COMMENT_MODERATION_MODEL,
        'disabled',
        COMMENT_MODERATION_SYSTEM_PROMPT,
      );
      const verdict = parseCommentModeration(parseStrictJson(text));
      aiScore = verdict.score;
      aiReason = verdict.motif;
      console.log(`[avis] score IA (${COMMENT_MODERATION_PROMPT_VERSION}) fournée #${batch.id} : ${aiScore} — ${aiReason}`);
    } catch (e) {
      console.error('[avis] contrôle IA indisponible :', (e as Error).message);
    }
  }

  const payload = {
    recipe_id: batch.recipe_id,
    batch_id: batch.id,
    user_id: userId,
    rating,
    content: texte,
    status: 'pending',
    rejection_reason: null,
    ai_score: aiScore,
    ai_reason: aiReason,
    photo_urls: photos,
  };

  const { error: writeError } = existing
    ? await (admin as any).from('comments').update(payload).eq('id', existing.id)
    : await (admin as any).from('comments').insert(payload);
  if (writeError) {
    console.error('submitOrUpdateReview (écriture):', writeError.message);
    return { ok: false, message: 'Erreur lors de l’enregistrement de votre avis.' };
  }
  return { ok: true };
}
