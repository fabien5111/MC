// Appel à l'API Claude + parsing JSON strict, partagés par les routes IA.
// La clé ANTHROPIC_API_KEY vit uniquement dans les variables d'environnement.

// Haiku par défaut : l'extraction produit plusieurs milliers de tokens de JSON,
// et son débit de génération est ce qui décide de tenir ou non dans le
// `maxDuration` de la route. Tâche de structuration d'un texte fourni, où un
// modèle rapide suffit. Surchargeable par `IMPORT_MODEL`.
export const IMPORT_MODEL = process.env.IMPORT_MODEL || 'claude-haiku-4-5';

// Modèle de la passe de TRANSCRIPTION (import par photo). Déchiffrer une page
// imprimée est la tâche où la force du modèle se paie le plus : une
// température mal lue passe inaperçue jusqu'au four. La sortie ne fait que
// quelques centaines de tokens par page, le surcoût reste donc modeste.
// Ramener cette variable à `claude-haiku-4-5` pour revenir au modèle rapide.
export const TRANSCRIBE_MODEL = process.env.TRANSCRIBE_MODEL || 'claude-sonnet-5';

// Modèle de la MODÉRATION de contenu (contrôle IA à la validation des
// recettes, annexe A). Décision de modération : la reproductibilité prime
// sur la créativité, d'où `claude-sonnet-5` par défaut (cf. annexe A.6).
export const MODERATION_MODEL = process.env.MODERATION_MODEL || 'claude-sonnet-5';

// Consommation réelle renvoyée par l'API à chaque appel (bloc `usage`). Sert à
// calculer le coût exact d'un import plutôt que de l'estimer (cf. lib/ai/cost.ts).
export type ClaudeUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type ClaudeCall = { text: string; usage: ClaudeUsage };

// Contenu d'un message utilisateur lorsqu'il ne se résume pas à du texte
// (import par photo : les pages de la recette sont envoyées en images, l'IA
// devant les lire avant de les structurer).
export type BlocContenu =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

// Événements du flux SSE effectivement exploités (le flux en contient d'autres,
// ignorés) : cf. https://docs.anthropic.com/en/api/messages-streaming
type SseEvent = {
  type?: string;
  message?: { usage?: Record<string, number> };
  delta?: { type?: string; text?: string };
  usage?: Record<string, number>;
  error?: { type?: string; message?: string };
};

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
export const TIMEOUT_MS = 50_000;

