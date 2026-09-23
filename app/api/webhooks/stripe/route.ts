// Route Handler — webhook Stripe (JEP-29 §6).
//
// C'est ici que les droits d'un membre suivent réellement son paiement :
// aucun autre chemin n'écrit `subscriptions` pour un abonnement Stripe. Les
// routes de souscription et de gestion (lots D et E) ne font que demander
// quelque chose à Stripe — c'est l'événement qui revient qui fait foi, jamais
// la réponse immédiate à un clic.
//
// **Vérification de signature sur le corps BRUT**, avant tout `JSON.parse` :
// Stripe signe les octets envoyés, pas le JSON reparsé (qui réordonne les
// clés). D'où `req.text()` et non `req.json()` — même construction que le
// webhook Jira.
//
// **Chaque événement est réservé avant d'être traité** (`billing_events`) :
// Stripe rejoue ses livraisons, c'est une garantie du service et pas un cas
// limite. Un rejeu d'un événement déjà traité repart en 200 sans rien faire.
//
// **L'ordre d'arrivée n'est pas garanti.** `customer.subscription.created`
// précède souvent `checkout.session.completed`. C'est pourquoi le membre est
// identifié par la métadonnée portée par l'ABONNEMENT lui-même, et pourquoi
// le rattachement du client Stripe est refait depuis les deux chemins : l'un
// comme l'autre suffit, aucun n'est un prérequis de l'autre.
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification, getNotifyEmailPreferenceAdmin } from '@/lib/notifications-data';
import { sendEmailBestEffort } from '@/lib/email';
import {
  isoDepuisUnixStripe,
  lireAbonnementStripe,
  lireClientFacture,
  lireSessionCheckout,
  messageAbonnementConfirme,
  messageEchecPaiement,
  verifierSignatureStripe,
} from '@/lib/billing';
import {
  appliquerAbonnementStripe,
  cloreEvenementStripe,
  enregistrerClientStripe,
  getIdClientStripeAdmin,
  reserverEvenementStripe,
  resoudreLibellePlanParPrix,
} from '@/lib/billing-data';

// Le traitement reste local à un seul membre : une écriture, plus un e-mail
// best-effort sur le seul cas d'échec de paiement. `maxDuration` est inerte
// sur Virtuozzo (c'est `proxy_read_timeout` de l'équilibreur qui borne), mais
// la valeur documente l'intention et vaut si le code repasse un jour ailleurs.
export const maxDuration = 30;

type Evenement = { id?: unknown; type?: unknown; data?: { object?: unknown } };

/** Événements traités. Tout le reste repart en 200, marqué `IGNORED`. */
const TRAITES = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
]);

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // 503 et non 200 : sans secret, on ne peut pas distinguer un appel de
    // Stripe d'un appel de n'importe qui. Répondre « reçu » ferait perdre
    // l'événement pour de bon, Stripe cessant alors de le rejouer.
    return NextResponse.json({ erreur: "STRIPE_WEBHOOK_SECRET n'est pas configurée." }, { status: 503 });
  }

  const corpsBrut = await req.text();
  const signature = req.headers.get('stripe-signature');
  if (!verifierSignatureStripe(corpsBrut, signature, secret, Math.floor(Date.now() / 1000))) {
    return NextResponse.json({ erreur: 'Signature invalide.' }, { status: 401 });
  }

  let evenement: Evenement;
  try {
    evenement = JSON.parse(corpsBrut);
  } catch {
    // Signature valide mais JSON illisible : ne devrait jamais arriver, et
    // rejouer n'y changerait rien. 200 silencieux.
    return NextResponse.json({ ok: true });
  }

  const id = typeof evenement.id === 'string' ? evenement.id : null;
  const type = typeof evenement.type === 'string' ? evenement.type : null;
  const objet = evenement.data?.object;
  if (!id || !type) return NextResponse.json({ ok: true });

  if (!TRAITES.has(type)) {
    // Ni réservé ni journalisé : un compte Stripe émet des dizaines de types
    // d'événements, les enregistrer tous ferait de `billing_events` un journal
    // de tout le compte plutôt que la trace de ce qu'on traite.
    return NextResponse.json({ ok: true, ignore: type });
  }

  const reserve = await reserverEvenementStripe(id, type);
  if (!reserve) {
    // Déjà traité, ou en cours de traitement ailleurs. 200 : demander à
    // Stripe de rejouer ne ferait que repasser par ici.
    return NextResponse.json({ ok: true, deja_traite: true });
  }

  try {
    await traiter(type, objet);
    await cloreEvenementStripe(id, 'PROCESSED');
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = (e as Error)?.message ?? 'erreur inconnue';
    console.error(`stripe webhook ${type} (${id}) :`, message);
    await cloreEvenementStripe(id, 'FAILED', message);
    // 500 pour que Stripe rejoue : l'événement est repassé en `FAILED`, donc
    // réservable à nouveau. C'est le seul cas où on veut être rappelé.
    return NextResponse.json({ erreur: 'Traitement impossible.' }, { status: 500 });
  }
}

