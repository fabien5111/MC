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
import { formatDate } from '@/lib/format';

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

// ── Lecture des objets Stripe (lot C) ───────────────────────

/**
 * Forme normalisée d'un abonnement Stripe, telle que la route de webhook la
 * passe à `mc_apply_stripe_subscription`.
 *
 * Le statut reste BRUT (`active`, `past_due`, `canceled`…) : sa traduction en
 * `ACTIVE` / `CANCELLED` n'existe qu'en SQL, et deux implémentations de cette
 * règle divergeraient au premier changement (§5 de `docs/abonnements.md`).
 */
export type AbonnementStripeBrut = {
  subscriptionId: string;
  customerId: string;
  itemId: string;
  priceId: string;
  statut: string;
  finPeriodeIso: string;
  annulationProgrammee: boolean;
  /** Métadonnée posée à l'ouverture du Checkout — absente sur les événements suivants. */
  userId: string | null;
  renonciationLe: string | null;
};

function texte(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Un champ Stripe « expandable » est soit l'identifiant, soit l'objet complet. */
function identifiant(v: unknown): string | null {
  if (typeof v === 'string') return v || null;
  if (v && typeof v === 'object') return texte((v as { id?: unknown }).id);
  return null;
}

function unixVersIso(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return new Date(v * 1000).toISOString();
}

/**
 * Normalise un objet `subscription` reçu par webhook. `null` si l'objet
 * n'est pas exploitable — la route le signale alors en échec plutôt que
 * d'écrire un abonnement incomplet.
 *
 * **La date de fin de période se lit à DEUX endroits.** Stripe l'a déplacée de
 * l'abonnement vers ses articles dans les versions récentes de l'API. Lire un
 * seul des deux marcherait aujourd'hui et cesserait de marcher le jour d'une
 * montée de version faite depuis le Dashboard — sans rien casser bruyamment :
 * l'abonnement serait simplement écrit sans échéance, donc sans expiration.
 */
export function lireAbonnementStripe(objet: unknown): AbonnementStripeBrut | null {
  if (!objet || typeof objet !== 'object') return null;
  const sub = objet as Record<string, unknown>;

  const subscriptionId = texte(sub.id);
  const customerId = identifiant(sub.customer);
  const statut = texte(sub.status);
  if (!subscriptionId || !customerId || !statut) return null;

  const articles = (sub.items as { data?: unknown[] } | undefined)?.data;
  const premier = Array.isArray(articles) ? (articles[0] as Record<string, unknown> | undefined) : undefined;
  if (!premier) return null;

  const itemId = texte(premier.id);
  const priceId = identifiant(premier.price);
  if (!itemId || !priceId) return null;

  const finPeriodeIso = unixVersIso(sub.current_period_end) ?? unixVersIso(premier.current_period_end);
  if (!finPeriodeIso) return null;

  const metadata = (sub.metadata ?? {}) as Record<string, unknown>;

  return {
    subscriptionId,
    customerId,
    itemId,
    priceId,
    statut,
    finPeriodeIso,
    annulationProgrammee: sub.cancel_at_period_end === true,
    userId: texte(metadata.user_id),
    renonciationLe: texte(metadata.waiver_accepted_at),
  };
}

/**
 * Couple (membre, client Stripe) lisible sur une session Checkout achevée.
 *
 * `client_reference_id` est lu en repli de la métadonnée : c'est le champ que
 * Stripe renvoie tel quel, sans risque qu'une métadonnée soit tronquée ou
 * écrasée par un autre chemin de création.
 */
export function lireSessionCheckout(objet: unknown): { userId: string; customerId: string } | null {
  if (!objet || typeof objet !== 'object') return null;
  const session = objet as Record<string, unknown>;
  const metadata = (session.metadata ?? {}) as Record<string, unknown>;
  const userId = texte(metadata.user_id) ?? texte(session.client_reference_id);
  const customerId = identifiant(session.customer);
  if (!userId || !customerId) return null;
  return { userId, customerId };
}

/** Identifiant client Stripe d'une facture, pour retrouver le membre concerné. */
export function lireClientFacture(objet: unknown): string | null {
  if (!objet || typeof objet !== 'object') return null;
  return identifiant((objet as Record<string, unknown>).customer);
}

/**
 * Message d'échec de prélèvement, notifié au membre (in-app et e-mail).
 *
 * **Il dit explicitement que l'accès continue.** C'est l'arbitrage JEP-29
 * (§14) rendu lisible : la spécification d'origine coupait les droits dès le
 * premier refus de carte, on notifie à la place. Un message qui se
 * contenterait d'annoncer l'échec laisserait croire le contraire et ferait
 * paniquer — ou résilier — un membre dont la carte a simplement expiré.
 */
export function messageEchecPaiement(prochaineTentativeIso: string | null): { titre: string; corps: string } {
  const relance = prochaineTentativeIso
    ? ` Une nouvelle tentative aura lieu le ${formatDate(prochaineTentativeIso)}.`
    : ' Une nouvelle tentative aura lieu automatiquement dans les prochains jours.';

  return {
    titre: 'Paiement refusé — votre accès continue',
    corps:
      'Le prélèvement de votre abonnement a été refusé par votre banque. ' +
      `Votre accès n’est pas interrompu.${relance}` +
      '\n\nPour éviter toute interruption, mettez à jour votre moyen de paiement ' +
      'depuis Réglages → Mon forfait.',
  };
}

/** Horodatage Stripe (secondes) → ISO, ou `null`. Exposé pour les routes. */
export function isoDepuisUnixStripe(v: unknown): string | null {
  return unixVersIso(v);
}

// ── Clé d'idempotence ────────────────────────────────────────

/** Largeur de la fenêtre de regroupement d'une clé d'idempotence (ms). */
export const FENETRE_IDEMPOTENCE_MS = 10 * 60 * 1000;

/**
 * Compose une clé d'idempotence stable sur une courte fenêtre, jamais à
 * durée indéfinie.
 *
 * Une clé figée sur `(membre, action)` sans limite de temps protège bien
 * contre une vraie retransmission réseau (mobile qui coupe, `appelStripe` qui
 * relit une réponse perdue) — c'est l'usage documenté par Stripe — mais elle
 * entomberait aussi un abandon volontaire : Stripe cache une réponse jusqu'à
 * 24 h, donc un membre qui revient le lendemain retenter le même geste
 * recevrait la session périmée de la veille au lieu d'une nouvelle. La
 * fenêtre de dix minutes couvre la vraie retransmission sans figer l'intention
 * du membre au-delà d'une session de clic.
 */
export function cleIdempotence(prefixe: string, ...segments: string[]): string {
  const fenetre = Math.floor(Date.now() / FENETRE_IDEMPOTENCE_MS);
  return [prefixe, ...segments, String(fenetre)].join(':');
}

// ── Changement de formule (lot E) ───────────────────────────

export type SensChangement = 'MONTEE' | 'DESCENTE' | 'IDENTIQUE';

/**
 * Sens d'un changement de formule, décidé par l'ORDRE des plans dans la
 * grille, jamais par leur code.
 *
 * `plans.order_index` est déjà ce qui ordonne les colonnes de `/plans` et ce
 * sur quoi `upgradeSuggestion` s'appuie : s'en servir ici aussi évite un
 * `if (code === 'PRO')` que la règle ESLint du dépôt interdit — et laisse un
 * palier ajouté en back-office se comporter correctement sans une ligne de
 * code.
 */
export function sensChangement(ordreCourant: number, ordreCible: number): SensChangement {
  if (ordreCible > ordreCourant) return 'MONTEE';
  if (ordreCible < ordreCourant) return 'DESCENTE';
  return 'IDENTIQUE';
}

/**
 * Code d'erreur Stripe (`card_declined`, `authentication_required`…), pour
 * traduire un refus en message utile plutôt qu'en « une erreur est survenue ».
 *
 * Séparé de `messageErreurStripe`, qui compose une ligne pour les journaux :
 * ici on veut la valeur brute, pour brancher dessus.
 */
export function codeErreurStripe(corps: unknown): string | null {
  const erreur = (corps as { error?: { code?: unknown; decline_code?: unknown } } | null)?.error;
  if (!erreur) return null;
  if (typeof erreur.code === 'string') return erreur.code;
  if (typeof erreur.decline_code === 'string') return erreur.decline_code;
  return null;
}

/**
 * Message destiné au membre quand un changement de formule payant est refusé.
 *
 * Deux refus se ressemblent pour la machine et pas du tout pour la personne :
 * une carte refusée demande d'en changer, une authentification demandée
 * demande seulement de la confirmer auprès de sa banque. Les confondre
 * enverrait la moitié des gens changer une carte qui fonctionne.
 */
export function messageRefusChangement(code: string | null): string {
  switch (code) {
    case 'authentication_required':
      return (
        'Votre banque demande une confirmation pour ce paiement. Mettez à jour ou reconfirmez votre moyen ' +
        'de paiement depuis « Gérer mon moyen de paiement », puis réessayez.'
      );
    case 'card_declined':
    case 'insufficient_funds':
    case 'expired_card':
      return (
        'Votre banque a refusé le paiement. Vérifiez votre moyen de paiement depuis « Gérer mon moyen de ' +
        'paiement », puis réessayez.'
      );
    default:
      return "Le changement de formule n'a pas pu aboutir. Votre formule actuelle est inchangée.";
  }
}

export type PhaseEcheancier = {
  startDate: number | null;
  endDate: number | null;
  priceId: string | null;
};

/**
 * Lit les phases d'un échéancier Stripe (`subscription_schedule`).
 *
 * Sert à RELIRE ce que Stripe a réellement enregistré après une écriture,
 * plutôt qu'à faire confiance au fait que l'appel n'a pas levé : un
 * échéancier accepté mais mal composé facturerait le membre de travers, en
 * silence et à retardement. C'est la contrepartie assumée d'une API dont la
 * sémantique des phases ne se vérifie qu'à l'usage.
 */
export function lirePhasesEcheancier(objet: unknown): PhaseEcheancier[] {
  const phases = (objet as { phases?: unknown } | null)?.phases;
  if (!Array.isArray(phases)) return [];
  return phases.map((p) => {
    const phase = (p ?? {}) as Record<string, unknown>;
    const articles = (phase.items as { price?: unknown }[] | undefined) ?? [];
    return {
      startDate: typeof phase.start_date === 'number' ? phase.start_date : null,
      endDate: typeof phase.end_date === 'number' ? phase.end_date : null,
      priceId: identifiant(articles[0]?.price),
    };
  });
}

/**
 * Phase réellement en cours d'un échéancier, jamais « la première ».
 *
 * Une fois une première descente appliquée, la phase 0 est une phase PASSÉE :
 * la reprendre comme phase courante ferait réémettre une date de début
 * révolue et perdre la phase réelle. Le cas se produit dès qu'un membre
 * programme une descente, la laisse s'appliquer, puis en programme une autre.
 */
export function phaseCourante(phases: PhaseEcheancier[], maintenantSec: number): PhaseEcheancier | null {
  const encadrante = phases.find(
    (p) => p.startDate !== null && p.startDate <= maintenantSec && (p.endDate === null || maintenantSec < p.endDate),
  );
  if (encadrante) return encadrante;
  // Aucune phase n'encadre l'instant présent (frontière tout juste franchie,
  // horloges décalées) : la plus récente déjà commencée est la moins fausse.
  const commencees = phases.filter((p) => p.startDate !== null && p.startDate <= maintenantSec);
  return commencees.length ? commencees[commencees.length - 1] : null;
}

/**
 * Vérifie qu'un échéancier relu dit bien « la formule courante jusqu'à
 * l'échéance, puis la nouvelle ». Faux → la route annule l'échéancier plutôt
 * que de laisser un membre sur une facturation qu'on n'a pas comprise.
 */
export function echeancierConforme(
  phases: PhaseEcheancier[],
  prixCourant: string,
  prixCible: string,
  finPeriode: number,
): boolean {
  if (phases.length !== 2) return false;
  const [actuelle, suivante] = phases;
  if (actuelle.priceId !== prixCourant) return false;
  if (suivante.priceId !== prixCible) return false;
  if (actuelle.endDate !== finPeriode) return false;
  if (suivante.startDate !== finPeriode) return false;
  return true;
}
