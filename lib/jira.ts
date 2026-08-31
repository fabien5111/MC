// Création du ticket Jira pour un signalement de bug (spec §8).
//
// SERVER-ONLY par nature (secrets Jira, appel réseau externe) — jamais
// importé par un Client Component, donc pas besoin de la séparation pur /
// `-data` des autres modules du chantier. `texteVersAdf` est pure et testée
// isolément (`lib/jira.test.ts`) sans que ça change ce classement : rien ici
// n'a vocation à tourner dans le navigateur.
//
// Décisions de conception : `docs/contact-jira.md`.
import { corpsTicketJira, resumeTicketJira, type ContexteTicket } from '@/lib/contact';

const TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 1_000;

// ─────────────────────────────────────────────────────────────────────────
// Texte → ADF (Atlassian Document Format)
// ─────────────────────────────────────────────────────────────────────────

type AdfInline = { type: 'text'; text: string } | { type: 'hardBreak' };
type AdfParagraph = { type: 'paragraph'; content: AdfInline[] };
export type AdfDocument = { type: 'doc'; version: 1; content: AdfParagraph[] };

/**
 * `description` attend de l'ADF, pas du texte brut (spec §8.4). Une ligne
 * vide sépare deux paragraphes ; à l'intérieur d'un paragraphe, chaque saut
 * de ligne devient un `hardBreak` — Jira n'insère pas de retour à la ligne
 * automatique dans un même nœud `text`.
 *
 * `corpsTicketJira` (`lib/contact.ts`) produit exactement ce texte : les
 * lignes vides qu'il pose entre ses blocs (référence / message / bloc
 * technique) deviennent les paragraphes visuellement séparés du ticket.
 */
export function texteVersAdf(texte: string): AdfDocument {
  const paragraphes: AdfParagraph[] = [];
  let courant: AdfInline[] = [];

  function clorePar() {
    if (courant.length > 0) paragraphes.push({ type: 'paragraph', content: courant });
    courant = [];
  }

  for (const ligne of texte.split('\n')) {
    if (ligne === '') {
      clorePar();
      continue;
    }
    if (courant.length > 0) courant.push({ type: 'hardBreak' });
    courant.push({ type: 'text', text: ligne });
  }
  clorePar();

  // Jira refuse un `content` vide : un texte entièrement vide (improbable —
  // `message` est borné à 20 caractères minimum par la validation, mais un
  // appel direct de cette fonction ne le garantit pas) produirait un document
  // sans paragraphe.
  if (paragraphes.length === 0) paragraphes.push({ type: 'paragraph', content: [{ type: 'text', text: '' }] });

  return { type: 'doc', version: 1, content: paragraphes };
}

// ─────────────────────────────────────────────────────────────────────────
// Appel réseau
// ─────────────────────────────────────────────────────────────────────────

type ConfigJira = {
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKey: string;
  issueTypeBug: string;
};

function lireConfig(): ConfigJira | null {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  const projectKey = process.env.JIRA_PROJECT_KEY;
  const issueTypeBug = process.env.JIRA_ISSUE_TYPE_BUG;
  if (!baseUrl || !email || !apiToken || !projectKey || !issueTypeBug) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), email, apiToken, projectKey, issueTypeBug };
}

function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Un 429 ou un 5xx est transitoire — Jira surchargé, maintenance en cours —
 * et mérite l'unique retry de la spec §8.4. Un 400/401/403 est une erreur de
 * configuration ou de contenu : la répéter à l'identique une seconde plus
 * tard produirait exactement la même erreur.
 */
export function estRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

async function appelJira(config: ConfigJira, chemin: string, corps: unknown, signal: AbortSignal): Promise<Response> {
  const jeton = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  return fetch(`${config.baseUrl}${chemin}`, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Basic ${jeton}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(corps),
  });
}

