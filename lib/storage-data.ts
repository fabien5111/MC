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
// La signature part **nue**, sans le préfixe `sha256:` que documente Swift.
// Ce n'était pas le choix d'origine : la forme préfixée avait été retenue
// comme la plus explicite, et elle est refusée en 401 par CE cluster —
// mesuré le 05/09 sur les douze combinaisons possibles
// (`object-storage-diagnostic-signature.yml`, cf. § 8). Seule la forme nue
// passe, la longueur du condensat levant l'ambiguïté (40/64/128 caractères).
const DIGEST = 'sha256';

function env(nom: string): string {
  const v = process.env[nom];
  if (!v) throw new Error(`Variable d'environnement manquante : ${nom}`);
  return v;
}

// Racine rendue par `swift auth` (`OS_STORAGE_URL`). Chez Infomaniak elle
// porte un segment `/object` avant `/v1/` —
// `https://<hôte>/object/v1/AUTH_<projet>` — et ce segment fait bien partie
// du chemin que la signature doit couvrir : mesuré, une signature calculée
// sans lui est refusée en 401 (§ 8). On la reprend donc telle quelle, sans
// rien y retrancher. On en sépare l'origine du chemin : la signature ne
// porte QUE le chemin, l'URL finale a besoin des deux.
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
 * **non encodé** et pris tel que la racine le donne (`/object/v1/…` chez
 * Infomaniak). Exporté pour être testable sur des vecteurs fixes, sans
 * variables d'environnement ni réseau.
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
    temp_url_sig: sig,
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

/**
 * URL canonique et stable d'un objet, sans signature — c'est ce que
 * `urlFinale` rend à l'appelant après un dépôt, et ce que les colonnes image
 * persistent (§ 7.5, lot B2). Sur `jp-photos` (public), directement
 * fonctionnelle. Sur `jp-contact` (privé), elle ne l'est PAS — un `GET`
 * dessus échoue sans signature — mais sa forme stable permet d'en retrouver
 * la clé (`cleDepuisUrlCanonique`) pour la re-signer à chaque lecture
 * (`urlAffichablePrivee`), sans colonne séparée pour la clé.
 */
export function urlCanonique(conteneur: Conteneur, cleObjet: string): string {
  const { origine, baseV1 } = racine();
  return `${origine}${cheminObjet(baseV1, conteneur, cleObjet)}`;
}

/** URL publique et stable d'un objet de `jp-photos`. Alias de `urlCanonique`
 * figé sur ce conteneur, pour les appelants qui savent déjà être sur
 * `jp-photos` et n'ont pas à répéter le nom du conteneur. */
export function urlPublique(cleObjet: string): string {
  return urlCanonique('photos', cleObjet);
}

/**
 * Inverse de `urlCanonique` : retrouve la clé d'objet à partir d'une valeur
 * déjà stockée en base, ou `null` si elle n'a pas cette forme (une data-URL
 * pas encore reprise par le B3, ou une valeur imprévue).
 */
export function cleDepuisUrlCanonique(conteneur: Conteneur, valeur: string): string | null {
  const { origine, baseV1 } = racine();
  const prefixe = `${origine}${cheminObjet(baseV1, conteneur, '')}`;
  return valeur.startsWith(prefixe) ? valeur.slice(prefixe.length) : null;
}

/**
 * URL affichable pour une valeur du conteneur PRIVÉ, à appeler juste avant
 * de rendre — jamais persistée, elle expire en `EXPIRATION_LECTURE_S`
 * (§ 7.5, lot B2 étape 4 : `contact_message_photos` / `contact_reply_photos`).
 * Une valeur qui n'a pas la forme d'une URL canonique de ce conteneur (une
 * data-URL pas encore migrée par le B3) est rendue inchangée — c'est déjà ce
 * qu'un `<img>` sait afficher.
 */
export function urlAffichablePrivee(conteneur: Conteneur, valeur: string): string {
  const cle = cleDepuisUrlCanonique(conteneur, valeur);
  return cle ? urlDeLecture(conteneur, cle) : valeur;
}

export { CONTENEURS };
