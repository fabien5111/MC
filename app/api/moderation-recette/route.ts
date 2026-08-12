// Route Handler — contrôle IA à la validation d'une recette : modération de
// contenu (étape 1, §6.2, annexe A), similarité interne (étape 2, §6.3
// couche A + proxy couche C) puis recherche externe (étape 3, §6.4 — sauf
// correspondance interne déjà forte). Appelée automatiquement à la
// soumission pour publication publique (CreerForm, en tâche de fond) et
// manuellement depuis l'admin (bouton « Relancer l'analyse »). N'attend
// jamais la fin de l'analyse pour bloquer la soumission de l'utilisateur (§5).
import { NextResponse } from 'next/server';
import { getCurrentUser, isManager } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRecipeFull, getPublishedRecipesCorpus } from '@/lib/recipes';
import { siteUrl } from '@/lib/site-url';
import { buildEditorialText, buildStructuralSignature, recipeContentFingerprint } from '@/lib/recipe-analysis';
import { callClaude, callClaudeWithWebSearch, MODERATION_MODEL } from '@/lib/ai/claude';
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
import {
  buildShingles,
  jaccardIndex,
  longestCommonWordRun,
  structuralJaccard,
  similarityFlag,
  combineFlags,
} from '@/lib/ai/similarity';
import {
  extractSignaturePhrases,
  buildExternalSearchSystemPrompt,
  buildExternalSearchUserContent,
  parseExternalMatches,
  confidenceScore,
} from '@/lib/ai/external-search';

// Deux appels IA séquentiels (modération puis, souvent, recherche externe) :
// aligné sur /api/import-url, la route la plus longue existante.
export const maxDuration = 60;

// §6.4 : la recherche externe est coûteuse, on l'évite si l'étape 2 a déjà
// trouvé une correspondance rédactionnelle forte sur le site.
const EXTERNAL_SEARCH_SKIP_THRESHOLD = 70;

// `recipe_analysis` / `recipe_similarity_match` sont absentes de
// lib/database.types.ts tant que la migration du lot 1 n'a pas été
// appliquée en base puis régénérée (`npm run gen:types`) — jamais éditées à
// la main (cf. CLAUDE.md). Accès non typé sur ces deux tables en attendant,
// comme `RecipeFull` le fait déjà pour d'autres jointures non régénérées
// (lib/recipes.ts).
type AnalysisRow = { id: number };

function analysisTable(client: any) {
  return client.from('recipe_analysis');
}
function matchTable(client: any) {
  return client.from('recipe_similarity_match');
}