/**
 * Un seul point d'appel réseau, timeout 8 s, un seul retry après 1 s sur les
 * échecs transitoires (réseau/timeout compris — même politique que pour un
 * 5xx, la spec ne les distingue pas). Ne lève jamais : le résultat porte
 * l'échec, à charge de l'appelant de le journaliser sans le laisser
 * remonter au client (spec §8.4 : « erreurs journalisées en base, jamais
 * renvoyées au client »).
 */
async function appelAvecRetry(
  config: ConfigJira,
  chemin: string,
  corps: unknown,
): Promise<{ status: number; body: unknown } | { error: string }> {
  async function tentative(): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const reponse = await appelJira(config, chemin, corps, controller.signal);
      const body = await reponse.json().catch(() => null);
      return { status: reponse.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const premiere = await tentative();
    if (!estRetryable(premiere.status)) return premiere;
    await attendre(RETRY_DELAY_MS);
    return await tentative();
  } catch (e) {
    // Échec réseau ou timeout dès le premier essai : un seul retry, avant
    // d'abandonner pour de bon.
    try {
      await attendre(RETRY_DELAY_MS);
      return await tentative();
    } catch (e2) {
      return { error: (e2 as Error).message || (e as Error).message || 'Erreur réseau.' };
    }
  }
}

function messageErreurJira(body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as { errorMessages?: unknown; errors?: unknown };
    const messages = Array.isArray(b.errorMessages) ? b.errorMessages.filter((m) => typeof m === 'string') : [];
    const champs =
      b.errors && typeof b.errors === 'object'
        ? Object.entries(b.errors as Record<string, unknown>).map(([champ, msg]) => `${champ}: ${msg}`)
        : [];
    const tout = [...messages, ...champs];
    if (tout.length > 0) return tout.join(' ; ');
  }
  return 'Réponse Jira illisible.';
}

export type ResultatTicketJira = { ok: true; issueKey: string } | { ok: false; error: string };

// `ContexteTicket` (lib/contact.ts) porte tout ce qui va dans le CORPS du
// ticket ; le sujet, lui, n'y figure pas — il n'a pas sa place dans un texte
// pseudonymisé partagé avec l'auteur du message (`corpsTicketJira` ne le
// reprend pas) mais alimente le `summary` de l'issue Jira.
export type NouveauTicketJira = ContexteTicket & { subject: string };

/**
 * Crée le ticket Jira pseudonymisé d'un signalement de bug. Best-effort :
 * clé absente, panne, timeout ou contenu refusé → `{ ok: false }`, jamais
 * d'exception — l'appelant (route `/api/contact`) a déjà répondu au visiteur
 * sur la seule foi de l'INSERT Supabase.
 */
export async function creerTicketJira(ctx: NouveauTicketJira): Promise<ResultatTicketJira> {
  const config = lireConfig();
  if (!config) {
    return { ok: false, error: "Configuration Jira incomplète (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN / JIRA_PROJECT_KEY / JIRA_ISSUE_TYPE_BUG)." };
  }

  const corps = {
    fields: {
      project: { key: config.projectKey },
      issuetype: { name: config.issueTypeBug },
      // `resumeTicketJira` tronque à 255 caractères (limite Jira) et préfixe
      // `[Signalement]` — jamais de `reporter` : les membres n'ont pas de
      // compte Jira (spec §8.3).
      summary: resumeTicketJira(ctx.subject),
      labels: ['remontee-utilisateur', 'formulaire-contact'],
      description: texteVersAdf(corpsTicketJira(ctx)),
    },
  };

  const resultat = await appelAvecRetry(config, '/rest/api/3/issue', corps);

  if ('error' in resultat) {
    console.error('jira: création de ticket échouée :', resultat.error);
    return { ok: false, error: resultat.error };
  }
  if (resultat.status === 201) {
    const key = (resultat.body as { key?: unknown } | null)?.key;
    if (typeof key === 'string' && key) return { ok: true, issueKey: key };
    return { ok: false, error: 'Réponse Jira sans clé de ticket.' };
  }

  const erreur = `HTTP ${resultat.status} — ${messageErreurJira(resultat.body)}`;
  console.error('jira: création de ticket refusée :', erreur);
  return { ok: false, error: erreur };
}
