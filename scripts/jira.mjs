// Accès Jira en ligne de commande, pour lire une spec ou un bug depuis
// Claude Code (lot 1 de l'outillage Jira — cf. `docs/outillage-jira.md`).
//
// Trois verbes seulement : `lire`, `chercher`, `commenter`. Volontairement
// PAS de passe-plat REST générique ni de verbe de transition : une transition
// vers « Déployé » déclenche l'e-mail au demandeur, irréversible une fois
// parti (`docs/contact-jira.md` §2) — ça relève du lot 3, dans une chaîne de
// déploiement, jamais d'un agent qui explore un ticket.
//
// Script en JS pur, non importable depuis `lib/jira.ts` (TypeScript, compilé
// par Next) : l'authentification Basic et la conversion texte → ADF y sont
// donc réécrites en quelques lignes. Duplication assumée et bornée — le
// chemin produit (création de ticket, commentaire de réponse) reste le seul
// à passer par `lib/jira.ts` et ses tests.
import { fileURLToPath } from 'node:url';

const TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 1_000;
const MAX_RESULTATS_DEFAUT = 25;
const MAX_COMMENTAIRES_DEFAUT = 10;

// ─────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────

/**
 * Les variables vivent normalement dans l'environnement (session Claude Code,
 * CI). `.env.local` n'est lu qu'en repli, et seulement s'il manque quelque
 * chose : sans cette condition, un fichier local écraserait silencieusement
 * les variables de l'environnement courant.
 */
function chargerEnvLocal() {
  if (process.env.JIRA_BASE_URL && process.env.JIRA_EMAIL && process.env.JIRA_API_TOKEN) return;
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // Fichier absent ou illisible : l'absence de variable est signalée
    // proprement juste après, avec le nom de chacune.
  }
}

