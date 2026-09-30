// Lien de partage d'un carnet (JEP-21) — jeton signé, server-only.
//
// POURQUOI UN JETON SIGNÉ ET NON UNE TABLE. Le lien est permanent et n'est
// pas révocable (arbitrage JEP-21) : il n'y a donc rien à mémoriser côté base
// — ni date d'expiration, ni drapeau de révocation. Un HMAC de l'identifiant
// du propriétaire suffit à prouver que le lien a été émis par le site, sans
// migration SQL (que pgweb ne sait pas jouer, cf. CLAUDE.md) et sans lecture
// supplémentaire pour le vérifier. Le jour où la révocation deviendra un
// besoin, il faudra une table `book_share_links` : ce module est le seul
// endroit à changer, la forme du lien (`/carnet/partage/<jeton>`) restant la
// même.
//
// FORME. `<uuid du propriétaire, 32 hex sans tirets><signature, 22 car.
// base64url>` — 54 caractères, sans séparateur à échapper dans une URL.
// 128 bits de signature : infalsifiable en pratique, et la seule chose qu'on
// protège est l'accès en lecture aux recettes publiées (au sens modération)
// d'un carnet, jamais une écriture.
//
// SECRET. `CARNET_PARTAGE_SECRET` s'il est posé ; sinon, dérivé de
// `SUPABASE_SERVICE_ROLE_KEY` avec une étiquette propre (séparation de
// domaine : la signature ne révèle rien de la clé). Conséquence à connaître :
// changer l'une ou l'autre de ces valeurs invalide tous les liens déjà
// distribués — c'est aussi, faute de mieux, la seule révocation possible.
import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const SIG_LENGTH = 22;
const UUID_HEX = /^[0-9a-f]{32}$/;

function secret(): string | null {
  const explicite = process.env.CARNET_PARTAGE_SECRET;
  if (explicite) return explicite;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!service) return null;
  return createHmac('sha256', service).update('jepatisse:carnet-partage:v1').digest('base64url');
}

function signer(ownerHex: string, cle: string): string {
  return createHmac('sha256', cle).update(ownerHex).digest('base64url').slice(0, SIG_LENGTH);
}

function versHex(uuid: string): string {
  return uuid.replace(/-/g, '').toLowerCase();
}

function versUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Jeton de partage du carnet de `ownerId`, ou `null` si aucun secret n'est configuré. */
export function jetonCarnet(ownerId: string): string | null {
  const cle = secret();
  if (!cle) return null;
  const hex = versHex(ownerId);
  if (!UUID_HEX.test(hex)) return null;
  return `${hex}${signer(hex, cle)}`;
}

/** Chemin public du lien de partage, ou `null` (secret absent). */
export function cheminPartageCarnet(ownerId: string): string | null {
  const jeton = jetonCarnet(ownerId);
  return jeton ? `/carnet/partage/${jeton}` : null;
}

/** Propriétaire désigné par un jeton, ou `null` s'il est mal formé ou mal signé. */
export function proprietaireDuJeton(jeton: string): string | null {
  const cle = secret();
  if (!cle || jeton.length !== 32 + SIG_LENGTH) return null;
  const hex = jeton.slice(0, 32).toLowerCase();
  if (!UUID_HEX.test(hex)) return null;
  const attendue = Buffer.from(signer(hex, cle));
  const recue = Buffer.from(jeton.slice(32));
  if (attendue.length !== recue.length || !timingSafeEqual(attendue, recue)) return null;
  return versUuid(hex);
}
