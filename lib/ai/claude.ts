// Appel à l'API Claude + parsing JSON strict, partagés par les routes IA.
// La clé ANTHROPIC_API_KEY vit uniquement dans les variables d'environnement.

export const IMPORT_MODEL = process.env.IMPORT_MODEL || 'claude-sonnet-5';

// Consommation réelle renvoyée par l'API à chaque appel (bloc `usage`). Sert à
// calculer le coût exact d'un import plutôt que de l'estimer (cf. lib/ai/cost.ts).
export type ClaudeUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type ClaudeCall = { text: string; usage: ClaudeUsage };

export const EMPTY_USAGE: ClaudeUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

// Cumul des consommations : un import peut déclencher plusieurs appels
// (relance JSON invalide, relance extraction incomplète), tous facturés.
export function addUsage(a: ClaudeUsage, b: ClaudeUsage): ClaudeUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

export function parseStrictJson(text: string): unknown {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start > 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

// Délai maximal par défaut d'un appel. Sans garde-fou, un appel qui ne répond
// pas laisse la fonction serverless tourner jusqu'à ce que l'hébergeur la tue
// (504 opaque côté navigateur, sans passer par nos messages d'erreur). Les
// routes qui ont un `maxDuration` plus court passent leur propre valeur.
export const TIMEOUT_MS = 45_000;

export async function callClaude(
  apiKey: string,
  userContent: string,
  maxTokens: number,
  timeoutMs: number = TIMEOUT_MS,
): Promise<ClaudeCall> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: IMPORT_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    if (!r.ok) {
      throw new Error(`API Claude : HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
    }
    const data = (await r.json()) as {
      content?: Array<{ type: string; text: string }>;
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    };
    const u = data.usage ?? {};
    return {
      text: (data.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join(''),
      usage: {
        inputTokens: u.input_tokens ?? 0,
        outputTokens: u.output_tokens ?? 0,
        cacheReadTokens: u.cache_read_input_tokens ?? 0,
        cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
      },
    };
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      // `code` permet aux routes de distinguer ce cas et d'expliquer la panne
      // à l'utilisateur, au lieu d'un échec générique.
      throw Object.assign(
        new Error(`API Claude : aucune réponse au bout de ${Math.round(timeoutMs / 1000)} s (appel interrompu).`),
        { code: 'TIMEOUT' },
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