function lireConfig() {
  chargerEnvLocal();
  const manquantes = [
    ['JIRA_BASE_URL', process.env.JIRA_BASE_URL],
    ['JIRA_EMAIL', process.env.JIRA_EMAIL],
    ['JIRA_API_TOKEN', process.env.JIRA_API_TOKEN],
  ]
    .filter(([, valeur]) => !valeur)
    .map(([nom]) => nom);

  if (manquantes.length > 0) {
    echouer(
      `Configuration Jira incomplète : ${manquantes.join(', ')} absente(s).\n` +
        `Les renseigner dans l'environnement de la session (ou dans .env.local en local).`,
    );
  }

  return {
    baseUrl: process.env.JIRA_BASE_URL.replace(/\/+$/, ''),
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// ADF (Atlassian Document Format)
// ─────────────────────────────────────────────────────────────────────────

const BLOCS = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem', 'tableRow', 'panel']);

/**
 * Aplatit un document ADF en texte lisible. Une description Jira n'est pas
 * du texte brut en API v3 : sans ça, `lire` afficherait un arbre JSON que
 * personne — humain comme modèle — ne relit volontiers.
 *
 * Tolérant par construction : un nœud inconnu est traversé plutôt que
 * refusé, ce qui vaut mieux qu'une description tronquée parce qu'Atlassian a
 * ajouté un type de bloc.
 */
export function adfVersTexte(noeud) {
  if (noeud == null) return '';
  if (typeof noeud === 'string') return noeud;
  if (Array.isArray(noeud)) return noeud.map(adfVersTexte).join('');

  const { type, text, content, attrs } = noeud;
  if (type === 'text') return typeof text === 'string' ? text : '';
  if (type === 'hardBreak') return '\n';
  if (type === 'rule') return '\n---\n';
  if (type === 'mention') return `@${attrs?.text ?? attrs?.displayName ?? 'mention'}`;
  if (type === 'emoji') return attrs?.text ?? attrs?.shortName ?? '';
  if (type === 'inlineCard') return attrs?.url ?? '';
  if (type === 'media' || type === 'mediaInline') return '[pièce jointe]';

  const interieur = adfVersTexte(content);
  if (type === 'listItem') return `- ${interieur.trim()}\n`;
  if (type === 'tableCell' || type === 'tableHeader') return `${interieur.trim()} | `;
  // Un bloc se termine par une ligne vide, sinon deux paragraphes successifs
  // se lisent comme un seul texte coupé au milieu. Les lignes vides en trop
  // (blocs imbriqués) sont résorbées une fois, à la racine du document.
  if (BLOCS.has(type)) return `${interieur}\n\n`;
  if (type === 'doc') return interieur.replace(/\n{3,}/g, '\n\n').trim();
  return interieur;
}

/**
 * Texte → ADF pour le corps d'un commentaire : l'API v3 refuse une chaîne.
 * Même règle que `texteVersAdf` (`lib/jira.ts`, testée) — ligne vide =
 * nouveau paragraphe, saut de ligne simple = `hardBreak`.
 */
export function texteVersAdf(texte) {
  const paragraphes = [];
  let courant = [];

  const clore = () => {
    if (courant.length > 0) paragraphes.push({ type: 'paragraph', content: courant });
    courant = [];
  };

  for (const ligne of texte.split('\n')) {
    if (ligne === '') {
      clore();
      continue;
    }
    if (courant.length > 0) courant.push({ type: 'hardBreak' });
    courant.push({ type: 'text', text: ligne });
  }
  clore();

  // Jira refuse un `content` vide.
  if (paragraphes.length === 0) paragraphes.push({ type: 'paragraph', content: [{ type: 'text', text: '—' }] });
  return { type: 'doc', version: 1, content: paragraphes };
}

// ─────────────────────────────────────────────────────────────────────────
// Appel réseau
// ─────────────────────────────────────────────────────────────────────────

/** Un 429 ou un 5xx est transitoire ; un 4xx de configuration ne l'est pas. */
function estRetryable(status) {
  return status === 429 || status >= 500;
}

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Timeout 8 s et un seul retry, même politique que `lib/jira.ts`. */
async function appelJira(config, chemin, methode = 'GET', corps) {
  const jeton = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64');

  const tentative = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const reponse = await fetch(`${config.baseUrl}${chemin}`, {
        method: methode,
        signal: controller.signal,
        headers: {
          Authorization: `Basic ${jeton}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });
      const body = await reponse.json().catch(() => null);
      return { status: reponse.status, body };
    } finally {
      clearTimeout(timer);
    }
  };

  let resultat;
  try {
    resultat = await tentative();
  } catch (e) {
    await attendre(RETRY_DELAY_MS);
    try {
      resultat = await tentative();
    } catch (e2) {
      echouer(`Appel Jira impossible : ${e2.message || e.message}`);
    }
  }

  if (estRetryable(resultat.status)) {
    await attendre(RETRY_DELAY_MS);
    resultat = await tentative();
  }

  if (resultat.status === 401 || resultat.status === 403) {
    echouer(`HTTP ${resultat.status} — authentification Jira refusée (JIRA_EMAIL / JIRA_API_TOKEN).`);
  }
  if (resultat.status === 404) echouer('HTTP 404 — ticket ou ressource introuvable (clé exacte ? droits sur le projet ?).');
  if (resultat.status >= 400) echouer(`HTTP ${resultat.status} — ${messageErreurJira(resultat.body)}`);

  return resultat.body;
}

function messageErreurJira(body) {
  if (body && typeof body === 'object') {
    const messages = Array.isArray(body.errorMessages) ? body.errorMessages.filter((m) => typeof m === 'string') : [];
    const champs = body.errors && typeof body.errors === 'object' ? Object.entries(body.errors).map(([c, m]) => `${c}: ${m}`) : [];
    const tout = [...messages, ...champs];
    if (tout.length > 0) return tout.join(' ; ');
  }
  return 'réponse Jira illisible.';
}

// ─────────────────────────────────────────────────────────────────────────
// Verbes
// ─────────────────────────────────────────────────────────────────────────

function dateCourte(iso) {
  return typeof iso === 'string' ? iso.slice(0, 16).replace('T', ' ') : '?';
}

async function lire(cle, options) {
  const config = lireConfig();
  const champs = 'summary,status,issuetype,priority,created,updated,reporter,assignee,labels,parent,resolution,description,comment';
  const issue = await appelJira(config, `/rest/api/3/issue/${encodeURIComponent(cle)}?fields=${champs}`);
  const f = issue.fields ?? {};

  const lignes = [];
  lignes.push(`${issue.key} — ${f.summary ?? '(sans titre)'}`);
  lignes.push(
    [
      `Statut : ${f.status?.name ?? '?'} (${f.status?.statusCategory?.key ?? '?'})`,
      `Type : ${f.issuetype?.name ?? '?'}`,
      `Priorité : ${f.priority?.name ?? '—'}`,
    ].join(' · '),
  );
  lignes.push(
    [
      `Créé : ${dateCourte(f.created)}`,
      `Maj : ${dateCourte(f.updated)}`,
      `Rapporteur : ${f.reporter?.displayName ?? '—'}`,
      `Assigné : ${f.assignee?.displayName ?? '—'}`,
    ].join(' · '),
  );
  if (Array.isArray(f.labels) && f.labels.length > 0) lignes.push(`Labels : ${f.labels.join(', ')}`);
  if (f.parent?.key) lignes.push(`Parent : ${f.parent.key} — ${f.parent.fields?.summary ?? ''}`);
  if (f.resolution?.name) lignes.push(`Résolution : ${f.resolution.name}`);
  lignes.push(`URL : ${config.baseUrl}/browse/${issue.key}`);

  lignes.push('', '── Description ──');
  const description = adfVersTexte(f.description).trim();
  lignes.push(description || '(vide)');

  const commentaires = Array.isArray(f.comment?.comments) ? f.comment.comments : [];
  if (options.commentaires > 0 && commentaires.length > 0) {
    const derniers = commentaires.slice(-options.commentaires);
    const omis = commentaires.length - derniers.length;
    lignes.push('', `── Commentaires (${commentaires.length}${omis > 0 ? `, ${omis} plus anciens omis` : ''}) ──`);
    for (const c of derniers) {
      lignes.push('', `[${dateCourte(c.created)} · ${c.author?.displayName ?? '?'}]`);
      lignes.push(adfVersTexte(c.body).trim() || '(vide)');
    }
  }

  console.log(lignes.join('\n'));
}

async function chercher(jql, options) {
  const config = lireConfig();
  // `/rest/api/3/search` (GET) est retiré par Atlassian (HTTP 410) — même
  // migration que `rechercherStatutsJira` (`lib/jira.ts`) : `/search/jql`,
  // qui pagine par `nextPageToken` et ne renvoie plus de `total`.
  const chemin =
    `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}` +
    `&fields=summary,status,issuetype,assignee,updated&maxResults=${options.max}`;
  const body = await appelJira(config, chemin);
  const issues = Array.isArray(body?.issues) ? body.issues : [];

  if (issues.length === 0) {
    console.log('Aucun ticket.');
    return;
  }

  for (const issue of issues) {
    const f = issue.fields ?? {};
    console.log(
      [
        issue.key.padEnd(10),
        (f.status?.name ?? '?').padEnd(14),
        (f.issuetype?.name ?? '?').padEnd(10),
        dateCourte(f.updated).slice(0, 10),
        f.summary ?? '',
      ].join(' '),
    );
  }
  console.log(`\n${issues.length} ticket(s)${body?.nextPageToken ? ' — page suivante disponible (affiner le JQL ou --max)' : ''}.`);
}

async function commenter(cle, texte) {
  const config = lireConfig();
  if (!texte.trim()) echouer('Commentaire vide : rien à publier.');
  await appelJira(config, `/rest/api/3/issue/${encodeURIComponent(cle)}/comment`, 'POST', { body: texteVersAdf(texte) });
  console.log(`Commentaire publié sur ${cle} — ${config.baseUrl}/browse/${cle}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Ligne de commande
// ─────────────────────────────────────────────────────────────────────────

const USAGE = `Usage :
  node scripts/jira.mjs lire <CLE> [--commentaires N]
  node scripts/jira.mjs chercher "<JQL>" [--max N]
  node scripts/jira.mjs commenter <CLE> "<texte>"     (ou "-" pour lire l'entrée standard)

Variables requises : JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN.

Exemples :
  node scripts/jira.mjs lire MC-123
  node scripts/jira.mjs chercher "project = MC AND statusCategory != Done ORDER BY updated DESC"
  node scripts/jira.mjs commenter MC-123 "Corrigé sur la branche claude/… — PR #42."`;

function echouer(message) {
  console.error(message);
  process.exit(1);
}

function lireOption(args, nom, defaut) {
  const i = args.indexOf(nom);
  if (i === -1) return defaut;
  const valeur = Number(args[i + 1]);
  if (!Number.isInteger(valeur) || valeur < 0) echouer(`${nom} attend un entier positif.`);
  args.splice(i, 2);
  return valeur;
}

async function lireEntreeStandard() {
  const morceaux = [];
  for await (const morceau of process.stdin) morceaux.push(morceau);
  return Buffer.concat(morceaux).toString('utf8');
}

async function main(argv) {
  const args = argv.slice(2);
  const verbe = args.shift();

  if (!verbe || verbe === 'aide' || verbe === '--help' || verbe === '-h') {
    console.log(USAGE);
    return;
  }

  if (verbe === 'lire') {
    const commentaires = lireOption(args, '--commentaires', MAX_COMMENTAIRES_DEFAUT);
    const cle = args[0];
    if (!cle) echouer(`Clé de ticket manquante.\n\n${USAGE}`);
    await lire(cle, { commentaires });
    return;
  }

  if (verbe === 'chercher') {
    const max = lireOption(args, '--max', MAX_RESULTATS_DEFAUT);
    const jql = args.join(' ').trim();
    if (!jql) echouer(`Requête JQL manquante.\n\n${USAGE}`);
    await chercher(jql, { max });
    return;
  }

  if (verbe === 'commenter') {
    const cle = args.shift();
    const reste = args.join(' ').trim();
    if (!cle || !reste) echouer(`Clé de ticket ou texte manquant.\n\n${USAGE}`);
    await commenter(cle, reste === '-' ? await lireEntreeStandard() : reste);
    return;
  }

  echouer(`Verbe inconnu : ${verbe}\n\n${USAGE}`);
}

// Exécuté seulement en ligne de commande : les fonctions pures ci-dessus
// sont importées telles quelles par `scripts/jira.test.mjs`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv).catch((e) => echouer(e?.message ?? String(e)));
}
