// Indexation par les moteurs de recherche (JEP-274) : seul le domaine canonique
// peut être indexé. La règle AUTORISE explicitement `www`, elle n'interdit pas
// une liste de domaines — un domaine oublié (aperçu de PR, *.vercel.app, un
// futur alias) est fermé par défaut, alors que l'inverse désindexerait tout le
// site le jour où `www` serait touché par erreur.
//
// Fichier `.mjs` : `next.config.mjs` l'importe pour poser l'en-tête, et
// `app/robots.ts` / `app/sitemap.ts` pour le reste — une seule définition.

export const HOTE_CANONIQUE = 'www.jepatisse.com';
export const ORIGINE_CANONIQUE = `https://${HOTE_CANONIQUE}`;

/**
 * Vrai si le domaine servi peut être indexé. Un `Host` absent ou illisible
 * vaut « non » : dans le doute, on ferme.
 * @param {string | null | undefined} host valeur brute de l'en-tête `Host`
 */
export function estHoteIndexable(host) {
  if (!host) return false;
  return host.split(':')[0].trim().toLowerCase() === HOTE_CANONIQUE;
}

/**
 * Expression régulière (syntaxe `has` de `headers()` dans next.config) qui
 * correspond à tout hôte SAUF le canonique. Le `$` est dans l'anticipation
 * négative : « www.jepatisse.com.evil.fr » reste non indexable.
 */
export const MOTIF_HOTE_NON_INDEXABLE = `(?!${HOTE_CANONIQUE.replace(/\./g, '\\.')}$).+`;

export const EN_TETE_NON_INDEXABLE = { key: 'X-Robots-Tag', value: 'noindex, nofollow' };
