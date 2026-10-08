// Accès Jira en ligne de commande, pour lire une spec ou un bug depuis
// Claude Code (lot 1 de l'outillage Jira — cf. `docs/outillage-jira.md`).
//
// Huit verbes : `lire`, `chercher`, `commenter`, `creer`, `modifier`, et trois verbes de
// transition étroitement bornés, `demarrer`, `envoyer-en-test` et
// `a-deployer`. Toujours pas de passe-plat REST générique : un besoin
// nouveau s'ajoute au script, avec son garde-fou, plutôt que de se
// contourner.
//
// Ces trois verbes ne connaissent qu'un seul statut cible chacun (« En
// cours » / « Revue en cours » / « A déployer », configurables — §1.5 de
// `docs/outillage-jira.md`) et refusent, avant tout envoi, toute transition
// qui mènerait au statut « Déployé » : c'est lui qui déclenche l'e-mail au
// demandeur, irréversible une fois parti (`docs/contact-jira.md` §2). Cette
// transition-là reste exclusivement le rôle du lot 3
// (`scripts/jira-deploiement.mjs`), dans une chaîne de déploiement — jamais
// d'un agent qui développe un ticket. `a-deployer` ne fait que poser le
// ticket sur la ligne de départ de ce lot 3 ; c'est lui, plus tard, qui
// constate qu'un déploiement a réussi et qui seul écrit « Déployé ».
//
// Script en JS pur, non importable depuis `lib/jira.ts` (TypeScript, compilé
// par Next) : l'authentification Basic (`scripts/jira-api.mjs`) et la
// conversion texte → ADF y sont donc réécrites. Duplication assumée et
// bornée — le chemin produit (création de ticket, commentaire de réponse)
// reste le seul à passer par `lib/jira.ts` et ses tests.
import { fileURLToPath } from 'node:url';
import { appelJira, lireConfig, lireConfigStatuts, memeStatut, trouverTransitionVers } from './jira-api.mjs';

const MAX_RESULTATS_DEFAUT = 25;
const MAX_COMMENTAIRES_DEFAUT = 10;

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

/**
 * Markdown restreint → ADF, pour la description d'un ticket créé par
 * `creer` : un pas-à-pas illisible en un seul bloc de paragraphes perdrait
 * tout l'intérêt d'être dans Jira. Volontairement minimal — titres (`## `,
 * `### `), listes à puces (`- `) et numérotées (`1. `), paragraphes ; aucune
 * mise en forme en ligne. Une ligne qui ne correspond à rien reste du texte.
 */
