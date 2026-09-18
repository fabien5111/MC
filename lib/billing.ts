// Stripe — logique PURE : détection du mode, vérification de la signature du
// webhook, encodage des corps de requête. Aucun accès réseau ni base, donc
// testable (`npm run test`) et importable depuis n'importe où.
//
// **Aucun SDK `stripe`.** Ce dépôt appelle ses API tierces en `fetch` brut
// (`lib/ai/claude.ts` pour Anthropic, `lib/jira.ts` pour Jira) et vérifie ses
// signatures de webhook à la main. Ajouter une dépendance qui se reconstruit
// sur le nœud à chaque déploiement, pour trois appels REST et un HMAC de
// quinze lignes, n'apporterait rien — et le motif de vérification est déjà
// écrit et testé juste à côté (`verifierSignatureWebhook`).
//
// **La version de l'API Stripe n'est PAS épinglée dans le code**, mais dans le
// Dashboard du compte. Une valeur en dur ici serait un second endroit à tenir
// à jour, invisible depuis le compte qui subit les changements — alors que le
// Dashboard affiche la version en vigueur et l'historique des migrations.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const STRIPE_API_BASE = 'https://api.stripe.com/v1';

/**
 * Fenêtre d'acceptation de l'horodatage d'une signature (secondes).
 *
 * Sans elle, une requête signée interceptée resterait rejouable indéfiniment :
 * la signature, elle, ne périme pas. Cinq minutes couvrent largement l'écart
 * d'horloge d'un serveur correctement synchronisé.
 */
export const TOLERANCE_SIGNATURE_SEC = 300;

export type ModeStripe = 'test' | 'live';

/**
 * Mode déduit de la clé secrète, jamais d'une variable dédiée.
 *
 * C'est ce mode qui sélectionne la ligne de `billing_prices` : les
 * identifiants de prix diffèrent entre les deux mondes Stripe, et une seule
 * base sert les deux. Une variable `STRIPE_MODE` séparée serait une occasion
 * de plus de mentir — clé de test et mode `live` se contrediraient sans que
 * rien ne le signale.
 *
 * Une clé illisible retombe sur `live`, donc sur des prix qui n'existent pas,
 * donc sur un refus : l'erreur de configuration ferme la souscription au lieu
 * de l'ouvrir au mauvais tarif.
 */
export function modeStripe(cleSecrete: string): ModeStripe {
  return cleSecrete.includes('_test_') ? 'test' : 'live';
}

/**
 * Vérifie l'en-tête `Stripe-Signature` sur le corps BRUT de la requête.
 *
 * Stripe signe les octets envoyés : un `JSON.parse` suivi d'un `stringify`
 * réordonne les clés et invalide la signature. La route doit donc lire
 * `req.text()` avant tout, comme le webhook Jira.
 *
 * L'en-tête a la forme `t=1700000000,v1=<hex>[,v1=<hex>]` — plusieurs `v1`
 * pendant une rotation de secret, d'où la comparaison à chacune.
 *
 * `maintenantSec` est passé en paramètre plutôt que lu ici : c'est ce qui
 * rend la fenêtre de rejeu testable sans horloge truquée.
 */
export function verifierSignatureStripe(
  corpsBrut: string,
  enTete: string | null,
  secret: string,
  maintenantSec: number,
  toleranceSec: number = TOLERANCE_SIGNATURE_SEC,
): boolean {
  if (!enTete || !secret) return false;

  let horodatage = '';
  const signatures: string[] = [];
  for (const partie of enTete.split(',')) {
    const separateur = partie.indexOf('=');
    if (separateur < 0) continue;
    const cle = partie.slice(0, separateur).trim();
    const valeur = partie.slice(separateur + 1).trim();
    if (cle === 't') horodatage = valeur;
    else if (cle === 'v1' && valeur) signatures.push(valeur);
  }
  if (!horodatage || signatures.length === 0) return false;

  const t = Number(horodatage);
  if (!Number.isFinite(t)) return false;
  if (Math.abs(maintenantSec - t) > toleranceSec) return false;

  const attendue = createHmac('sha256', secret).update(`${horodatage}.${corpsBrut}`).digest('hex');
  // Longueurs comparées AVANT `timingSafeEqual`, qui lève sur des tampons de
  // tailles différentes plutôt que de rendre `false` — même précaution que
  // `verifierSignatureWebhook` (lib/jira.ts).
  return signatures.some(
    (s) => s.length === attendue.length && timingSafeEqual(Buffer.from(s), Buffer.from(attendue)),
  );
}

/**
 * Encode un corps de requête au format attendu par l'API Stripe :
 * `application/x-www-form-urlencoded` avec notation entre crochets pour les
 * structures imbriquées (`items[0][price]=price_123`). Stripe n'accepte pas
 * de JSON en entrée, quoi qu'en laisse croire le JSON qu'il rend.
 *
 * `undefined` et `null` sont OMIS plutôt qu'envoyés vides : Stripe traite un
 * champ présent et vide comme une demande d'effacement, ce qui effacerait
 * une valeur qu'on voulait seulement laisser inchangée.
 */
export function encoderFormulaireStripe(valeurs: Record<string, unknown>): string {
  const paires: string[] = [];

  const parcourir = (prefixe: string, valeur: unknown): void => {
    if (valeur === undefined || valeur === null) return;
    if (Array.isArray(valeur)) {
      valeur.forEach((v, i) => parcourir(`${prefixe}[${i}]`, v));
      return;
    }
    if (typeof valeur === 'object') {
      for (const [cle, v] of Object.entries(valeur as Record<string, unknown>)) {
        parcourir(`${prefixe}[${cle}]`, v);
      }
      return;
    }
    paires.push(`${encodeURIComponent(prefixe)}=${encodeURIComponent(String(valeur))}`);
  };

  for (const [cle, valeur] of Object.entries(valeurs)) parcourir(cle, valeur);
  return paires.join('&');
}

/**
 * Message lisible extrait d'une réponse d'erreur Stripe, pour les journaux.
 *
 * Jamais destiné au visiteur : un message Stripe peut nommer un identifiant
 * interne ou un état de compte. Les routes traduisent en message court, comme
 * le fait déjà `/api/plans/essayer` pour les codes `MC_TRIAL_*`.
 */
export function messageErreurStripe(corps: unknown): string {
  const erreur = (corps as { error?: { message?: unknown; code?: unknown; type?: unknown } } | null)?.error;
  if (!erreur) return 'réponse Stripe illisible.';
  const message = typeof erreur.message === 'string' ? erreur.message : 'erreur sans message';
  const code = typeof erreur.code === 'string' ? erreur.code : typeof erreur.type === 'string' ? erreur.type : null;
  return code ? `${message} (${code})` : message;
}
