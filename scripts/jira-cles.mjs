// Extraction des clés de ticket Jira (`MC-123`) d'un texte — titre de PR,
// nom de branche, messages de commit.
//
// Point unique d'extraction, partagé par le contrôle de PR
// (`.github/workflows/jira-cle.yml`, lot 2) et, à venir, par la transition
// « Déployé » déclenchée après un déploiement production (lot 3). Deux
// expressions régulières écrites séparément finiraient par diverger, et la
// divergence se verrait au pire endroit : un ticket non transitionné, donc
// un membre jamais prévenu que sa correction est en ligne.
//
// Cf. `docs/outillage-jira.md`.
import { fileURLToPath } from 'node:url';

/**
 * Les clés du projet `prefixe` présentes dans `texte`, sans doublon, dans
 * l'ordre d'apparition.
 *
 * **Sensible à la casse, volontairement** : Jira ne reconnaît pas `mc-123`
 * dans un nom de branche ou un message de commit. Accepter les minuscules
 * ici ferait passer le contrôle sur une PR que le panneau « Développement »
 * du ticket ignorerait — un contrôle vert pour un lien inexistant est pire
 * que pas de contrôle du tout.
 *
 * Le préfixe est obligatoire : un motif générique (`[A-Z]+-\d+`) attrape
 * `UTF-8`, `SHA-256` ou `RFC-2119` aussi bien qu'une vraie clé.
 */
export function extraireCles(texte, prefixe) {
  if (!prefixe) throw new Error('Préfixe de projet Jira manquant.');
  if (!/^[A-Z][A-Z0-9]*$/.test(prefixe)) throw new Error(`Préfixe de projet invalide : ${prefixe}`);
  if (typeof texte !== 'string' || texte === '') return [];

  const trouvees = texte.match(new RegExp(`\\b${prefixe}-\\d+\\b`, 'g')) ?? [];
  return [...new Set(trouvees)];
}

// ─────────────────────────────────────────────────────────────────────────
// Ligne de commande
// ─────────────────────────────────────────────────────────────────────────

const USAGE = `Usage :
  node scripts/jira-cles.mjs --projet MC "<texte>"
  … | node scripts/jira-cles.mjs --projet MC -        (lit l'entrée standard)

Écrit une clé par ligne. Code de sortie : 0 si au moins une clé, 2 si aucune,
1 en cas d'erreur d'usage.`;

async function lireEntreeStandard() {
  const morceaux = [];
  for await (const morceau of process.stdin) morceaux.push(morceau);
  return Buffer.concat(morceaux).toString('utf8');
}

async function main(argv) {
  const args = argv.slice(2);

  const i = args.indexOf('--projet');
  const prefixe = i === -1 ? process.env.JIRA_PROJECT_KEY : args[i + 1];
  if (i !== -1) args.splice(i, 2);

  if (!prefixe || args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.error(prefixe ? USAGE : `Préfixe de projet absent (--projet ou JIRA_PROJECT_KEY).\n\n${USAGE}`);
    process.exit(1);
  }

  const texte = args[0] === '-' ? await lireEntreeStandard() : args.join(' ');

  let cles;
  try {
    cles = extraireCles(texte, prefixe);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  for (const cle of cles) console.log(cle);
  process.exit(cles.length > 0 ? 0 : 2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv);
}