export function markdownLegerVersAdf(texte) {
  const blocs = [];
  let paragraphe = [];
  let liste = null;

  const texteNoeud = (t) => ({ type: 'text', text: t });
  const clore = () => {
    if (paragraphe.length > 0) blocs.push({ type: 'paragraph', content: paragraphe });
    paragraphe = [];
    if (liste) blocs.push(liste);
    liste = null;
  };

  for (const brute of texte.split('\n')) {
    const ligne = brute.trimEnd();
    const titre = /^(#{2,3}) (.+)$/.exec(ligne);
    const puce = /^- (.+)$/.exec(ligne);
    const numero = /^\d+\. (.+)$/.exec(ligne);

    if (ligne === '') {
      clore();
    } else if (titre) {
      clore();
      blocs.push({ type: 'heading', attrs: { level: titre[1].length }, content: [texteNoeud(titre[2])] });
    } else if (puce || numero) {
      const type = puce ? 'bulletList' : 'orderedList';
      if (paragraphe.length > 0 || (liste && liste.type !== type)) clore();
      if (!liste) liste = { type, content: [] };
      liste.content.push({ type: 'listItem', content: [{ type: 'paragraph', content: [texteNoeud((puce ?? numero)[1])] }] });
    } else {
      if (liste) clore();
      if (paragraphe.length > 0) paragraphe.push({ type: 'hardBreak' });
      paragraphe.push(texteNoeud(ligne));
    }
  }
  clore();

  if (blocs.length === 0) blocs.push({ type: 'paragraph', content: [texteNoeud('—')] });
  return { type: 'doc', version: 1, content: blocs };
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

/**
 * Crée un ticket. Jamais de statut ni de transition ici : un ticket naît
 * dans le statut initial du workflow, ce qui laisse intact le garde-fou des
 * verbes de transition. La priorité n'est pas sur l'écran de création des
 * tâches du projet : si Jira la refuse, elle est posée par une mise à jour
 * séparée, et un échec de cette seconde étape est signalé sans défaire le
 * ticket déjà créé.
 */
async function creer(options, description) {
  const config = lireConfig();
  if (!options.titre?.trim()) echouer('--titre manquant.');
  if (!description.trim()) echouer('Description vide : rien à créer.');

  const champs = {
    project: { key: options.projet },
    issuetype: { name: options.type },
    summary: options.titre.trim(),
    description: markdownLegerVersAdf(description),
  };
  if (options.labels.length > 0) champs.labels = options.labels;

  const cree = await appelJira(config, '/rest/api/3/issue', 'POST', { fields: champs });
  const url = `${config.baseUrl}/browse/${cree.key}`;

  if (options.priorite) {
    try {
      await appelJira(config, `/rest/api/3/issue/${cree.key}`, 'PUT', { fields: { priority: { name: options.priorite } } });
    } catch (e) {
      console.error(`${cree.key} créé, mais priorité « ${options.priorite} » non posée : ${e?.message ?? e}`);
    }
  }
  console.log(`${cree.key} créé — ${url}`);
}

/**
 * Remplace la description d'un ticket existant (et, si fourni, son titre),
 * avec le même markdown restreint que `creer`. Ne touche ni au statut ni aux
 * autres champs : corriger une spec rédigée ne doit rien faire avancer.
 */
async function modifier(cle, titre, description) {
  const config = lireConfig();
  if (!description.trim()) echouer('Description vide : rien à écrire.');
  const champs = { description: markdownLegerVersAdf(description) };
  if (titre?.trim()) champs.summary = titre.trim();
  await appelJira(config, `/rest/api/3/issue/${encodeURIComponent(cle)}`, 'PUT', { fields: champs });
  console.log(`${cle} modifié — ${config.baseUrl}/browse/${cle}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Transitions bornées (`demarrer`, `envoyer-en-test`)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Décide quoi faire d'une demande de transition, sans effet de bord — c'est
 * elle qui porte le garde-fou, vérifié avant tout envoi à Jira plutôt
 * qu'après coup : même si `cibleId`/`cibleNom` étaient mal configurés au
 * point de désigner le statut « Déployé », la transition n'est jamais
 * effectuée. Testée séparément de l'appel HTTP, même motif que
 * `decisionDeploiement` (`jira-deploiement.mjs`).
 */
export function resoudreTransition(transitions, cibleId, cibleNom, deployeId, deployeNom) {
  const transition = trouverTransitionVers(transitions, cibleId, cibleNom);
  if (!transition) return { action: 'introuvable' };
  if (memeStatut(transition.to, deployeId, deployeNom)) return { action: 'refuse_deploiement', transition };
  return { action: 'transitionner', transition };
}

async function transitionner(cle, cibleId, cibleNom) {
  const config = lireConfig();
  const statuts = lireConfigStatuts();
  const { transitions } = await appelJira(config, `/rest/api/3/issue/${encodeURIComponent(cle)}/transitions`);
  const decision = resoudreTransition(transitions, cibleId, cibleNom, statuts.deployeId, statuts.deployeNom);

  if (decision.action === 'introuvable') {
    echouer(`Aucune transition vers « ${cibleNom} » depuis le statut courant de ${cle}. Vérifier le workflow Jira du projet.`);
  }
  if (decision.action === 'refuse_deploiement') {
    echouer(
      `Transition refusée : elle mènerait à « ${decision.transition.to?.name} », le statut « Déployé » qui déclenche l'e-mail ` +
        `irréversible au demandeur (docs/contact-jira.md §2). Ce verbe ne fait jamais cette transition — c'est le rôle du lot 3 ` +
        `(scripts/jira-deploiement.mjs). Vérifier JIRA_STATUS_IN_PROGRESS / JIRA_STATUS_IN_TEST.`,
    );
  }

  await appelJira(config, `/rest/api/3/issue/${encodeURIComponent(cle)}/transitions`, 'POST', { transition: { id: decision.transition.id } });
  console.log(`${cle} — passé à « ${decision.transition.to?.name ?? cibleNom} » (${config.baseUrl}/browse/${cle})`);
}

async function demarrer(cle) {
  const statuts = lireConfigStatuts();
  await transitionner(cle, statuts.enCoursId, statuts.enCoursNom);
}

async function envoyerEnTest(cle) {
  const statuts = lireConfigStatuts();
  await transitionner(cle, statuts.enTestId, statuts.enTestNom);
}

/**
 * Pose le ticket sur le statut que `jira-deploiement.mjs` (lot 3) surveille
 * comme point de départ (`decisionDeploiement`, `aDeployerId`/`aDeployerNom`
 * — mêmes variables, aucune n'est ajoutée pour ce verbe). Le garde-fou de
 * `transitionner` s'applique ici comme aux deux autres verbes : si
 * `JIRA_STATUS_TO_DEPLOY` finissait par désigner « Déployé » par erreur de
 * configuration, la transition serait refusée plutôt qu'exécutée.
 *
 * AUCUN REPLI IMPLICITE TOLÉRÉ, contrairement à `demarrer` / `envoyer-en-test`
 * — incident vécu le 15/09. `lireConfigStatuts` replie `aDeployerNom` sur
 * « Terminé » et `deployeNom` sur « Déployé » quand les variables manquent :
 * deux noms génériques, jamais ceux de ce projet, dont le vrai statut
 * terminal s'appelle « Terminé ». Dans une session sans ces deux variables,
 * ce repli a fait exécuter JEP-131 → « Terminé » directement : le garde-fou
 * de `transitionner` compare la transition trouvée à `deployeNom`, resté à
 * « Déployé » par défaut — les deux noms ne coïncidant pas, rien n'a
 * bloqué. Une configuration absente doit arrêter la commande, comme
 * `lireConfig()` le fait déjà pour `JIRA_BASE_URL` / `JIRA_EMAIL` /
 * `JIRA_API_TOKEN` — jamais deviner un nom qui pourrait, par malchance,
 * être le bon.
 */
export function verifierConfigADeployer(env) {
  return [
    ['JIRA_STATUS_TO_DEPLOY', env.JIRA_STATUS_TO_DEPLOY, env.JIRA_STATUS_TO_DEPLOY_ID],
    ['JIRA_STATUS_DEPLOYED', env.JIRA_STATUS_DEPLOYED, env.JIRA_STATUS_DEPLOYED_ID],
  ]
    .filter(([, nom, id]) => !nom && !id)
    .map(([variable]) => variable);
}

async function aDeployer(cle) {
  const manquantes = verifierConfigADeployer(process.env);
  if (manquantes.length > 0) {
    echouer(
      `${manquantes.join(', ')} absente(s) de l'environnement — ce verbe refuse de deviner un nom de statut par défaut ` +
        `(incident du 15/09 : un repli sur « Terminé » / « Déployé » a fait sauter l'étape « A déployer »). Renseigner ` +
        `les noms réels du workflow Jira du projet avant de réessayer (cf. docs/outillage-jira.md §1.6).`,
    );
  }
  const statuts = lireConfigStatuts();
  await transitionner(cle, statuts.aDeployerId, statuts.aDeployerNom);
}

// ─────────────────────────────────────────────────────────────────────────
// Ligne de commande
// ─────────────────────────────────────────────────────────────────────────

const USAGE = `Usage :
  node scripts/jira.mjs lire <CLE> [--commentaires N]
  node scripts/jira.mjs chercher "<JQL>" [--max N]
  node scripts/jira.mjs commenter <CLE> "<texte>"     (ou "-" pour lire l'entrée standard)
  node scripts/jira.mjs demarrer <CLE>                (→ JIRA_STATUS_IN_PROGRESS, défaut « En cours »)
  node scripts/jira.mjs envoyer-en-test <CLE>         (→ JIRA_STATUS_IN_TEST, défaut « Revue en cours »)
  node scripts/jira.mjs a-deployer <CLE>              (→ JIRA_STATUS_TO_DEPLOY, défaut « A déployer »)
  node scripts/jira.mjs creer --titre "<résumé>" <fichier|-> [--projet JEP] [--type Tâche] [--priorite Medium] [--label L]...
                                                      (description en markdown restreint : ##, ###, -, 1.)
  node scripts/jira.mjs modifier <CLE> <fichier|-> [--titre "<résumé>"]
                                                      (remplace la description, même format que creer)

Variables requises : JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN.

Exemples :
  node scripts/jira.mjs lire MC-123
  node scripts/jira.mjs chercher "project = MC AND statusCategory != Done ORDER BY updated DESC"
  node scripts/jira.mjs commenter MC-123 "Corrigé sur la branche claude/… — PR #42."
  node scripts/jira.mjs demarrer MC-123
  node scripts/jira.mjs envoyer-en-test MC-123
  node scripts/jira.mjs a-deployer MC-123`;

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

  if (verbe === 'demarrer') {
    const cle = args[0];
    if (!cle) echouer(`Clé de ticket manquante.\n\n${USAGE}`);
    await demarrer(cle);
    return;
  }

  if (verbe === 'envoyer-en-test') {
    const cle = args[0];
    if (!cle) echouer(`Clé de ticket manquante.\n\n${USAGE}`);
    await envoyerEnTest(cle);
    return;
  }

  if (verbe === 'a-deployer') {
    const cle = args[0];
    if (!cle) echouer(`Clé de ticket manquante.\n\n${USAGE}`);
    await aDeployer(cle);
    return;
  }

  if (verbe === 'creer') {
    const options = { projet: 'JEP', type: 'Tâche', priorite: null, titre: null, labels: [] };
    const positionnels = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--titre') options.titre = args[++i];
      else if (a === '--projet') options.projet = args[++i];
      else if (a === '--type') options.type = args[++i];
      else if (a === '--priorite') options.priorite = args[++i];
      else if (a === '--label') options.labels.push(args[++i]);
      else positionnels.push(a);
    }
    const source = positionnels[0];
    if (!source) echouer(`Fichier de description manquant (ou "-" pour l'entrée standard).\n\n${USAGE}`);
    const { readFile } = await import('node:fs/promises');
    await creer(options, source === '-' ? await lireEntreeStandard() : await readFile(source, 'utf8'));
    return;
  }

  if (verbe === 'modifier') {
    let titre = null;
    const positionnels = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--titre') titre = args[++i];
      else positionnels.push(args[i]);
    }
    const [cle, source] = positionnels;
    if (!cle || !source) echouer(`Clé de ticket ou fichier de description manquant.\n\n${USAGE}`);
    const { readFile } = await import('node:fs/promises');
    await modifier(cle, titre, source === '-' ? await lireEntreeStandard() : await readFile(source, 'utf8'));
    return;
  }

  echouer(`Verbe inconnu : ${verbe}\n\n${USAGE}`);
}

// Exécuté seulement en ligne de commande : les fonctions pures ci-dessus
// sont importées telles quelles par `scripts/jira.test.mjs`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv).catch((e) => echouer(e?.message ?? String(e)));
}
