// Route Handler — modération de contenu à la validation d'une recette
// (étape 1 de la spec « Contrôle IA à la validation des recettes », §6.2).
// Appelée automatiquement à la soumission pour publication publique
// (CreerForm, en tâche de fond) et manuellement depuis l'admin (bouton
// « Relancer l'analyse »). N'attend jamais la fin de l'analyse pour bloquer
// la soumission de l'utilisateur (§5).
import { NextResponse } from 'next/server';
import { getCurrentUser, isManager } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRecipeFull } from '@/lib/recipes';
import { recipeContentFingerprint } from '@/lib/recipe-analysis';
import { callClaude, MODERATION_MODEL } from '@/lib/ai/claude';
import {
  MODERATION_PROMPT_VERSION,
  MODERATION_SYSTEM_PROMPT,
  buildModerationSource,
  buildModerationUserContent,
  moderationSourceText,
  parseModerationJson,
  verifyExtraits,
  moderationFlag,
  type ModerationResult,
} from '@/lib/ai/moderation';

export const maxDuration = 30;

// `recipe_analysis` est absente de lib/database.types.ts tant que la
// migration du lot 1 n'a pas été appliquée en base puis régénérée
// (`npm run gen:types`) — jamais éditée à la main (cf. CLAUDE.md). En
// attendant, accès non typé sur cette seule table, comme `RecipeFull` le
// fait déjà pour d'autres jointures non régénérées (lib/recipes.ts).
type AnalysisRow = { id: number };

// `any` volontaire : table absente des types générés tant que la migration
// du lot 1 n'a pas été régénérée (`npm run gen:types`, cf. commentaire plus haut).
function analysisTable(client: any) {
  return client.from('recipe_analysis');
}

const nowIso = () => new Date().toISOString();

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (await isReadOnlySession()) return NextResponse.json({ erreur: 'Session de consultation.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const recipeId = typeof body?.recipeId === 'string' ? body.recipeId : null;
  if (!recipeId) return NextResponse.json({ erreur: 'recipeId requis.' }, { status: 400 });

  const recipe = await getRecipeFull(recipeId);
  if (!recipe) return NextResponse.json({ erreur: 'Recette introuvable.' }, { status: 404 });

  // Déclenchée par l'auteur à sa propre soumission, ou par un admin/gestionnaire
  // depuis la file de modération (relance manuelle, §10).
  const autorise = recipe.author_id === user.id || (await isManager(user.id));
  if (!autorise) return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 403 });

  const admin = createAdminClient();
  const hash = recipeContentFingerprint(recipe);

  // Cache par empreinte de contenu (§6.4, cas de test #11) : une recette
  // resoumise sans modification du texte ne relance pas l'IA — coût nul.
  const { data: existing } = await analysisTable(admin)
    .select('id')
    .eq('recipe_id', recipeId)
    .eq('recipe_content_hash', hash)
    .eq('status', 'termine')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ analysisId: (existing as AnalysisRow).id, cached: true });
  }

  const { data: inserted, error: insertError } = await analysisTable(admin)
    .insert({ recipe_id: recipeId, recipe_content_hash: hash, status: 'en_cours' })
    .select('id')
    .single();
  if (insertError || !inserted) {
    console.error('moderation-recette (insert):', insertError?.message);
    return NextResponse.json({ erreur: "Impossible de créer l'analyse." }, { status: 500 });
  }
  const analysisId = (inserted as AnalysisRow).id;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // §10 : jamais laissé passer en file normale par défaut — l'admin verra
    // « analyse indisponible, vérification manuelle requise ».
    await analysisTable(admin)
      .update({ status: 'echec', error_message: "ANTHROPIC_API_KEY non configurée sur le serveur.", completed_at: nowIso() })
      .eq('id', analysisId);
    return NextResponse.json({ analysisId, erreur: 'Analyse indisponible (clé API absente).' });
  }

  const source = buildModerationSource(recipe);
  const sourceText = moderationSourceText(source);

  try {
    let call = await callClaude(
      apiKey,
      buildModerationUserContent(source),
      1500,
      20_000,
      MODERATION_MODEL,
      'disabled',
      MODERATION_SYSTEM_PROMPT,
    );
    let parsed = parseModerationJson(call.text);

    if (!parsed.ok) {
      // Une seule relance en cas d'échec de parsing, puis échec (annexe A.6).
      const retry = await callClaude(
        apiKey,
        buildModerationUserContent(source),
        1500,
        20_000,
        MODERATION_MODEL,
        'disabled',
        MODERATION_SYSTEM_PROMPT,
      );
      call = { text: retry.text, usage: { ...call.usage } };
      call.usage.inputTokens += retry.usage.inputTokens;
      call.usage.outputTokens += retry.usage.outputTokens;
      call.usage.cacheReadTokens += retry.usage.cacheReadTokens;
      call.usage.cacheWriteTokens += retry.usage.cacheWriteTokens;
      parsed = parseModerationJson(retry.text);
    }

    if (!parsed.ok) {
      await analysisTable(admin)
        .update({ status: 'echec', error_message: parsed.error, completed_at: nowIso() })
        .eq('id', analysisId);
      return NextResponse.json({ analysisId, erreur: 'Analyse indisponible (réponse IA invalide).' });
    }

    const verified: ModerationResult = verifyExtraits(parsed.result, sourceText);
    const flag = moderationFlag(verified.verdict);

    await analysisTable(admin)
      .update({
        status: 'termine',
        moderation_verdict: verified.verdict,
        moderation_details: { categories: verified.categories },
        moderation_prompt_version: MODERATION_PROMPT_VERSION,
        overall_flag: flag,
        cost_tokens: call.usage.inputTokens + call.usage.outputTokens,
        completed_at: nowIso(),
      })
      .eq('id', analysisId);

    return NextResponse.json({ analysisId, verdict: verified.verdict, flag });
  } catch (e) {
    await analysisTable(admin)
      .update({ status: 'echec', error_message: (e as Error).message, completed_at: nowIso() })
      .eq('id', analysisId);
    console.error('moderation-recette:', (e as Error).message);
    return NextResponse.json({ analysisId, erreur: 'Analyse indisponible.' });
  }
}
