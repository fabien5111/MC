// Accès HTTP à l'API Jira, partagé par les scripts d'outillage
// (`jira.mjs`, `jira-deploiement.mjs`).
//
// Séparé pour une raison précise : le lot 3 transitionne des tickets, et une
// transition déclenche un e-mail irréversible au demandeur
// (`docs/contact-jira.md` §2). Deux clients HTTP écrits séparément auraient
// deux politiques de retry et deux façons de lire une erreur — donc deux
// comportements possibles au moment exact où il ne faut pas se tromper.
//
// Ne sort jamais du processus : les erreurs sont levées, à charge de chaque
// CLI de les afficher et de choisir son code de sortie.
//
// Cf. `docs/outillage-jira.md`.

const TIMEOUT_MS = 8_000;
const RETRY_DELAY_MS = 1_000;

/**
 * Les variables vivent normalement dans l'environnement (session Claude Code,
 * CI). `.env.local` n'est lu qu'en repli, et seulement s'il manque quelque
 * chose : sans cette condition, un fichier local écraserait silencieusement
 * les variables de l'environnement courant — c'est-à-dire viserait la
 * mauvaise instance Jira sans que rien ne le signale.
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

export function lireConfig() {
  chargerEnvLocal();
  const manquantes = [
    ['JIRA_BASE_URL', process.env.JIRA_BASE_URL],
    ['JIRA_EMAIL', process.env.JIRA_EMAIL],
    ['JIRA_API_TOKEN', process.env.JIRA_API_TOKEN],
  ]
    .filter(([, valeur]) => !valeur)
    .map(([nom]) => nom);

  if (manquantes.length > 0) {
    throw new Error(
      `Configuration Jira incomplète : ${manquantes.join(', ')} absente(s).\n` +
        `Les renseigner dans l'environnement (ou dans .env.local en local).`,
    );
  }

  return {
    baseUrl: process.env.JIRA_BASE_URL.replace(/\/+$/, ''),
    email: process.env.JIRA_EMAIL,
    apiToken: process.env.JIRA_API_TOKEN,
  };
}

/**
 * Statuts « développé » / « déployé », mêmes variables et même priorité que
 * `lireConfigStatuts` (`lib/jira.ts`) : l'id d'abord, le nom en repli —
 * l'id survit à un renommage dans Jira, pas le nom.
 */
export function lireConfigStatuts() {
  return {
    aDeployerId: process.env.JIRA_STATUS_TO_DEPLOY_ID || null,
    aDeployerNom: process.env.JIRA_STATUS_TO_DEPLOY || 'Terminé',
    deployeId: process.env.JIRA_STATUS_DEPLOYED_ID || null,
    deployeNom: process.env.JIRA_STATUS_DEPLOYED || 'Déployé',
    // Statuts pilotés par l'agent lui-même (verbes `demarrer` /
    // `envoyer-en-test` de `jira.mjs`), pas par le déploiement — cf.
    // `docs/outillage-jira.md` §1.5.
    enCoursId: process.env.JIRA_STATUS_IN_PROGRESS_ID || null,
    enCoursNom: process.env.JIRA_STATUS_IN_PROGRESS || 'En cours',
    enTestId: process.env.JIRA_STATUS_IN_TEST_ID || null,
    enTestNom: process.env.JIRA_STATUS_IN_TEST || 'En cours de test',
  };
}

/**
 * Un statut Jira correspond-il au statut attendu ? L'id d'abord, le nom en
 * repli — l'id survit à un renommage dans Jira, pas le nom. Partagée par
 * tous les scripts qui transitionnent un ticket (lot 3 déploiement, verbes
 * `demarrer` / `envoyer-en-test` de `jira.mjs`) : deux implémentations
 * auraient pu diverger sur le point exact où il ne faut pas se tromper —
 * reconnaître à tort le statut « Déployé ».
 */
export function memeStatut(statut, id, nom) {
  if (id && statut?.id) return String(statut.id) === String(id);
  return typeof statut?.name === 'string' && typeof nom === 'string' && statut.name.trim().toLowerCase() === nom.trim().toLowerCase();
}

/**
 * La transition à emprunter pour atteindre un statut donné, parmi les
 * transitions disponibles depuis le statut courant d'un ticket. Jira n'a pas
 * d'API « mettre ce statut » : il faut nommer une transition sortante, et le
 * workflow du projet décide de leur existence.
 */
export function trouverTransitionVers(transitions, id, nom) {
  const candidates = Array.isArray(transitions) ? transitions : [];
  return candidates.find((t) => memeStatut(t?.to, id, nom)) ?? null;
}

/** Un 429 ou un 5xx est transitoire ; un 4xx de configuration ne l'est pas. */
export function estRetryable(status) {
  return status === 429 || status >= 500;
}

function attendre(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function messageErreurJira(body) {
  if (body && typeof body === 'object') {
    const messages = Array.isArray(body.errorMessages) ? body.errorMessages.filter((m) => typeof m === 'string') : [];
    const champs = body.errors && typeof body.errors === 'object' ? Object.entries(body.errors).map(([c, m]) => `${c}: ${m}`) : [];
    const tout = [...messages, ...champs];
    if (tout.length > 0) return tout.join(' ; ');
  }
  return 'réponse Jira illisible.';
}

/**
 * Timeout 8 s et un seul retry sur les échecs transitoires, même politique
 * que `lib/jira.ts`. Lève sur toute réponse ≥ 400 avec un message
 * exploitable ; rend le corps (ou `null` sur 204) sinon.
 */
export async function appelJira(config, chemin, methode = 'GET', corps) {
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
      const body = reponse.status === 204 ? null : await reponse.json().catch(() => null);
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
      throw new Error(`Appel Jira impossible : ${e2.message || e.message}`);
    }
  }

  if (estRetryable(resultat.status)) {
    await attendre(RETRY_DELAY_MS);
    resultat = await tentative();
  }

  if (resultat.status === 401 || resultat.status === 403) {
    throw new Error(`HTTP ${resultat.status} — authentification Jira refusée (JIRA_EMAIL / JIRA_API_TOKEN).`);
  }
  if (resultat.status === 404) {
    throw new Error('HTTP 404 — ticket ou ressource introuvable (clé exacte ? droits sur le projet ?).');
  }
  if (resultat.status >= 400) throw new Error(`HTTP ${resultat.status} — ${messageErreurJira(resultat.body)}`);

  return resultat.body;
}
