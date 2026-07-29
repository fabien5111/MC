// Copie le worker de pdf.js dans `public/` avant `dev` et `build`.
//
// pdf.js charge son worker par URL (`GlobalWorkerOptions.workerSrc`), pas par
// import : le bundler ne peut donc pas le résoudre pour nous. Le servir depuis
// `public/` est la seule méthode qui vaut pour webpack comme pour Turbopack.
// Le fichier est recopié depuis `node_modules` à chaque build plutôt que
// versionné, pour qu'il ne puisse pas diverger de la version installée.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');
// Variante « legacy » : elle embarque les polyfills (Math.sumPrecise,
// Map.prototype.getOrInsertComputed…) dont la version standard a besoin et que
// seuls les navigateurs très récents fournissent. Doit rester cohérente avec
// l'import de lib/pdf.ts.
const source = join(racine, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs');
const cible = join(racine, 'public', 'pdf.worker.min.mjs');

mkdirSync(dirname(cible), { recursive: true });
copyFileSync(source, cible);
console.log('[pdf] worker copié →', cible.replace(racine + '/', ''));
