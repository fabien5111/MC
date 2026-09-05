// Stockage objet — signature TempURL. Server-only (`node:crypto`, et surtout
// les clés secrètes lues dans process.env) : à réserver aux Route Handlers et
// Server Components. Le pendant pur — constantes, nommage, validation — est
// dans lib/storage.ts, que les composants client peuvent importer sans
// entraîner celui-ci côté navigateur. Motif ideas.ts / ideas-data.ts.
//
// Cf. docs/migration-infomaniak.md § 7.5 (lot B).

import { createHmac } from 'node:crypto';

import {
  CONTENEURS,
  EXPIRATION_LECTURE_S,
  EXPIRATION_TELEVERSEMENT_S,
  cheminObjet,
  type Conteneur,
} from '@/lib/storage';

// Le cluster déclare `allowed_digests: ['sha1','sha256','sha512']` et marque
// **sha1 déprécié** (sondé en B0). On signe donc en sha256.
//
// La signature est émise préfixée du nom du condensat — la forme documentée
// par Swift. La forme nue fonctionne aussi, la longueur levant l'ambiguïté
// (40/64/128 caractères), mais l'explicite survit à un cluster qui cesserait
// un jour d'inférer par la longueur.
const DIGEST = 'sha256';

function env(nom: string): string {
  const v = process.env[nom];
  if (!v) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return v;
}

// Racine rendue par `swift auth` (`OS_STORAGE_URL`), de la forme
// `https://<hôte>/v1/AUTH_<projet>`. On en sépare l'origine du chemin : la
// signature ne porte QUE le chemin, l'URL finale a besoin des deux.
function racine(): { origine: string; baseV1: string } {
  const u = new URL(env('SWIFT_STORAGE_URL'));
  return { origine: u.origin, baseV1: u.pathname.replace(/\/$/, '') };
}

function cle(conteneur: Conteneur): string {
  return conteneur === 'contact'
    ? env('SWIFT_TEMPURL_KEY_CONTACT')
    : env('SWIFT_TEMPURL_KEY_PHOTOS');
}

/**
 * Signature TempURL brute.
 *
 * Le corps signé est exactement `méthode\nexpiration\nchemin`, le chemin
 * **non encodé** et commençant par `/v1/`. Exporté pour être testable sur des
 * vecteurs fixes, sans variables d'environnement ni réseau.
 */
export function signer(cleSecrete: string, methode: string, expire: number, chemin: string): string {
  const corps = `${methode}\n${expire}\n${chemin}`;
  return createHmac(DIGEST, cleSecrete).update(corps).digest('hex');
}

function urlSignee(conteneur: Conteneur, cleObjet: string, methode: 'PUT' | 'GET', dureeS: number): string {
  const { origine, baseV1 } = racine();
  const chemin = cheminObjet(baseV1, conteneur, cleObjet);
  const expire = Math.floor(Date.now() / 1000) + dureeS;
  const sig = signer(cle(conteneur), methode, expire, chemin);
  const q = new URLSearchParams({
    temp_url_sig: `${DIGEST}:${sig}`,
    temp_url_expires: String(expire),
  });
  return `${origine}${chemin}?${q}`;
}

/**
 * URL de dépôt : le navigateur y fait un `PUT` direct, les octets ne
 * transitent jamais par l'application (§ 3 — le stockage sert le navigateur en
 * direct, sans consommer de cloudlets, et ça contourne la limite de 4,5 Mo du
 * corps d'une fonction serverless).
 *
 * Le jeton ne vaut que pour CE chemin et CETTE méthode : il n'autorise ni à
 * écrire ailleurs, ni à lire, ni à supprimer.
 */
export function urlDeTeleversement(conteneur: Conteneur, cleObjet: string): string {
  return urlSignee(conteneur, cleObjet, 'PUT', EXPIRATION_TELEVERSEMENT_S);
}

/**
 * URL de lecture signée — pour le conteneur privé uniquement. Sur
 * `jp-photos`, en lecture publique, l'URL nue suffit et signer serait une
 * complication sans objet.
 */
export function urlDeLecture(conteneur: Conteneur, cleObjet: string): string {
  return urlSignee(conteneur, cleObjet, 'GET', EXPIRATION_LECTURE_S);
}

/** URL publique et stable d'un objet de `jp-photos`. */
export function urlPublique(cleObjet: string): string {
  const { origine, baseV1 } = racine();
  return `${origine}${cheminObjet(baseV1, 'photos', cleObjet)}`;
}

export { CONTENEURS };