async function traiter(type: string, objet: unknown): Promise<void> {
  if (type === 'checkout.session.completed') {
    const session = lireSessionCheckout(objet);
    // Une session sans membre identifiable n'est pas une anomalie à rejouer :
    // elle peut venir d'un paiement créé à la main depuis le Dashboard, qui ne
    // concerne aucun compte du site.
    if (!session) return;
    await enregistrerClientStripe(session.userId, session.customerId);
    return;
  }

  if (type.startsWith('customer.subscription.')) {
    const abo = lireAbonnementStripe(objet);
    if (!abo) {
      // Objet inexploitable : on LÈVE plutôt que d'ignorer. Écrire un
      // abonnement sans échéance lui donnerait des droits sans expiration,
      // et un 200 silencieux effacerait la trace du problème. L'échec, lui,
      // se lit dans `billing_events.error`.
      throw new Error('abonnement Stripe inexploitable (identifiants ou échéance manquants)');
    }

    // Rattachement du client refait ici, et pas seulement sur la session de
    // Checkout : c'est ce qui rend l'ordre d'arrivée des deux événements
    // indifférent, et ce qui garde le portail de gestion accessible même si
    // `checkout.session.completed` s'est perdu.
    if (abo.userId) await enregistrerClientStripe(abo.userId, abo.customerId);

    await appliquerAbonnementStripe({
      customerId: abo.customerId,
      subscriptionId: abo.subscriptionId,
      itemId: abo.itemId,
      priceId: abo.priceId,
      statut: abo.statut,
      finPeriode: abo.finPeriodeIso,
      annulationProgrammee: abo.annulationProgrammee,
      userId: abo.userId,
      renonciationLe: abo.renonciationLe,
    });

    // Confirmation, uniquement à la création — une montée, une descente
    // appliquée ou un simple renouvellement ont déjà leur propre affichage
    // sur `/reglages` (§14 `docs/abonnements.md`, trou relevé le 21/09).
    if (type === 'customer.subscription.created' && abo.userId) {
      await notifierAbonnementConfirme(abo.userId, abo.priceId, abo.finPeriodeIso);
    }
    return;
  }

  if (type === 'invoice.payment_failed') {
    await notifierEchecPaiement(objet);
    return;
  }
}

/**
 * Échec de prélèvement : on PRÉVIENT, on ne coupe pas (arbitrage JEP-29,
 * `docs/abonnements.md` §14). Stripe relance la carte pendant plusieurs
 * semaines ; la perte des droits n'arrive qu'à
 * `customer.subscription.deleted`.
 *
 * Aucune réservation de notification (`claimNotification`) n'est nécessaire :
 * chaque tentative de prélèvement produit son propre événement, et
 * `billing_events` garantit déjà qu'un événement n'est traité qu'une fois.
 * Réserver en plus ferait taire la deuxième alerte, qui est justement celle
 * qui devient urgente.
 */
async function notifierEchecPaiement(objet: unknown): Promise<void> {
  const customerId = lireClientFacture(objet);
  if (!customerId) return;

  const userId = await getIdClientStripeAdmin(customerId);
  if (!userId) return;

  const facture = (objet ?? {}) as Record<string, unknown>;
  const { titre, corps } = messageEchecPaiement(isoDepuisUnixStripe(facture.next_payment_attempt));

  const admin = createAdminClient();
  await createNotification(admin, userId, 'PAYMENT_FAILED', titre, corps);

  // E-mail best-effort et conditionné à la préférence du membre, comme le
  // cron d'abonnements : la notification in-app, elle, part toujours — c'est
  // elle qui conditionne la continuité du service.
  if (!(await getNotifyEmailPreferenceAdmin(admin, userId))) return;

  const { data: profil } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
  if (!profil?.email) return;

  await sendEmailBestEffort({
    to: profil.email,
    subject: titre,
    text: corps,
    html: `<p>${corps.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
  });
}

/**
 * Confirmation d'un abonnement tout juste créé (in-app et e-mail).
 *
 * Best-effort sur le libellé du plan : une ligne `billing_prices`
 * introuvable (config back-office incohérente) dégrade le titre plutôt que
 * de faire échouer tout le traitement de l'événement — les droits, écrits
 * juste au-dessus par `appliquerAbonnementStripe`, ne dépendent pas de ce
 * message.
 */
async function notifierAbonnementConfirme(userId: string, priceId: string, finPeriodeIso: string | null): Promise<void> {
  const admin = createAdminClient();
  const planLabel = (await resoudreLibellePlanParPrix(admin, priceId)) ?? 'votre formule';
  const { titre, corps } = messageAbonnementConfirme(planLabel, finPeriodeIso);

  await createNotification(admin, userId, 'SUBSCRIPTION_CONFIRMED', titre, corps);

  // Même doctrine que l'échec de paiement : e-mail best-effort, conditionné
  // à la préférence du membre ; la notification in-app, elle, part toujours.
  if (!(await getNotifyEmailPreferenceAdmin(admin, userId))) return;

  const { data: profil } = await admin.from('profiles').select('email').eq('id', userId).maybeSingle();
  if (!profil?.email) return;

  await sendEmailBestEffort({
    to: profil.email,
    subject: titre,
    text: corps,
    html: `<p>${corps.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`,
  });
}