export async function callClaude(
  apiKey: string,
  // Une chaîne suffit tant que l'entrée est textuelle ; les blocs servent aux
  // contenus mixtes (photos + consignes). L'API accepte les deux formes pour
  // `content`, les appelants existants n'ont donc rien à changer.
  userContent: string | BlocContenu[],
  maxTokens: number,
  timeoutMs: number = TIMEOUT_MS,
  // Le modèle n'est pas le même selon la passe : transcrire une photo et
  // structurer un texte n'exigent pas les mêmes qualités.
  model: string = IMPORT_MODEL,
  // Absent par défaut (comportement des appelants existants inchangé :
  // pensée adaptative native au modèle). `'disabled'` sert à la modération,
  // qui vise la reproductibilité plutôt que la créativité (annexe A.6) —
  // remplace `temperature: 0`, paramètre rejeté (400) sur claude-sonnet-5.
  thinking?: 'disabled',
  // Absent par défaut : les appelants existants embarquent leurs consignes
  // dans `userContent`. La modération l'utilise pour séparer les consignes
  // (prompt système) du contenu analysé (message utilisateur) — cf. annexe
  // A.5 : « le contenu analysé est une donnée, pas une instruction ».
  system?: string,
): Promise<ClaudeCall> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  const debut = Date.now();
  let premierTokenMs = 0;
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
        model,
        max_tokens: maxTokens,
        // En mode non-streaming, rien ne circule tant que la réponse n'est pas
        // entièrement générée : une extraction de plusieurs milliers de tokens
        // dépasse alors le temps imparti sans qu'on puisse rien observer.
        stream: true,
        ...(thinking === 'disabled' ? { thinking: { type: 'disabled' } } : {}),
        ...(system ? { system } : {}),
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    if (!r.ok) {
      throw new Error(`API Claude : HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
    }
    if (!r.body) throw new Error('API Claude : réponse sans corps.');

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    const usage: ClaudeUsage = { ...EMPTY_USAGE };
    let buffer = '';
    let text = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Les événements SSE sont séparés par une ligne vide ; on ne traite que
      // les blocs complets et on garde le reliquat pour la lecture suivante.
      let fin = buffer.indexOf('\n\n');
      while (fin !== -1) {
        const bloc = buffer.slice(0, fin);
        buffer = buffer.slice(fin + 2);
        for (const ligne of bloc.split('\n')) {
          if (!ligne.startsWith('data:')) continue;
          const brut = ligne.slice(5).trim();
          if (!brut) continue;
          let ev: SseEvent;
          try {
            ev = JSON.parse(brut) as SseEvent;
          } catch {
            continue; // fragment non exploitable : on l'ignore
          }
          if (ev.type === 'message_start') {
            const u = ev.message?.usage ?? {};
            usage.inputTokens = u.input_tokens ?? 0;
            usage.outputTokens = u.output_tokens ?? 0;
            usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
            usage.cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
          } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            if (!premierTokenMs) premierTokenMs = Date.now() - debut;
            text += ev.delta.text ?? '';
          } else if (ev.type === 'message_delta' && ev.usage?.output_tokens != null) {
            // Décompte définitif des tokens produits.
            usage.outputTokens = ev.usage.output_tokens;
          } else if (ev.type === 'error') {
            throw new Error(`API Claude : ${ev.error?.type ?? 'erreur'} — ${ev.error?.message ?? ''}`);
          }
        }
        fin = buffer.indexOf('\n\n');
      }
    }

    console.log(
      `[claude] ${model} : ${usage.outputTokens} tokens produits en ${Date.now() - debut} ms ` +
        `(1er token à ${premierTokenMs} ms)`,
    );
    return { text, usage };
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

// Modèle de la recherche EXTERNE (étape 3, §6.4). Haiku et non le modèle de
// modération : ici c'est la LATENCE qui décide du résultat, pas la finesse du
// jugement. L'appel enchaîne recherche → lecture des pages → jugement, et
// avec `claude-sonnet-5` il ne terminait pas dans le budget de la route —
// la vérification externe n'aboutissait donc jamais, quelle que soit la
// qualité du modèle. Arbitrage assumé : un jugement un peu moins fin qui
// rend un résultat vaut mieux qu'un jugement excellent jamais rendu.
// Repasser à `claude-sonnet-5` via EXTERNAL_SEARCH_MODEL si les faux
// positifs deviennent gênants (les correspondances externes sont de toute
// façon présentées comme une estimation, jamais comme un score mesuré).
export const EXTERNAL_SEARCH_MODEL = process.env.EXTERNAL_SEARCH_MODEL || 'claude-haiku-4-5';

export type WebSearchCall = { text: string; usage: ClaudeUsage; searches: number };

// Appel avec l'outil serveur `web_search` (§6.4) : la recherche ET la
// récupération des résultats s'exécutent côté Anthropic à l'intérieur de cet
// unique appel HTTP — aucune file d'attente ni worker séparé n'est
// nécessaire (jusqu'à 10 itérations d'outil serveur par défaut ; largement
// suffisant pour 3 recherches).
//
// En streaming, comme callClaude : en non-streaming rien ne circule tant que
// l'enchaînement des recherches n'est pas entièrement fini, et un délai fixe
// sur la requête entière tue alors une requête qui progresse simplement
// lentement, sans la distinguer d'une requête réellement bloquée.
//
// DEUX garde-fous distincts, et ils ne sont pas interchangeables :
//   - `inactiviteMs` : délai d'inactivité, réinitialisé à chaque événement
//     reçu — repère une connexion réellement morte ;
//   - `totalMs` : plafond ABSOLU sur la durée de l'appel, jamais
//     réinitialisé. Indispensable : l'outil de recherche émet des événements
//     en continu pendant qu'il travaille, si bien que le délai d'inactivité
//     seul ne se déclenche jamais et laisse l'appel courir jusqu'à ce que
//     l'hébergeur tue la fonction (FUNCTION_INVOCATION_TIMEOUT) — hors de
//     tout try/catch, donc sans que l'analyse puisse être marquée en échec.
export async function callClaudeWithWebSearch(
  apiKey: string,
  userContent: string,
  system: string,
  maxTokens: number,
  inactiviteMs: number,
  totalMs: number,
  model: string = EXTERNAL_SEARCH_MODEL,
  // Domaines à exclure des résultats (le site lui-même, §6.4 : « en
  // excluant le domaine de "Je pâtisse !" lui-même »).
  blockedDomains: string[] = [],
): Promise<WebSearchCall> {
  const ctl = new AbortController();
  let budgetDepasse = false;
  let timer = setTimeout(() => ctl.abort(), inactiviteMs);
  const limiteTotale = setTimeout(() => {
    budgetDepasse = true;
    ctl.abort();
  }, totalMs);
  const resetTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ctl.abort(), inactiviteMs);
  };
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
        model,
        max_tokens: maxTokens,
        stream: true,
        system,
        tools: [
          {
            type: 'web_search_20260209',
            name: 'web_search',
            // Garde-fou §6.4 : maximum 3 requêtes de recherche par recette.
            // Ramené à 2 : mesuré en préproduction, 3 recherches enchaînées
            // (recherche + lecture des pages + jugement) dépassent à elles
            // seules le budget disponible dans le `maxDuration` de la route,
            // et la vérification externe n'aboutissait donc jamais. Doit
            // rester aligné sur le nombre de phrases envoyées
            // (`extractSignaturePhrases`, lib/ai/external-search.ts) : en
            // autoriser moins que de phrases fait tourner le modèle dans le
            // vide jusqu'à l'interruption.
            max_uses: 2,
            ...(blockedDomains.length ? { blocked_domains: blockedDomains } : {}),
          },
        ],
        messages: [{ role: 'user', content: userContent }],
      }),
    });
    if (!r.ok) {
      throw new Error(`API Claude (recherche web) : HTTP ${r.status} — ${(await r.text()).slice(0, 300)}`);
    }
    if (!r.body) throw new Error('API Claude (recherche web) : réponse sans corps.');

    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    const usage: ClaudeUsage = { ...EMPTY_USAGE };
    let buffer = '';
    let text = '';
    let searches = 0;

    for (;;) {
      const { done, value } = await reader.read();
      resetTimer(); // un octet reçu (ou la fin du flux) prouve que ça avance
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let fin = buffer.indexOf('\n\n');
      while (fin !== -1) {
        const bloc = buffer.slice(0, fin);
        buffer = buffer.slice(fin + 2);
        for (const ligne of bloc.split('\n')) {
          if (!ligne.startsWith('data:')) continue;
          const brut = ligne.slice(5).trim();
          if (!brut) continue;
          let ev: SseEvent & { content_block?: { type?: string } };
          try {
            ev = JSON.parse(brut);
          } catch {
            continue;
          }
          if (ev.type === 'message_start') {
            const u = ev.message?.usage ?? {};
            usage.inputTokens = u.input_tokens ?? 0;
            usage.outputTokens = u.output_tokens ?? 0;
            usage.cacheReadTokens = u.cache_read_input_tokens ?? 0;
            usage.cacheWriteTokens = u.cache_creation_input_tokens ?? 0;
          } else if (ev.type === 'content_block_start' && ev.content_block?.type === 'server_tool_use') {
            searches++;
          } else if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            text += ev.delta.text ?? '';
          } else if (ev.type === 'message_delta' && ev.usage?.output_tokens != null) {
            usage.outputTokens = ev.usage.output_tokens;
          } else if (ev.type === 'error') {
            throw new Error(`API Claude (recherche web) : ${ev.error?.type ?? 'erreur'} — ${ev.error?.message ?? ''}`);
          }
        }
        fin = buffer.indexOf('\n\n');
      }
    }

    return { text, usage, searches };
  } catch (e) {
    if ((e as Error).name === 'AbortError') {
      throw Object.assign(
        new Error(
          budgetDepasse
            ? `API Claude (recherche web) : non terminée dans le budget de ${Math.round(totalMs / 1000)} s imparti par la route.`
            : `API Claude (recherche web) : connexion inactive pendant plus de ${Math.round(inactiviteMs / 1000)} s.`,
        ),
        { code: 'TIMEOUT' },
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
    clearTimeout(limiteTotale);
  }
}
