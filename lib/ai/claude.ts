// Appel à l'API Claude + parsing JSON strict, partagés par les routes IA.
// La clé ANTHROPIC_API_KEY vit uniquement dans les variables d'environnement.

export const IMPORT_MODEL = process.env.IMPORT_MODEL || 'claude-sonnet-5';

export function parseStrictJson(text: string): unknown {
  let t = String(text || '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start > 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

export async function callClaude(
  apiKey: string,
  userContent: string,
  maxTokens: number,
): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
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
  const data = (await r.json()) as { content?: Array<{ type: string; text: string }> };
  return (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}
