// Génère la liste des icônes Material Symbols réellement utilisées dans le
// code, pour ne demander à Google Fonts que ce sous-ensemble (au lieu de la
// police variable complète : ~975 Kio pour l'ensemble du catalogue, quel que
// soit l'axe de graisse demandé — la restriction d'axe seule ne réduit
// quasiment rien, la totalité du poids vient du nombre de glyphes. Vérifié le
// 28/09/2026 : 976 Kio avec `wght` figé à 300, contre 26 Kio en ne demandant
// que les ~150 icônes ci-dessous).
//
// Recensée par analyse statique du code, PAS lue en base : la seule colonne
// « icon » de la base (`recipe_types.icon`) n'est lue nulle part dans
// l'application (vérifié le 28/09/2026) — un nom d'icône choisi côté admin
// n'existe donc jamais en pratique, seuls les noms écrits en dur dans le code
// s'affichent. Si `recipe_types.icon` est un jour effectivement rendu, cette
// liste devra soit couvrir ses valeurs possibles, soit être abandonnée au
// profit de la police complète.
//
// DEUX façons dont le code référence une icône, TOUTES DEUX nécessaires —
// n'en garder qu'une a réellement fait disparaître des icônes en pratique
// (« home », « article » de `lib/nav.ts`, entre autres) :
//   1. Directement dans l'élément `.material-symbols-outlined` (texte ou
//      ternaire : `{copie ? 'check' : 'content_copy'}`).
//   2. Indirectement via un champ `icon: 'xxx'` d'un objet de configuration
//      défini ailleurs (`lib/nav.ts`, `lib/admin-access.ts`,
//      `lib/profile-links.ts`, `lib/invitation-content.ts`, tableaux de
//      catégories dans `app/page.tsx`…), rendu plus loin via `{x.icon}` —
//      c'est la convention constante du code pour une icône configurée à
//      distance de son rendu (vérifié le 28/09/2026 : aucun autre nom de
//      champ, `iconName`/`symbol`/`picto`… n'est utilisé pour ça).
//
// Régénérée à CHAQUE build par `next.config.mjs` (même doctrine que
// `APP_BUILD_ID`) : une icône ajoutée au code apparaît dans la liste au
// prochain déploiement, sans geste manuel à faire ni fichier à tenir à jour.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['app', 'components', 'lib'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORED_DIRS = new Set(['node_modules', '.next']);

// Icône de repli affichée quand un composant ne sait pas encore laquelle
// choisir (ex. `PlanBadgeIcon` avant résolution) — jamais littéralement
// écrite à côté de `material-symbols-outlined` ni sous un champ `icon:`,
// donc invisible aux deux passes ci-dessous.
const EXTRA_ICONS = ['help'];

function listSourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) {
      out.push(full);
    }
  }
  return out;
}

// Un nom d'icône Material Symbols valide : minuscules, chiffres, underscores.
const ICON_TOKEN = /^[a-z][a-z0-9_]*$/;

function extractIconsFromSnippet(snippet) {
  const found = new Set();
  // Contenu texte direct : >icon_name<
  for (const m of snippet.matchAll(/>\s*([a-z][a-z0-9_]*)\s*</g)) {
    found.add(m[1]);
  }
  // Chaînes entre quotes (ternaires `cond ? 'edit' : 'add_circle'`, valeurs
  // dans un objet, etc.), dans une fenêtre courte autour de la classe.
  for (const m of snippet.matchAll(/['"]([a-z][a-z0-9_]*)['"]/g)) {
    found.add(m[1]);
  }
  return [...found].filter((w) => ICON_TOKEN.test(w) && w.length > 1);
}

export function collectMaterialSymbolIcons() {
  const icons = new Set(EXTRA_ICONS);
  for (const root of ROOTS) {
    for (const file of listSourceFiles(root)) {
      const content = readFileSync(file, 'utf8');

      // Passe 1 — élément direct.
      let idx = content.indexOf('material-symbols-outlined');
      while (idx !== -1) {
        // Fenêtre courte : l'icône est toujours à quelques dizaines de
        // caractères du nom de classe (contenu du même élément, ou la
        // condition qui le précède immédiatement dans le même JSX).
        const end = Math.min(content.indexOf('</span>', idx), content.indexOf('</i>', idx));
        const windowEnd = end === -1 ? idx + 160 : Math.min(end + 8, idx + 160);
        for (const icon of extractIconsFromSnippet(content.slice(idx, windowEnd))) icons.add(icon);
        idx = content.indexOf('material-symbols-outlined', idx + 1);
      }

      // Passe 2 — champ de configuration `icon: 'xxx'` (objet littéral),
      // rendu ailleurs via `{variable.icon}`.
      for (const m of content.matchAll(/\bicon\s*:\s*['"]([a-z][a-z0-9_]*)['"]/g)) {
        icons.add(m[1]);
      }
    }
  }
  return [...icons].sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const icons = collectMaterialSymbolIcons();
  console.log(icons.length, 'icônes');
  console.log(icons.join(','));
}
