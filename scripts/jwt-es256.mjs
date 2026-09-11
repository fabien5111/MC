#!/usr/bin/env node
// Clés de signature JWT du lot C — GoTrue auto-hébergé (docs/migration-infomaniak.md § 7.10).
//
//   node scripts/jwt-es256.mjs generer [kid]        → GOTRUE_JWT_KEYS  (privé, tableau)
//   node scripts/jwt-es256.mjs public  < prive.json → PGRST_JWT_SECRET (public, objet)
//   node scripts/jwt-es256.mjs frapper anon         < prive.json → NEXT_PUBLIC_SUPABASE_ANON_KEY
//   node scripts/jwt-es256.mjs frapper service_role < prive.json → SUPABASE_SERVICE_ROLE_KEY
//
// Aucune dépendance : Node exporte nativement une clé au format JWK. Deux
// remarques sur des formes qui ne se devinent pas, l'une et l'autre mesurées
// contre le code de `supabase/auth` v2.196.0 (§ 7.10) :
//
//   - GoTrue attend un **TABLEAU** de JWK **privées** : `[{…}]`, jamais
//     `{"keys": […]}` — son décodeur fait un `json.Unmarshal` vers une liste.
//   - PostgREST attend l'inverse : un **OBJET** `{"keys": […]}` de JWK
//     **publiques**. Les deux logiciels lisent la même matière sous deux
//     formes différentes, et se tromper de forme produit un 401 sans message.
//
// Le champ `alg` n'est pas décoratif : sans lui, GoTrue démarre, valide sa
// configuration et sert bien la clé publique sur son JWKS — puis échoue à la
// PREMIÈRE émission de jeton (« HMAC sign expects []byte »), parce qu'il
// retombe sur HS256 avec une clé elliptique entre les mains. Mesuré.
import { createPrivateKey, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

function generer(kid = randomUUID()) {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' }); // kty, crv, x, y, d
  return [{ ...jwk, kid, use: 'sig', alg: 'ES256', key_ops: ['sign', 'verify'] }];
}

// Le jeu de clés de GoTrue n'admet QU'UNE clé portant `sign` — il refuse de
// démarrer au-delà (« multiple signing keys detected »). Une clé héritée qu'on
// garderait pour vérifier d'anciens jetons doit donc porter `["verify"]` seul.
function publiques(privees) {
  return {
    keys: privees
      .filter((k) => k.kty !== 'oct') // une clé symétrique n'a pas de partie publique
      .map(({ d, key_ops, ...pub }) => ({ ...pub, key_ops: ['verify'] })),
  };
}

// Jetons applicatifs `anon` / `service_role`. Ce ne sont PAS des secrets
// délivrés par une autorité qu'il faudrait conserver : ce sont des
// affirmations signées (« le porteur a le rôle anon »). PostgREST ne tient
// aucune liste de jetons valides — il vérifie une SIGNATURE contre le JWKS.
// N'importe quel jeton refrappé avec la même clé privée vaut donc l'original,
// et « perdre » ces valeurs n'a pas de sens : on les refait.
//
// Ce verbe manquait au 11/09 : la bascule du C3 a dû les frapper depuis la
// console du navigateur, faute d'un outil ici (§ 7.14).
//
// `dsaEncoding: 'ieee-p1363'` n'est pas un détail : JWS attend la signature
// en R||S brut. Sans ce réglage Node produit du DER — Node lui-même revérifie
// le jeton sans broncher, et PostgREST le refuse par un 401 sans message.
// Même famille de piège que les deux formes de JWK ci-dessus.
const ROLES = ['anon', 'service_role'];
const DIX_ANS = 10 * 365 * 24 * 3600; // même horizon que les clés Supabase d'origine

function b64(valeur) {
  const brut = typeof valeur === 'string' ? valeur : JSON.stringify(valeur);
  return Buffer.from(brut).toString('base64url');
}

function frapper(privees, role) {
  const jwk = privees[0];
  const cle = createPrivateKey({ key: jwk, format: 'jwk' });
  const iat = Math.floor(Date.now() / 1000);
  const corps =
    b64({ alg: 'ES256', typ: 'JWT', kid: jwk.kid }) +
    '.' +
    b64({ iss: 'supabase', role, iat, exp: iat + DIX_ANS });
  const signature = sign('sha256', Buffer.from(corps), { key: cle, dsaEncoding: 'ieee-p1363' });
  return `${corps}.${signature.toString('base64url')}`;
}

const [, , commande, arg] = process.argv;
if (commande === 'generer') {
  console.log(JSON.stringify(generer(arg)));
} else if (commande === 'public') {
  console.log(JSON.stringify(publiques(JSON.parse(readFileSync(0, 'utf8')))));
} else if (commande === 'frapper') {
  if (!ROLES.includes(arg)) {
    console.error(`Usage : jwt-es256.mjs frapper ${ROLES.join('|')} < prive.json`);
    process.exit(1);
  }
  console.log(frapper(JSON.parse(readFileSync(0, 'utf8')), arg));
} else {
  console.error('Usage : jwt-es256.mjs generer [kid] | public < prive.json |');
  console.error(`        jwt-es256.mjs frapper ${ROLES.join('|')} < prive.json`);
  process.exit(1);
}
