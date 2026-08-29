// Garde de quota pour les Route Handlers.
//
// Séparé de `lib/entitlements-data.ts` parce qu'il importe `NextResponse` :
// la couche de données, elle, est lue aussi par des Server Components qui
// n'ont rien à faire du typage HTTP.
//
// **Réserver plutôt que constater.** Le crédit est consommé AVANT l'appel
// facturé, et rendu si celui-ci échoue. La spécification proposait l'inverse
// (§5.2, « consume après le succès ») ; c'est intenable ici : entre un
// contrôle et un appel de trente secondes, dix requêtes simultanées passent
// toutes le contrôle et l'API est appelée dix fois. Réserver borne la
// dépense, ce qui est toute la raison d'être de ces quotas ; le crédit rendu
// répare le seul cas défavorable, l'échec.
import { NextResponse } from 'next/server';
import { blockingMessage, type QuotaFailure, type Verdict } from '@/lib/entitlements';
import {
  consumeQuota,
  getCurrentPlan,
  getEntitlements,
  getGrid,
  refundQuota,
} from '@/lib/entitlements-data';

/**
 * Texte du refus, composé à partir de la grille — jamais écrit en dur par
 * route. Ajouter une fonctionnalité ou changer un plafond en back-office
 * change donc le message sans toucher au code.
 *
 * Exporté pour les rares routes qui doivent annoncer un refus SANS statut
 * d'erreur : /api/projet/structure est best-effort par construction, son
 * appelant traite tout statut non-2xx comme « pas de proposition » et
 * n'afficherait rien.
 */
export async function messageQuota(userId: string, key: string, echec: QuotaFailure): Promise<string> {
  const [grille, plan] = await Promise.all([getGrid(), getCurrentPlan(userId)]);

  const verdict: Verdict =
    echec.code === 'EXCEEDED'
      ? { autorise: false, raison: 'LIMITE_ATTEINTE', limite: echec.limit, usage: echec.usage ?? 0 }
      : { autorise: false, raison: 'PLAN_INSUFFISANT', limite: null, usage: 0 };

  const message = blockingMessage(grille, key, plan?.code ?? '', verdict);
  return message ? `${message.titre}. ${message.corps}` : 'Cette action n’est pas disponible sur votre formule.';
}

async function refus(userId: string, key: string, echec: QuotaFailure): Promise<NextResponse> {
  const texte = await messageQuota(userId, key, echec);

  // 429 pour un quota épuisé (l'action redeviendra possible à la recharge),
  // 403 pour un droit que la formule n'ouvre pas (elle ne le redeviendra pas
  // sans changement de plan). La distinction porte l'information : elle dit à
  // l'appelant s'il doit attendre ou souscrire.
  return NextResponse.json(
    {
      erreur: texte,
      code: echec.code === 'EXCEEDED' ? 'QUOTA_EPUISE' : 'PLAN_INSUFFISANT',
    },
    { status: echec.code === 'EXCEEDED' ? 429 : 403 },
  );
}

/**
 * Vérifie un droit sans rien consommer. Pour les appels qui participent à une
 * action déjà décomptée ailleurs — la transcription d'une page, facturée mais
 * comptée une fois pour l'import entier.
 */
export async function verifierAcces(userId: string, key: string): Promise<NextResponse | null> {
  const droits = await getEntitlements(userId);
  if (droits[key]?.allowed) return null;
  return refus(userId, key, { code: 'DENIED', featureKey: key, usage: null, limit: null });
}

export type Reservation = { refus: NextResponse } | { rendre: () => Promise<void> };

/** `true` quand la réservation a échoué et que la route doit rendre `refus`. */
export function estRefus(r: Reservation): r is { refus: NextResponse } {
  return 'refus' in r;
}

/**
 * Réserve un crédit. Rend soit la réponse de refus à retourner telle quelle,
 * soit un jeton dont `rendre()` restitue le crédit si l'action échoue.
 */
export async function reserverQuota(userId: string, key: string, n = 1): Promise<Reservation> {
  const echec = await consumeQuota(key, n);
  if (echec) return { refus: await refus(userId, key, echec) };
  return { rendre: () => refundQuota(key, n) };
}
