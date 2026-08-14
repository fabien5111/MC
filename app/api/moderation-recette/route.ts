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
import { getRecipeFull } from '@/lib/recipes';
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
  contextWindow,
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
import {
  buildReformulationSystemPrompt,
  buildReformulationUserContent,
  parseReformulationResult,
  reformulationScore,
} from '@/lib/ai/reformulation';

// Jusqu'à trois appels IA supplémentaires possibles (couche B) en plus de la
// modération et de la recherche externe : aligné sur /api/import-url pour la
// marge, largement suffisant en pratique (couche B s'arrête dès qu'une
// correspondance interne forte existe déjà).
export const maxDuration = 60;

// §6.4 : la recherche externe est coûteuse, on l'évite si l'étape 2 a déjà
// trouvé une correspondance rédactionnelle forte sur le site — même logique
// reprise pour la couche B ci-dessous.
const EXTERNAL_SEARCH_SKIP_THRESHOLD = 70;

// Seuil de présélection des candidats couche B (Jaccard sur les ingrédients
// canoniques, couche C) : volontairement bas — c'est le jugement Claude qui
// tranche ensuite entre reformulation réelle et simple parenté de plat.
const STRUCTURAL_CANDIDATE_THRESHOLD = 0.4;

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
function shingleIndexTable(client: any) {
  return client.from('recipe_shingle_index');
}

const nowIso = () => new Date().toISOString();
const pct = (v: number) => Math.round(v * 10000) / 100; // 0..1 → pourcentage, 2 décimales

