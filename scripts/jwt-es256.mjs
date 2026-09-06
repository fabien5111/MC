#!/usr/bin/env node
// Clés de signature JWT du lot C — GoTrue auto-hébergé (docs/migration-infomaniak.md § 7.10).
//
//   node scripts/jwt-es256.mjs generer [kid]   → GOTRUE_JWT_KEYS  (privé, tableau)
//   node scripts/jwt-es256.mjs public < f.json → PGRST_JWT_SECRET (public, objet)
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
import { generateKeyPairSync, randomUUID } from 'node:crypto';
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

const [, , commande, arg] = process.argv;
if (commande === 'generer') {
  console.log(JSON.stringify(generer(arg)));
} else if (commande === 'public') {
  console.log(JSON.stringify(publiques(JSON.parse(readFileSync(0, 'utf8')))));
} else {
  console.error('Usage : jwt-es256.mjs generer [kid] | jwt-es256.mjs public < prive.json');
  process.exit(1);
}
