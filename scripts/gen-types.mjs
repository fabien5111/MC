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
// migration), et il n'a pas à l'être pour une opération aussi rare qu'une
// régénération de types. La procédure est donc délibérément manuelle :
// ouvrir un Endpoint temporaire sur le nœud PostgreSQL, poser la chaîne
// obtenue dans `GEN_TYPES_DB_URL`, régénérer, refermer l'Endpoint. C'est le
// même mode opératoire que les migrations C1 et C3, et la friction est
// voulue : elle garantit qu'aucun accès direct à la base ne subsiste entre
// deux usages.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const cible = join(racine, 'lib', 'database.types.ts');

const dbUrl = process.env.GEN_TYPES_DB_URL;
if (!dbUrl) {
  console.error('[types] GEN_TYPES_DB_URL est absent — rien n’a été régénéré.');
  console.error('[types] Ouvrir un Endpoint temporaire sur le nœud PostgreSQL,');
  console.error('[types] puis exporter la chaîne de connexion qu’il rend :');
  console.error('[types]   GEN_TYPES_DB_URL=postgresql://<user>:<mdp>@<hôte>:<port>/postgres');
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), 'mc-types-'));
try {
  const res = spawnSync(
    'npx',
    ['--yes', 'supabase@latest', 'gen', 'types', 'typescript', '--db-url', dbUrl, '--schema', 'public'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );

  if (res.error) {
    console.error('[types] échec du lancement de la CLI Supabase :', res.error.message);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error(`[types] la CLI Supabase a échoué (code ${res.status}) :`);
    console.error((res.stderr || res.stdout || '').trim());
    console.error('[types] lib/database.types.ts est laissé INCHANGÉ.');
    process.exit(1);
  }

  const sortie = res.stdout ?? '';
  // Une erreur peut ressortir en JSON sur la sortie standard AVEC un code de
  // retour 0 — le contenu ne peut donc pas être cru sur parole.
  if (!sortie.includes('export type Database')) {
    console.error('[types] sortie inattendue (types absents) :');
    console.error(sortie.slice(0, 500).trim());
    console.error('[types] lib/database.types.ts est laissé INCHANGÉ.');
    process.exit(1);
  }

  const provisoire = join(tmp, 'database.types.ts');
  writeFileSync(provisoire, sortie);
  writeFileSync(cible, readFileSync(provisoire));
  console.log(`[types] lib/database.types.ts régénéré (${sortie.split('\n').length} lignes).`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
