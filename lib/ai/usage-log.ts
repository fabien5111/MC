// Écriture du journal de consommation IA (`ai_usage`) — SERVEUR uniquement
// (tire `lib/supabase/admin`, donc pas dans le bundle client). Pendant de
// `lib/ai/claude.ts`, qui reste pur : ce fichier est le seul à savoir écrire
// en base, `claude.ts` ne fait que collecter.
//
// Best-effort ABSOLU, même doctrine que la modération de pseudo/avis : un
// échec d'écriture du journal ne doit jamais faire échouer la réponse à
// l'utilisateur. Le coût est un dommage collatéral acceptable ; une route
// cassée ne l'est pas.
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import type { AppelIa, UsageSink } from '@/lib/ai/claude';

// `ai_usage` n'est pas encore dans lib/database.types.ts tant que la
// migration n'a pas été appliquée en base puis régénérée (npm run gen:types)
// — accès non typé en attendant, même motif que `recipe_scale_costs` avant
// elle (cf. app/api/scale-recipe/route.ts).
type LigneAiUsage = {
  user_id: string | null;
  feature: string;
  model: string;
  request_id: string | null;
  status: 'success' | 'api_error' | 'app_error';
  error_code: string | null;
  input_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  output_tokens: number;
  web_searches: number;
  latency_ms: number;
  ref_table: string | null;
  ref_id: string | null;
};

// Rattache la ligne à l'objet métier (l'import, la recette analysée…) pour
// reconstituer une action à partir de plusieurs lignes d'appel — cf.
// `ai_usage`, une ligne par appel API et non par action (§7 de la spec).
export type RefAppelIa = { table: string; id: string | number };

/**
 * Fabrique un collecteur à passer en dernier paramètre de `callClaude` /
 * `callClaudeWithWebSearch`. `appels` accumule chaque tentative — succès ET
 * échec, retries compris — jusqu'à l'appel de `enregistrerAppelsIa`.
 */
export function collecteurAppelsIa(): { sink: UsageSink; appels: AppelIa[] } {
  const appels: AppelIa[] = [];
  return { sink: (appel) => appels.push(appel), appels };
}

/**
 * Écrit les appels collectés dans `ai_usage`. `feature` doit correspondre à
 * un code de `ai_features` (cf. migration). `userId` à `null` pour un appel
 * sans session (modération de pseudo à l'inscription par e-mail, avant
 * création du compte).
 *
 * Best-effort : n'importe quelle erreur (clé absente, RLS, réseau) est
 * journalisée en console et avalée. Ne JAMAIS laisser cette fonction
 * remonter — l'appelant ne doit pas avoir à l'entourer d'un try/catch.
 */
export async function enregistrerAppelsIa(
  feature: string,
  userId: string | null,
  appels: AppelIa[],
  ref?: RefAppelIa,
): Promise<void> {
  if (!appels.length) return;
  try {
    const supabase = createAdminClient();
    const lignes: LigneAiUsage[] = appels.map((a) => ({
      user_id: userId,
      feature,
      model: a.model,
      request_id: a.requestId,
      status: a.status,
      error_code: a.errorCode,
      input_tokens: a.usage.inputTokens,
      cache_creation_tokens: a.usage.cacheWriteTokens,
      cache_read_tokens: a.usage.cacheReadTokens,
      output_tokens: a.usage.outputTokens,
      web_searches: a.searches,
      latency_ms: a.latencyMs,
      ref_table: ref?.table ?? null,
      ref_id: ref != null ? String(ref.id) : null,
    }));
    const { error } = await (supabase.from('ai_usage' as any) as ReturnType<typeof supabase.from>).insert(
      lignes as never,
    );
    if (error) console.error(`[ai-usage] écriture (${feature}) :`, error.message);
  } catch (e) {
    if (e instanceof MissingServiceKeyError) {
      console.warn(`[ai-usage] SUPABASE_SERVICE_ROLE_KEY absente : coût de "${feature}" non journalisé.`);
      return;
    }
    console.error(`[ai-usage] écriture (${feature}) :`, (e as Error).message);
  }
}
