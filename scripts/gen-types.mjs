// Régénère `lib/database.types.ts` depuis la base live.
//
// Passe par un fichier temporaire plutôt que par une redirection directe
// (`supabase gen types … > lib/database.types.ts`) : le shell tronque la
// cible AVANT de lancer la commande, si bien que le moindre échec — chaîne
// de connexion absente, réseau coupé, base injoignable — remplaçait les 3000
// lignes de types par le message d'erreur JSON de la CLI, cassant tout le
// build. Ici la cible n'est écrite qu'une fois la génération réellement
// aboutie.
//
// **`--db-url`, plus `--project-id`.** La base n'est plus hébergée par
// Supabase mais par Infomaniak (Virtuozzo Cloud) : il n'y a plus de
// « référence de projet » à interroger, seulement un PostgreSQL joignable.
// La CLI Supabase reste le bon outil — c'est elle qui produit la forme
// `Database` dont tout le code dépend — elle change simplement de source.
//
// **Le port 5432 n'est pas exposé en production** (§ 7.9 du dossier de
// migration), et il n'a pas à l'être. Avec `GEN_TYPES_SSH` (alias SSH du nœud
// applicatif, posé par le workflow), la connexion passe par un tunnel à
// travers ce nœud, qui joint la base par le réseau interne d'Infomaniak
// (`scripts/tunnel-bdd.mjs`) : `GEN_TYPES_DB_URL` désigne alors l'adresse
// INTERNE de la base, et aucun Endpoint n'est à ouvrir. Sans `GEN_TYPES_SSH`,
// la chaîne est utilisée telle quelle (base locale, ou Endpoint de secours).
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ouvrirTunnel } from './tunnel-bdd.mjs';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const cible = join(racine, 'lib', 'database.types.ts');

const dbUrl = process.env.GEN_TYPES_DB_URL;
if (!dbUrl) {
  console.error('[types] GEN_TYPES_DB_URL est absent — rien n’a été régénéré.');
  console.error('[types] Attendu : GEN_TYPES_DB_URL=postgresql://<user>:<mdp>@<hôte>:<port>/postgres');
  console.error('[types] (adresse interne de la base + GEN_TYPES_SSH=<alias> pour passer par le nœud applicatif).');
  process.exit(1);
}

// Lance la CLI sans bloquer la boucle d'événements : le tunnel, servi par ce
// même processus, doit pouvoir relayer pendant qu'elle tourne.
function lancer(commande, args) {
  return new Promise((resoudre) => {
    const enfant = spawn(commande, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    enfant.stdout.on('data', (m) => (stdout += m));
    enfant.stderr.on('data', (m) => (stderr += m));
    enfant.on('error', (error) => resoudre({ error, stdout, stderr, status: null }));
    enfant.on('close', (status) => resoudre({ stdout, stderr, status }));
  });
}

let url = dbUrl;
let tunnel = null;
const alias = process.env.GEN_TYPES_SSH;
if (alias) {
  const adresse = new URL(dbUrl);
  tunnel = await ouvrirTunnel({ alias, hote: adresse.hostname, port: adresse.port || '5432' });
  adresse.hostname = '127.0.0.1';
  adresse.port = String(tunnel.port);
  url = adresse.toString();
  console.log(`[types] tunnel par « ${alias} » vers la base (port local ${tunnel.port}).`);
}

const tmp = mkdtempSync(join(tmpdir(), 'mc-types-'));
try {
  const res = await lancer('npx', [
    '--yes', 'supabase@latest', 'gen', 'types', 'typescript', '--db-url', url, '--schema', 'public',
  ]);

  if (res.error) {
    console.error('[types] échec du lancement de la CLI Supabase :', res.error.message);
    process.exitCode = 1;
  } else if (res.status !== 0) {
    console.error(`[types] la CLI Supabase a échoué (code ${res.status}) :`);
    console.error((res.stderr || res.stdout || '').trim());
    console.error('[types] lib/database.types.ts est laissé INCHANGÉ.');
    process.exitCode = 1;
  } else {
    ecrire(res.stdout ?? '');
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
  if (tunnel) await tunnel.fermer();
}

function ecrire(sortie) {
  // Une erreur peut ressortir en JSON sur la sortie standard AVEC un code de
  // retour 0 — le contenu ne peut donc pas être cru sur parole.
  if (!sortie.includes('export type Database')) {
    console.error('[types] sortie inattendue (types absents) :');
    console.error(sortie.slice(0, 500).trim());
    console.error('[types] lib/database.types.ts est laissé INCHANGÉ.');
    process.exitCode = 1;
    return;
  }

  const provisoire = join(tmp, 'database.types.ts');
  writeFileSync(provisoire, sortie);
  writeFileSync(cible, readFileSync(provisoire));
  console.log(`[types] lib/database.types.ts régénéré (${sortie.split('\n').length} lignes).`);
}
