// Régénère `lib/database.types.ts` depuis la base Supabase live.
//
// Passe par un fichier temporaire plutôt que par une redirection directe
// (`supabase gen types … > lib/database.types.ts`) : le shell tronque la
// cible AVANT de lancer la commande, si bien que le moindre échec — jeton
// absent, réseau coupé, projet en pause — remplaçait les 3000 lignes de types
// par le message d'erreur JSON de la CLI, cassant tout le build. Ici la cible
// n'est écrite qu'une fois la génération réellement aboutie.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
const cible = join(racine, 'lib', 'database.types.ts');
const PROJECT_ID = 'acbabqolghhyxksouaye';

const tmp = mkdtempSync(join(tmpdir(), 'mc-types-'));
try {
  const res = spawnSync(
    'npx',
    ['--yes', 'supabase@latest', 'gen', 'types', 'typescript', '--project-id', PROJECT_ID, '--schema', 'public'],
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
  // Un jeton manquant ressort en JSON sur la sortie standard, avec un code
  // de retour 0 — le contenu ne peut donc pas être cru sur parole.
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
