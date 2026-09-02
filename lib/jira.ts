// Création du ticket Jira pour un signalement de bug (spec §8).
//
// SERVER-ONLY par nature (secrets Jira, appel réseau externe) — jamais
// importé par un Client Component, donc pas besoin de la séparation pur /
// `-data` des autres modules du chantier. `texteVersAdf` est pure et testée
// isolément (`lib/jira.test.ts`) sans que ça change ce classement : rien ici
// n'a vocation à tourner dans le navigateur.
//
// Décisions de conception : `docs/contact-jira.md`.
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  corpsTicketJira,
  resumeTicketJira,
  type ConfigStatutsJira,
  type ContexteTicket,
  type StatutJira,
} from '@/lib/contact';

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

// Authentification seule — suffit à un GET (recherche de statuts). La
// création d'un ticket a en plus besoin du projet et du type d'issue,
// portés par `ConfigCreationJira` ci-dessous : deux configurations,
// pas une seule, pour qu'un `JIRA_PROJECT_KEY` absent ne bloque pas la
// réconciliation, qui n'en a pas besoin.
type ConfigAuthJira = { baseUrl: string; email: string; apiToken: string };

function lireConfigAuth(): ConfigAuthJira | null {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !apiToken) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ''), email, apiToken };
}

type ConfigCreationJira = ConfigAuthJira & { projectKey: string; issueTypeBug: string };

function lireConfigCreation(): ConfigCreationJira | null {
  const auth = lireConfigAuth();
  const projectKey = process.env.JIRA_PROJECT_KEY;
  const issueTypeBug = process.env.JIRA_ISSUE_TYPE_BUG;
  if (!auth || !projectKey || !issueTypeBug) return null;
  return { ...auth, projectKey, issueTypeBug };
}

/**
 * Nomme précisément la ou les variables absentes ou vides, pour un message
 * d'erreur exploitable — `lireConfigAuth`/`lireConfigCreation` renvoient un
 * simple `null` en cas d'échec, ce qui ne dit pas LAQUELLE des variables
 * pose problème. Diagnostic d'autant plus nécessaire que les valeurs sont
 * généralement enregistrées en secret sur Vercel : impossible de les
 * relire pour repérer une faute de frappe une fois saisies.
 */
function variablesJiraManquantes(avecCreation: boolean): string[] {
  const requises: [string, string | undefined][] = [
    ['JIRA_BASE_URL', process.env.JIRA_BASE_URL],
    ['JIRA_EMAIL', process.env.JIRA_EMAIL],
    ['JIRA_API_TOKEN', process.env.JIRA_API_TOKEN],
  ];
  if (avecCreation) {
    requises.push(['JIRA_PROJECT_KEY', process.env.JIRA_PROJECT_KEY], ['JIRA_ISSUE_TYPE_BUG', process.env.JIRA_ISSUE_TYPE_BUG]);
  }
  return requises.filter(([, valeur]) => !valeur).map(([nom]) => nom);
}

/**
 * Statuts « développé » / « déployé », lus depuis les variables
 * d'environnement (spec §8.1) — l'id est testé en priorité par
 * `mapperStatutJira` (`lib/contact.ts`), le nom en repli. Toujours
 * disponible : `aDeployerNom`/`deployeNom` ont un défaut, l'id peut manquer
 * sans bloquer la reconnaissance par nom.
 */
