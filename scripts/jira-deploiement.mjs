// Passe en « Déployé » les tickets dont le code vient d'être mis en ligne
// (lot 3 de l'outillage — cf. `docs/outillage-jira.md`).
//
// Lit des messages de commit sur l'entrée standard, en extrait les clés de
// ticket (`scripts/jira-cles.mjs`, extracteur unique du dépôt) et transitionne
// chacune, à trois conditions strictes.
//
// ATTENTION — ce script déclenche un envoi d'e-mail IRRÉVERSIBLE : le webhook
// Jira du site voit la transition et prévient le demandeur que sa correction
// est en ligne (`docs/contact-jira.md` §2). D'où :
//   - `--simulation`, qui montre exactement ce qui serait fait sans rien
//     écrire — le mode par défaut du workflow tant qu'il n'est pas armé ;
//   - un ticket qui n'est PAS au statut « développé, pas encore en ligne »
//     n'est jamais touché (un ticket en cours, rouvert ou déjà déployé n'a
//     rien à faire ici) ;
//   - un échec sur un ticket n'interrompt pas les autres, mais le script
//     sort en erreur : mieux vaut une exécution franchement rouge qu'une
//     réussite apparente ayant oublié la moitié des tickets.
import { fileURLToPath } from 'node:url';
import { appelJira, lireConfig, lireConfigStatuts } from './jira-api.mjs';
import { extraireCles } from './jira-cles.mjs';

/**
 * Un statut Jira correspond-il au statut attendu ? L'id d'abord, le nom en
 * repli — même règle que `mapperStatutJira` (`lib/contact.ts`) : l'id survit
 * à un renommage dans Jira, le nom non.
 */
function memeStatut(statut, id, nom) {
  if (id && statut?.id) return String(statut.id) === String(id);
  return typeof statut?.name === 'string' && statut.name.trim().toLowerCase() === nom.trim().toLowerCase();
}

/**
 * Que faire d'un ticket au vu de son statut courant. Fonction pure, testée —
 * c'est elle qui porte la garantie « on ne pousse jamais en Déployé un
 * ticket qui n'était pas prêt à l'être ».
 */
export function decisionDeploiement(statutActuel, statuts) {
  if (memeStatut(statutActuel, statuts.deployeId, statuts.deployeNom)) {
    return { action: 'deja_deploye', raison: `déjà « ${statutActuel?.name ?? statuts.deployeNom} »` };
  }
  if (memeStatut(statutActuel, statuts.aDeployerId, statuts.aDeployerNom)) {
    return { action: 'transitionner', raison: `« ${statutActuel?.name} » → « ${statuts.deployeNom} »` };
  }
  return { action: 'hors_perimetre', raison: `statut « ${statutActuel?.name ?? '?'} » — hors périmètre, ticket laissé tel quel` };
}

/**
 * La transition à emprunter pour atteindre le statut « déployé ». Jira n'a
 * pas d'API « mettre ce statut » : il faut nommer une transition sortante du
 * statut courant, et le workflow du projet décide de leur existence.
 */
export function choisirTransition(transitions, statuts) {
  const candidates = Array.isArray(transitions) ? transitions : [];
  return candidates.find((t) => memeStatut(t?.to, statuts.deployeId, statuts.deployeNom)) ?? null;
}

async function traiter(config, statuts, cle, simulation) {
  const issue = await appelJira(config, `/rest/api/3/issue/${encodeURIComponent(cle)}?fields=status,summary`);
  const decision = decisionDeploiement(issue?.fields?.status, statuts);

  if (decision.action !== 'transitionner') {
    console.log(`  ${cle} — ignoré : ${decision.raison}`);
    return { transitionne: false };
  }

  const { transitions } = await appelJira(config, `/rest/api/3/issue/${encodeURIComponent(cle)}/transitions`);
  const transition = choisirTransition(transitions, statuts);
  if (!transition) {
    throw new Error(
      `aucune transition vers « ${statuts.deployeNom} » depuis « ${issue?.fields?.status?.name} ». ` +
        `Vérifier le workflow Jira du projet (et JIRA_STATUS_DEPLOYED / _ID).`,
    );
  }

  if (simulation) {
    console.log(`  ${cle} — SIMULATION : ${decision.raison} via « ${transition.name} » (rien n'a été écrit)`);
    return { transitionne: false };
  }

  await appelJira(config, `/rest/api/3/issue/${encodeURIComponent(cle)}/transitions`, 'POST', { transition: { id: transition.id } });
  console.log(`  ${cle} — ${decision.raison} ✓`);
  return { transitionne: true };
}

// ─────────────────────────────────────────────────────────────────────────
// Ligne de commande
// ─────────────────────────────────────────────────────────────────────────

const USAGE = `Usage :
  git log --format=%B <sha> | node scripts/jira-deploiement.mjs --projet MC [--simulation]

Lit les messages de commit sur l'entrée standard et passe en « Déployé » les
tickets qui y sont cités ET qui sont au statut « développé, pas encore en
ligne ». Les autres sont laissés tels quels.

Variables : JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, et les statuts
JIRA_STATUS_TO_DEPLOY[_ID] / JIRA_STATUS_DEPLOYED[_ID].

--simulation : montre ce qui serait fait, sans rien écrire.`;

async function lireEntreeStandard() {
  const morceaux = [];
  for await (const morceau of process.stdin) morceaux.push(morceau);
  return Buffer.concat(morceaux).toString('utf8');
}

async function main(argv) {
  const args = argv.slice(2);
  const simulation = args.includes('--simulation');

  const i = args.indexOf('--projet');
  const prefixe = i === -1 ? process.env.JIRA_PROJECT_KEY : args[i + 1];
  if (!prefixe) {
    console.error(`Préfixe de projet absent (--projet ou JIRA_PROJECT_KEY).\n\n${USAGE}`);
    process.exit(1);
  }

  const cles = extraireCles(await lireEntreeStandard(), prefixe);
  if (cles.length === 0) {
    console.log('Aucune clé de ticket dans les commits — rien à faire.');
    return;
  }

  const config = lireConfig();
  const statuts = lireConfigStatuts();
  console.log(
    `${cles.length} ticket(s) cité(s) : ${cles.join(', ')}\n` +
      `Statut visé : « ${statuts.deployeNom} », depuis « ${statuts.aDeployerNom} »${simulation ? ' — SIMULATION' : ''}`,
  );

  let transitionnes = 0;
  const echecs = [];
  for (const cle of cles) {
    try {
      const { transitionne } = await traiter(config, statuts, cle, simulation);
      if (transitionne) transitionnes += 1;
    } catch (e) {
      // Un ticket en échec n'empêche pas les suivants : les tickets d'un même
      // déploiement sont indépendants, et en abandonner cinq parce que le
      // premier a un workflow atypique serait pire que le problème.
      console.error(`  ${cle} — ÉCHEC : ${e.message}`);
      echecs.push(cle);
    }
  }

  console.log(`\n${transitionnes} ticket(s) transitionné(s)${echecs.length > 0 ? `, ${echecs.length} en échec : ${echecs.join(', ')}` : ''}.`);
  if (echecs.length > 0) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv).catch((e) => {
    console.error(e?.message ?? String(e));
    process.exit(1);
  });
}