const nowIso = () => new Date().toISOString();
const pct = (v: number) => Math.round(v * 10000) / 100; // 0..1 → pourcentage, 2 décimales

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
  // resoumise sans modification du texte ne relance pas l'analyse — coût nul.
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

    // --- Étape 2 (§6.3) : similarité interne contre le corpus publié.
    // Best-effort — une erreur ici ne doit pas invalider la modération déjà
    // obtenue (le rapport reste utile sans le volet similarité).
    let editorialMax = 0;
    let structuralMax = 0;
    let matches: {
      source_type: string;
      source_recipe_id: string;
      source_title: string | null;
      editorial_score: number;
      structural_score: number;
      longest_common_sequence: number;
      matched_excerpts: { extrait_soumis: string; extrait_source: string }[];
      detection_method: string;
    }[] = [];

    try {
      const candidateEditorial = buildEditorialText(recipe);
      const candidateStructural = buildStructuralSignature(recipe).ingredients;
      const candidateShingles = buildShingles(candidateEditorial);

      const corpus = await getPublishedRecipesCorpus(recipeId);
      const scored = corpus
        .map((other) => {
          const otherEditorial = buildEditorialText(other);
          return { recipe: other, otherEditorial, jaccard: jaccardIndex(candidateShingles, buildShingles(otherEditorial)) };
        })
        .filter((s) => s.jaccard > 0)
        .sort((a, b) => b.jaccard - a.jaccard)
        .slice(0, 5); // top 5, convention reprise de la recherche externe (§6.4)

      matches = scored.map((s) => {
        const seq = longestCommonWordRun(candidateEditorial, s.otherEditorial);
        const structScore = structuralJaccard(candidateStructural, buildStructuralSignature(s.recipe).ingredients);
        const excerpt = seq.words.join(' ');
        return {
          source_type: 'interne',
          source_recipe_id: s.recipe.id,
          source_title: s.recipe.title,
          editorial_score: pct(s.jaccard),
          structural_score: pct(structScore),
          longest_common_sequence: seq.length,
          matched_excerpts: excerpt ? [{ extrait_soumis: excerpt, extrait_source: excerpt }] : [],
          detection_method: 'shingles',
        };
      });

      editorialMax = matches.reduce((max, m) => Math.max(max, m.editorial_score), 0);
      structuralMax = matches.reduce((max, m) => Math.max(max, m.structural_score), 0);

      if (matches.length) {
        await matchTable(admin).insert(matches.map((m) => ({ ...m, analysis_id: analysisId })));
      }
    } catch (simError) {
      console.error('moderation-recette (similarité):', (simError as Error).message);
    }

    const longestSequence = matches.reduce((max, m) => Math.max(max, m.longest_common_sequence), 0);

    // --- Étape 3 (§6.4) : recherche externe, sauf correspondance interne
    // déjà forte. Best-effort — un incident réseau ne doit pas invalider la
    // modération et la similarité interne déjà obtenues.
    let externalNote: string | undefined;
    let searchesUsed = 0;
    let externalMatchCount = 0;
    if (editorialMax < EXTERNAL_SEARCH_SKIP_THRESHOLD) {
      try {
        const phrases = extractSignaturePhrases(recipe);
        if (!phrases.length) {
          externalNote = 'Texte trop générique pour une recherche externe fiable.';
        } else {
          const own = new URL(siteUrl()).hostname;
          const webCall = await callClaudeWithWebSearch(
            apiKey,
            buildExternalSearchUserContent(phrases),
            buildExternalSearchSystemPrompt(),
            1500,
            25_000,
            undefined,
            [own],
          );
          searchesUsed = webCall.searches;
          call.usage.inputTokens += webCall.usage.inputTokens;
          call.usage.outputTokens += webCall.usage.outputTokens;
          call.usage.cacheReadTokens += webCall.usage.cacheReadTokens;
          call.usage.cacheWriteTokens += webCall.usage.cacheWriteTokens;

          const externalMatches = parseExternalMatches(webCall.text);
          if (externalMatches.length) {
            const rows = externalMatches.map((m) => ({
              analysis_id: analysisId,
              source_type: 'externe',
              source_url: m.url,
              source_title: m.titre,
              // Estimation par jugement du modèle (pas de calcul déterministe
              // faute de couche B — voir lib/ai/external-search.ts), affichée
              // comme telle dans l'admin plutôt que comme un pourcentage mesuré.
              editorial_score: confidenceScore(m.confiance),
              structural_score: 0,
              longest_common_sequence: null,
              matched_excerpts: [{ extrait_soumis: m.phrase, extrait_source: m.extrait }],
              detection_method: null,
            }));
            await matchTable(admin).insert(rows);
            editorialMax = Math.max(editorialMax, ...rows.map((r) => r.editorial_score));
            externalMatchCount = rows.length;
          }
        }
      } catch (extError) {
        externalNote = 'Vérification externe non effectuée.';
        console.error('moderation-recette (recherche externe):', (extError as Error).message);
      }
    }

    const flag = combineFlags(moderationFlag(verified.verdict), similarityFlag(editorialMax, longestSequence));

    await analysisTable(admin)
      .update({
        status: 'termine',
        moderation_verdict: verified.verdict,
        moderation_details: { categories: verified.categories, ...(externalNote ? { external_note: externalNote } : {}) },
        moderation_prompt_version: MODERATION_PROMPT_VERSION,
        editorial_similarity_max: editorialMax,
        structural_similarity_max: structuralMax,
        overall_flag: flag,
        cost_tokens: call.usage.inputTokens + call.usage.outputTokens,
        cost_searches: searchesUsed,
        completed_at: nowIso(),
      })
      .eq('id', analysisId);

    return NextResponse.json({ analysisId, verdict: verified.verdict, flag, matches: matches.length + externalMatchCount });
  } catch (e) {
    await analysisTable(admin)
      .update({ status: 'echec', error_message: (e as Error).message, completed_at: nowIso() })
      .eq('id', analysisId);
    console.error('moderation-recette:', (e as Error).message);
    return NextResponse.json({ analysisId, erreur: 'Analyse indisponible.' });
  }
}
