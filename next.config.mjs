import { execSync } from 'node:child_process';

/**
 * Identifiant du build — sert de version au cache du service worker et de
 * numéro de version diagnostique sur `/contact`.
 *
 * POURQUOI IL NE PEUT PAS ÊTRE UNE SIMPLE VARIABLE D'ENVIRONNEMENT. Le nom du
 * cache PWA doit changer à CHAQUE déploiement, sans quoi le worker ne purge
 * jamais le précédent et les navigateurs restent des heures sur une version
 * périmée — la régression que raconte la section « Installation (PWA) » de
 * CLAUDE.md. Une valeur posée à la main dans un panneau ne changerait qu'à la
 * main, donc jamais : c'est exactement ce qui s'est produit en quittant Vercel,
 * qui posait `VERCEL_GIT_COMMIT_SHA` de lui-même (docs/migration-infomaniak.md
 * § 7.16).
 *
 * La valeur est **inlinée au build** par la clé `env` ci-dessous — vérifié
 * dans `.next/server`, y compris pour une route `force-dynamic`. Cette
 * fonction est donc réévaluée à chaque démarrage du serveur, sans effet : le
 * code compilé porte déjà le littéral du build.
 */
function identifiantDeBuild() {
  // Fourni explicitement, ou par Vercel qui le pose seul : on le respecte.
  const fourni = process.env.APP_BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA;
  if (fourni) return fourni;

  // Le commit courant quand le déploiement est un clone git — le cas sur
  // Virtuozzo. Préféré à un horodatage : il relie une version servie à un
  // commit, ce qui est précisément l'usage de `/contact`.
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    // Ni variable ni dépôt git. Un horodatage garantit l'unicité, seule
    // propriété dont le nom de cache ait réellement besoin.
    return `t${Date.now().toString(36)}`;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Inlinée au build, côté serveur comme côté navigateur. Ne pas la préfixer
  // `NEXT_PUBLIC_` : ces variables-là restent relues à l'exécution par le code
  // serveur, ce qui rouvrirait la porte à une valeur qui ne change plus
  // (§ 7.16, « Les NEXT_PUBLIC_* comptent aux DEUX moments »).
  env: { APP_BUILD_ID: identifiantDeBuild() },

  // `/cookies` n'est pas une page : la politique de cookies est le § 10 de
  // /confidentialite (JEP-128) — un seul texte, sinon les deux finissent par se
  // contredire. Redirection de configuration, évaluée avant `middleware.ts` :
  // elle passe donc aussi sous COMING_SOON, vers une page légale exemptée.
  // Temporaire (307) : un 308 resterait figé dans les navigateurs si l'adresse
  // devenait un jour une vraie page.
  async redirects() {
    return [{ source: '/cookies', destination: '/confidentialite#cookies', permanent: false }];
  },

  // Rien ici pour `/sw.js` : il est désormais servi par `app/sw.js/route.ts`,
  // qui pose lui-même `Cache-Control: no-store` et son `Content-Type` — un
  // service worker ne doit jamais être servi depuis un cache intermédiaire,
  // sans quoi le navigateur mettrait des heures à voir un remplacement
  // (interrupteur d'arrêt compris).
};

export default nextConfig;