// Modération (jusqu'à 40 s avec relance) + couche B (jusqu'à 3×15 s) +
// recherche externe (jusqu'à 40 s) peuvent dépasser en cumulé le
// `maxDuration = 60` de la route : Vercel tue alors la fonction au niveau
// plateforme, hors de tout try/catch — l'analyse reste bloquée en
// `en_cours` sans jamais atteindre `termine` ni `echec`. Un budget de temps
// global, vérifié avant chaque étape coûteuse et best-effort (couche B,
// recherche externe), garantit à la place que l'écriture finale a toujours
// lieu bien avant la coupure plateforme — au prix de sauter ces étapes si
// la modération et la relance ont déjà consommé le budget.
const HARD_DEADLINE_MS = 54_000; // marge sous maxDuration=60 pour l'écriture finale + la réponse
const MIN_BUDGET_COUCHE_B = 8_000; // sous ce seuil, mieux vaut sauter la couche B que la tronquer
// Sous ~20 s restantes, la recherche externe n'a aucune chance d'aboutir :
// mieux vaut la sauter franchement que dépenser des tokens pour un appel
// certain d'être interrompu.
const MIN_BUDGET_EXTERNAL = 20_000;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (await isReadOnlySession()) return NextResponse.json({ erreur: 'Session de consultation.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const recipeId = typeof body?.recipeId === 'string' ? body.recipeId : null;
  if (!recipeId) return NextResponse.json({ erreur: 'recipeId requis.' }, { status: 400 });
  // « Relancer l'analyse » (§10) doit forcer une nouvelle analyse même sans
  // changement de contenu — c'est tout l'intérêt d'une relance manuelle.
  // Sans ce drapeau, le cache par empreinte (ci-dessous) renvoyait l'ancien
  // résultat en quelques centaines de ms sans rien recalculer.
  const force = body?.force === true;

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
  // Contourné par une relance manuelle explicite (`force`).
  if (!force) {
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
  const routeStart = Date.now();
  const remainingBudget = () => HARD_DEADLINE_MS - (Date.now() - routeStart);

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

    // --- Étape 2 (§6.3) : similarité interne, via l'index persisté plutôt
    // qu'un balayage du corpus (recipe_shingle_index, maintenu à la
    // publication/dépublication — voir /api/reindex-recette). Best-effort —
    // une erreur ici ne doit pas invalider la modération déjà obtenue.
    let editorialMax = 0;
    let structuralMax = 0;
    let matches: {
      source_type: string;
      source_recipe_id: string;
      source_title: string | null;
      editorial_score: number;
      structural_score: number;
      longest_common_sequence: number | null;
      matched_excerpts: { extrait_soumis: string; extrait_source: string; commun?: string }[];
      detection_method: string | null;
    }[] = [];

    // Réutilisés par la couche A ci-dessous et la couche B plus loin (§6.3).
    const candidateEditorial = buildEditorialText(recipe);
    const candidateStructuralKeys = buildStructuralSignature(recipe).ingredients.map((i) => i.canonicalKey);

    try {
      const candidateShingles = buildShingles(candidateEditorial);

      // Index inversé (§6.3) : `overlaps` (opérateur `&&`, servi par le GIN
      // sur `shingles`) ne remonte que les recettes publiées qui partagent
      // au moins un shingle — pas de balayage du corpus entier.
      const { data: candidatesRaw } = await shingleIndexTable(admin)
        .select('recipe_id, editorial_text, shingles, structural_keys')
        .neq('recipe_id', recipeId)
        .overlaps('shingles', Array.from(candidateShingles));

      const indexCandidates = (candidatesRaw ?? []) as {
        recipe_id: string;
        editorial_text: string;
        shingles: string[];
        structural_keys: string[];
      }[];

      const scored = indexCandidates
        .map((c) => ({ c, jaccard: jaccardIndex(candidateShingles, new Set(c.shingles)) }))
        .filter((s) => s.jaccard > 0)
        .sort((a, b) => b.jaccard - a.jaccard)
        .slice(0, 5); // top 5, convention reprise de la recherche externe (§6.4)

      // Les titres ne sont pas dans l'index (pas nécessaires à la
      // comparaison elle-même) : une requête complémentaire, limitée aux
      // quelques recettes retenues, pour l'affichage admin.
      const titleById = new Map<string, string>();
      if (scored.length) {
        const { data: titles } = await admin
          .from('recipes')
          .select('id, title')
          .in('id', scored.map((s) => s.c.recipe_id));
        for (const t of (titles ?? []) as { id: string; title: string }[]) titleById.set(t.id, t.title);
      }

      matches = scored.map((s) => {
        const seq = longestCommonWordRun(candidateEditorial, s.c.editorial_text);
        const structScore = jaccardIndex(new Set(candidateStructuralKeys), new Set(s.c.structural_keys));
        // Vue comparative (§9) : un contexte de part et d'autre du passage
        // commun, pas seulement le fragment nu — les deux textes diffèrent
        // hors du passage identique, contrairement à un simple extrait
        // dupliqué des deux côtés.
        const excerpts =
          seq.length > 0
            ? [
                {
                  extrait_soumis: contextWindow(candidateEditorial, seq.startA, seq.length),
                  extrait_source: contextWindow(s.c.editorial_text, seq.startB, seq.length),
                  commun: seq.words.join(' '),
                },
              ]
            : [];
        return {
          source_type: 'interne',
          source_recipe_id: s.c.recipe_id,
          source_title: titleById.get(s.c.recipe_id) ?? null,
          editorial_score: pct(s.jaccard),
          structural_score: pct(structScore),
          longest_common_sequence: seq.length,
          matched_excerpts: excerpts,
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

    // --- Couche B (approximation, arbitrage produit — pas de fournisseur
    // d'embeddings) : jugement Claude ciblé sur les candidats structurellement
    // proches (couche C) que la couche A n'a pas déjà détectés comme copie
    // littérale — détecte une recette recopiée puis reformulée. Sautée si la
    // couche A a déjà trouvé une correspondance forte (même logique que la
    // recherche externe, §6.4). Best-effort.
    if (editorialMax < EXTERNAL_SEARCH_SKIP_THRESHOLD && remainingBudget() >= MIN_BUDGET_COUCHE_B) {
      try {
        const { data: structRows } = await shingleIndexTable(admin)
          .select('recipe_id, editorial_text, structural_keys')
          .neq('recipe_id', recipeId);

        const alreadyMatched = new Set(matches.map((m) => m.source_recipe_id));
        const structCandidates = ((structRows ?? []) as { recipe_id: string; editorial_text: string; structural_keys: string[] }[])
          .filter((r) => !alreadyMatched.has(r.recipe_id))
          .map((r) => ({ r, structScore: jaccardIndex(new Set(candidateStructuralKeys), new Set(r.structural_keys)) }))
          .filter((s) => s.structScore >= STRUCTURAL_CANDIDATE_THRESHOLD)
          .sort((a, b) => b.structScore - a.structScore)
          .slice(0, 3); // coût maîtrisé : jamais plus de 3 jugements Claude par analyse

        if (structCandidates.length) {
          const { data: titles } = await admin
            .from('recipes')
            .select('id, title')
            .in('id', structCandidates.map((s) => s.r.recipe_id));
          const titleById = new Map(((titles ?? []) as { id: string; title: string }[]).map((t) => [t.id, t.title]));

          const reformulationMatches: typeof matches = [];
          for (const cand of structCandidates) {
            // Budget réévalué à chaque itération : un candidat de plus ne
            // doit jamais faire franchir l'échéance globale.
            if (remainingBudget() < MIN_BUDGET_COUCHE_B) break;
            const judged = await callClaude(
              apiKey,
              buildReformulationUserContent(candidateEditorial, cand.r.editorial_text),
              500,
              Math.min(15_000, remainingBudget() - 3_000),
              MODERATION_MODEL,
              'disabled',
              buildReformulationSystemPrompt(),
            );
            call.usage.inputTokens += judged.usage.inputTokens;
            call.usage.outputTokens += judged.usage.outputTokens;
            call.usage.cacheReadTokens += judged.usage.cacheReadTokens;
            call.usage.cacheWriteTokens += judged.usage.cacheWriteTokens;

            const parsed2 = parseReformulationResult(judged.text);
            if (parsed2?.reformulation) {
              reformulationMatches.push({
                source_type: 'interne',
                source_recipe_id: cand.r.recipe_id,
                source_title: titleById.get(cand.r.recipe_id) ?? null,
                // Score par jugement du modèle, pas mesuré comme la couche A
                // — même logique que les correspondances externes (lot 4).
                editorial_score: reformulationScore(parsed2.confiance),
                structural_score: pct(cand.structScore),
                longest_common_sequence: null,
                matched_excerpts: parsed2.extraitA
                  ? [{ extrait_soumis: parsed2.extraitA, extrait_source: parsed2.extraitB }]
                  : [],
                detection_method: 'embedding', // couche du §6.3, approximée par jugement plutôt que par cosinus
              });
            }
          }

          if (reformulationMatches.length) {
            await matchTable(admin).insert(reformulationMatches.map((m) => ({ ...m, analysis_id: analysisId })));
            matches.push(...reformulationMatches);
          }
        }
      } catch (reformError) {
        console.error('moderation-recette (couche B):', (reformError as Error).message);
      }
    }

    editorialMax = matches.reduce((max, m) => Math.max(max, m.editorial_score), 0);
    structuralMax = matches.reduce((max, m) => Math.max(max, m.structural_score), 0);
    const longestSequence = matches.reduce((max, m) => Math.max(max, m.longest_common_sequence ?? 0), 0);

    // --- Étape 3 (§6.4) : recherche externe, sauf correspondance interne
    // déjà forte. Best-effort — un incident réseau ne doit pas invalider la
    // modération et la similarité interne déjà obtenues.
    let externalNote: string | undefined;
    let searchesUsed = 0;
    let externalMatchCount = 0;
    if (editorialMax < EXTERNAL_SEARCH_SKIP_THRESHOLD && remainingBudget() < MIN_BUDGET_EXTERNAL) {
      externalNote = 'Vérification externe non effectuée (budget de temps épuisé par les étapes précédentes).';
    } else if (editorialMax < EXTERNAL_SEARCH_SKIP_THRESHOLD) {
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
            // Plafond absolu (seul garde-fou, cf. callClaudeWithWebSearch) :
            // tout le budget restant moins la marge de l'écriture finale.
            // C'est lui qui garantit que la route rend la main avant que la
            // plateforme ne tue la fonction.
            Math.max(0, remainingBudget() - 4_000),
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
              matched_excerpts: [{ extrait_soumis: m.phrase, extrait_source: m.extrait, commun: m.phrase }],
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
