// Route Handler — réception des notifications SNS de bounce/complaint SES
// (cf. CLAUDE.md « E-mails par SES »). Abonnement HTTPS créé côté console
// AWS sur le topic SNS relié à l'identité SES vérifiée ; SNS envoie d'abord
// un message `SubscriptionConfirmation` (confirmé automatiquement ici), puis
// un `Notification` par événement.
//
// **Aucune authentification par secret partagé** : la protection de cette
// route est la vérification de signature RSA de `lib/ses-webhook.ts`, seule
// garantie qu'un message vient réellement d'AWS.
import { NextResponse } from 'next/server';
import { verifierMessageSns, confirmerAbonnementSns, parserEvenementSes } from '@/lib/ses-webhook';
import { enregistrerSuppression } from '@/lib/ses-notifications-data';

export const maxDuration = 15;

export async function POST(req: Request) {
  const corpsBrut = await req.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(corpsBrut);
  } catch {
    // Corps illisible : rien à traiter, rien à faire réessayer par SNS.
    return NextResponse.json({ ok: true });
  }

  const valide = await verifierMessageSns(payload);
  if (!valide) {
    return NextResponse.json({ erreur: 'Signature SNS invalide.' }, { status: 401 });
  }

  switch (payload.Type) {
    case 'SubscriptionConfirmation':
      await confirmerAbonnementSns(payload);
      break;

    case 'UnsubscribeConfirmation':
      // Le topic a été désabonné (manip côté console, ou abonnement recréé) —
      // rien à faire automatiquement : ré-abonner exigerait des appels API
      // SNS avec des droits que ce serveur n'a pas.
      console.warn('ses-webhook: désabonnement du topic SNS reçu.');
      break;

    case 'Notification': {
      const evenements = parserEvenementSes(payload);
      await Promise.all(evenements.map((e) => enregistrerSuppression(e.email, e.reason)));
      break;
    }

    default:
      // Type de message inconnu (évolution de l'API SNS) : 200 silencieux,
      // sans effet de bord.
      break;
  }

  return NextResponse.json({ ok: true });
}