export function lireConfigStatuts(): ConfigStatutsJira {
  return {
    aDeployerId: process.env.JIRA_STATUS_TO_DEPLOY_ID || null,
    aDeployerNom: process.env.JIRA_STATUS_TO_DEPLOY || 'Terminé',
    deployeId: process.env.JIRA_STATUS_DEPLOYED_ID || null,
    deployeNom: process.env.JIRA_STATUS_DEPLOYED || 'Déployé',
  };
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

async function appelJira(
  config: ConfigAuthJira,
  chemin: string,
  methode: 'GET' | 'POST',
  corps: unknown,
  signal: AbortSignal,
): Promise<Response> {
  const jeton = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');
  return fetch(`${config.baseUrl}${chemin}`, {
    method: methode,
    signal,
    headers: {
      Authorization: `Basic ${jeton}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: methode === 'POST' ? JSON.stringify(corps) : undefined,
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
  config: ConfigAuthJira,
  chemin: string,
  methode: 'GET' | 'POST' = 'POST',
  corps?: unknown,
): Promise<{ status: number; body: unknown } | { error: string }> {
  async function tentative(): Promise<{ status: number; body: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const reponse = await appelJira(config, chemin, methode, corps, controller.signal);
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
  const config = lireConfigCreation();
  if (!config) {
    const manquantes = variablesJiraManquantes(true);
    return { ok: false, error: `Configuration Jira incomplète côté serveur : ${manquantes.join(', ')} absente(s) ou vide(s).` };
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

  const resultat = await appelAvecRetry(config, '/rest/api/3/issue', 'POST', corps);

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

// ─────────────────────────────────────────────────────────────────────────
// Commentaire sur un ticket existant — à chaque réponse (lot 10)
// ─────────────────────────────────────────────────────────────────────────

export type ResultatCommentaireJira = { ok: true } | { ok: false; error: string };

/**
 * Ajoute un commentaire sur un ticket déjà créé, admin ou membre
 * (docs/contact-jira.md §18). Seule l'authentification est nécessaire —
 * `lireConfigAuth`, pas `lireConfigCreation` — un commentaire ne crée rien,
 * il n'a pas besoin du projet ni du type d'issue.
 */
export async function ajouterCommentaireJira(issueKey: string, texte: string): Promise<ResultatCommentaireJira> {
  const config = lireConfigAuth();
  if (!config) {
    const manquantes = variablesJiraManquantes(false);
    return { ok: false, error: `Configuration Jira incomplète côté serveur : ${manquantes.join(', ')} absente(s) ou vide(s).` };
  }

  const resultat = await appelAvecRetry(config, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`, 'POST', {
    body: texteVersAdf(texte),
  });

  if ('error' in resultat) {
    console.error('jira: ajout de commentaire échoué :', resultat.error);
    return { ok: false, error: resultat.error };
  }
  if (resultat.status === 201) return { ok: true };

  const erreur = `HTTP ${resultat.status} — ${messageErreurJira(resultat.body)}`;
  console.error('jira: ajout de commentaire refusé :', erreur);
  return { ok: false, error: erreur };
}

// ─────────────────────────────────────────────────────────────────────────
// Vérification du webhook entrant (spec §9.2)
// ─────────────────────────────────────────────────────────────────────────

/**
 * `X-Hub-Signature: sha256=<hex>`, calculée par Jira sur le CORPS BRUT de la
 * requête — jamais sur le JSON reparsé, qui peut réordonner les clés et
 * produire une signature différente de celle envoyée. L'appelant doit donc
 * lire `req.text()` avant tout `JSON.parse`.
 *
 * Comparaison à temps constant (`timingSafeEqual`), comme l'exige la spec :
 * une comparaison `===` fuiterait le préfixe correct de la signature via le
 * temps de réponse.
 */
export function verifierSignatureWebhook(corpsBrut: string, enTeteSignature: string | null, secret: string): boolean {
  if (!enTeteSignature) return false;
  const [algo, signature] = enTeteSignature.split('=');
  if (algo !== 'sha256' || !signature) return false;

  const attendue = createHmac('sha256', secret).update(corpsBrut).digest('hex');
  // Longueurs comparées AVANT `timingSafeEqual`, qui lève sur des tampons de
  // tailles différentes plutôt que de renvoyer `false`.
  if (signature.length !== attendue.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(attendue));
}

// ─────────────────────────────────────────────────────────────────────────
// Réconciliation quotidienne — lecture groupée des statuts (spec §9.3)
// ─────────────────────────────────────────────────────────────────────────

// Par lots de 50, comme demandé : une seule requête `key in (...)` par lot,
// plutôt qu'une requête par ticket — nettement moins coûteux, et une
// réconciliation qui ne porte que sur les demandes encore ouvertes reste de
// toute façon un petit nombre de lots.
const TAILLE_LOT_RECHERCHE = 50;

export type ResultatRechercheStatuts = { ok: true; statuts: Map<string, StatutJira> } | { ok: false; error: string };

function statutDepuisIssue(issue: unknown): [string, StatutJira] | null {
  if (!issue || typeof issue !== 'object') return null;
  const key = (issue as { key?: unknown }).key;
  const status = (issue as { fields?: { status?: unknown } }).fields?.status as
    | { id?: unknown; name?: unknown; statusCategory?: { key?: unknown } }
    | undefined;
  if (typeof key !== 'string' || !status || typeof status.name !== 'string' || typeof status.statusCategory?.key !== 'string') {
    return null;
  }
  return [key, { id: typeof status.id === 'string' ? status.id : null, nom: status.name, categorie: status.statusCategory.key }];
}

/**
 * Statut courant de chaque ticket demandé, par lots de 50. Best-effort au
 * niveau de l'appelant (la réconciliation continue le lendemain si elle
 * échoue) — mais un lot en échec arrête ici toute la fonction plutôt que de
 * renvoyer un résultat partiel silencieusement incomplet : mieux vaut une
 * réconciliation qui échoue franchement qu'une qui semble réussie en n'ayant
 * traité qu'une partie des tickets ouverts.
 */
export async function rechercherStatutsJira(issueKeys: string[]): Promise<ResultatRechercheStatuts> {
  if (issueKeys.length === 0) return { ok: true, statuts: new Map() };

  const config = lireConfigAuth();
  if (!config) {
    const manquantes = variablesJiraManquantes(false);
    return { ok: false, error: `Configuration Jira incomplète côté serveur : ${manquantes.join(', ')} absente(s) ou vide(s).` };
  }

  const statuts = new Map<string, StatutJira>();
  for (let i = 0; i < issueKeys.length; i += TAILLE_LOT_RECHERCHE) {
    const lot = issueKeys.slice(i, i + TAILLE_LOT_RECHERCHE);
    const jql = `key in (${lot.join(',')})`;
    // `/rest/api/3/search` (GET) est retiré par Atlassian (HTTP 410) —
    // migré vers `/rest/api/3/search/jql`. Un seul lot ≤ 50 clés tient
    // toujours dans une page (`maxResults`), donc pas besoin de suivre
    // `nextPageToken` : la forme de la réponse (`issues: [...]`) est
    // inchangée, seul `total` a disparu — jamais lu ici.
    const chemin = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&fields=status&maxResults=${TAILLE_LOT_RECHERCHE}`;

    const resultat = await appelAvecRetry(config, chemin, 'GET');
    if ('error' in resultat) return { ok: false, error: resultat.error };
    if (resultat.status !== 200) return { ok: false, error: `HTTP ${resultat.status} — ${messageErreurJira(resultat.body)}` };

    const issues = (resultat.body as { issues?: unknown })?.issues;
    if (!Array.isArray(issues)) continue;
    for (const issue of issues) {
      const paire = statutDepuisIssue(issue);
      if (paire) statuts.set(paire[0], paire[1]);
    }
  }

  return { ok: true, statuts };
}
