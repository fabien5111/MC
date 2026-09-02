// Vérification et interprétation des messages SNS portant les événements
// bounce/complaint de SES (souscription HTTPS d'un topic SNS configuré côté
// AWS — cf. CLAUDE.md « E-mails par SES »).
//
// SNS signe chaque message avec une clé RSA dont le certificat public est
// téléchargeable à l'URL qu'il fournit lui-même (`SigningCertURL`). Vérifier
// cette signature est la SEULE protection de cette route : contrairement au
// webhook Jira (`lib/jira.ts`, signé en HMAC avec un secret partagé), SNS ne
// propose aucun secret à vérifier — sans cette vérification, n'importe qui
// connaissant l'URL de la route pourrait forger un faux bounce et bloquer
// l'envoi vers une adresse arbitraire (cf. `lib/ses-notifications-data.ts`).
import crypto from 'node:crypto';

// `SigningCertURL` et `SubscribeURL` doivent pointer vers un domaine SNS réel
// — sans ce contrôle, la route téléchargerait un « certificat » ou appellerait
// une URL de confirmation fournis par l'appelant, ce qui en ferait un relais
// vers n'importe quel hôte (SSRF).
const HOTE_SNS = /^sns\.[a-z0-9-]+\.amazonaws\.com$/i;

function hoteAutorise(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOTE_SNS.test(u.hostname);
  } catch {
    return false;
  }
}

// Champs à canonicaliser, dans cet ordre exact (alphabétique par nom de
// champ) — imposé par la spec SNS. `Subject` est absent d'une notification
// sans objet, ce que couvre le filtre plus bas.
const CHAMPS_NOTIFICATION = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'] as const;
const CHAMPS_CONFIRMATION = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'] as const;

function chaineACanonicaliser(payload: Record<string, unknown>): string | null {
  const champs = payload.Type === 'Notification' ? CHAMPS_NOTIFICATION : CHAMPS_CONFIRMATION;
  let chaine = '';
  for (const champ of champs) {
    const valeur = payload[champ];
    if (valeur === undefined) continue;
    if (typeof valeur !== 'string') return null;
    chaine += `${champ}\n${valeur}\n`;
  }
  return chaine;
}

// Cache mémoire du process — un certificat SNS ne change pas d'une requête à
// l'autre ; évite un aller-retour réseau à chaque notification tant que
// l'instance serverless reste chaude. Sans conséquence si l'instance est
// recyclée : le cache est simplement vide au prochain démarrage.
const certsCache = new Map<string, string>();

async function telechargerCertificat(url: string): Promise<string | null> {
  const enCache = certsCache.get(url);
  if (enCache) return enCache;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const pem = await res.text();
    certsCache.set(url, pem);
    return pem;
  } catch {
    return null;
  }
}

/** Vérifie la signature RSA d'un message SNS. Ne lève jamais — un message mal formé est simplement invalide. */
export async function verifierMessageSns(payload: Record<string, unknown>): Promise<boolean> {
  const { Signature, SignatureVersion, SigningCertURL, Type } = payload;
  if (typeof Signature !== 'string' || typeof SigningCertURL !== 'string' || typeof Type !== 'string') return false;
  if (!hoteAutorise(SigningCertURL)) return false;

  const chaine = chaineACanonicaliser(payload);
  if (!chaine) return false;

  const certificat = await telechargerCertificat(SigningCertURL);
  if (!certificat) return false;

  const algorithme = SignatureVersion === '2' ? 'RSA-SHA256' : 'RSA-SHA1';
  try {
    const verificateur = crypto.createVerify(algorithme);
    verificateur.update(chaine, 'utf8');
    return verificateur.verify(certificat, Signature, 'base64');
  } catch {
    return false;
  }
}

/**
 * Confirme l'abonnement HTTPS au topic SNS — appelé une seule fois, au
 * premier message reçu après la création de l'abonnement côté AWS. Sans
 * cette confirmation (un simple GET sur l'URL fournie par SNS), le topic
 * n'envoie plus jamais rien à cette route.
 */
export async function confirmerAbonnementSns(payload: Record<string, unknown>): Promise<void> {
  const url = payload.SubscribeURL;
  if (typeof url !== 'string' || !hoteAutorise(url)) {
    console.error('ses-webhook: SubscribeURL absente ou hôte non autorisé.');
    return;
  }
  try {
    await fetch(url);
  } catch (e) {
    console.error("ses-webhook: confirmation d'abonnement SNS échouée :", (e as Error).message);
  }
}

export type EvenementSes = { email: string; reason: 'bounce_permanent' | 'complaint' };

/**
 * Interprète le contenu (`Message`, une chaîne JSON imbriquée) d'une
 * notification SES relayée par SNS. Ne retient que les échecs définitifs —
 * un bounce transitoire (boîte pleine, panne temporaire) n'est pas une
 * raison de ne plus jamais écrire à cette adresse.
 */
export function parserEvenementSes(payload: Record<string, unknown>): EvenementSes[] {
  const messageBrut = payload.Message;
  if (typeof messageBrut !== 'string') return [];

  let message: Record<string, unknown>;
  try {
    message = JSON.parse(messageBrut);
  } catch {
    return [];
  }

  const type = message.notificationType ?? message.eventType;
  const evenements: EvenementSes[] = [];

  if (type === 'Bounce') {
    const bounce = message.bounce as Record<string, unknown> | undefined;
    if (bounce?.bounceType === 'Permanent') {
      const destinataires = (bounce.bouncedRecipients as Array<Record<string, unknown>> | undefined) ?? [];
      for (const d of destinataires) {
        if (typeof d.emailAddress === 'string') evenements.push({ email: d.emailAddress, reason: 'bounce_permanent' });
      }
    }
  } else if (type === 'Complaint') {
    const complaint = message.complaint as Record<string, unknown> | undefined;
    const destinataires = (complaint?.complainedRecipients as Array<Record<string, unknown>> | undefined) ?? [];
    for (const d of destinataires) {
      if (typeof d.emailAddress === 'string') evenements.push({ email: d.emailAddress, reason: 'complaint' });
    }
  }

  return evenements;
}
