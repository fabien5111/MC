// Route Handler — ouverture d'une session Stripe Checkout (JEP-29 §4.1).
//
// **Ne pose jamais de droits.** Cette route demande une chose à Stripe et
// rend une URL de redirection ; c'est le webhook (lot C) qui écrit
// `subscriptions` une fois le paiement réellement confirmé. Un membre qui
// ferme l'onglet ici n'est pas abonné — c'est voulu.
//
// **Les deux cases de la fenêtre de souscription sont revérifiées ici** —
// acceptation des CGV (dans leur version EN VIGUEUR) et demande d'accès
// immédiat au service —, jamais sur la seule foi du client : une case cochée
// dans le navigateur ne prouve rien (doctrine du dépôt), et un litige se
// tranche sur ce qui est tracé côté serveur, pas sur ce qui a été affiché à
// l'écran. Les deux sont horodatées en métadonnée de l'abonnement Stripe.
//
// La demande d'accès immédiat n'est PLUS une renonciation au droit de
// rétractation (CGV art. 11) : le membre garde ses 14 jours, remboursé au
// prorata de la durée restante. La métadonnée garde son nom historique,
// `waiver_accepted_at`, recopiée telle quelle en base par le webhook
// (`mc_apply_stripe_subscription`) — la renommer imposerait une migration
// pour un changement de sens qui, lui, est porté par la version des CGV.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { siteUrl } from '@/lib/site-url';
import { isReadOnlySession } from '@/lib/impersonation';
import { cleIdempotence } from '@/lib/billing';
import { CGV_VERSION, cgvVersionValide } from '@/lib/cgv';
import { appelStripe, getIdClientStripe, resoudrePrixStripe, MissingStripeConfigError, type Periodicite } from '@/lib/billing-data';
import { refusSiCompteBloque } from '@/lib/moderation-route';

export const maxDuration = 30;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!user.email) return NextResponse.json({ erreur: 'Adresse e-mail introuvable sur ce compte.' }, { status: 400 });

  // Compte suspendu ou désactivé (JEP-272) : la clé service_role et les appels
  // IA échappent à la RLS, la garde est donc ici.
  const compteBloque = await refusSiCompteBloque(user.id);
  if (compteBloque) return compteBloque;
  // Même garde que /api/import-url, /api/transcribe-photo : une session « en
  // tant que » lecture seule ne doit engager aucun paiement au nom du membre
  // incarné.
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule) : action impossible.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const planCode = typeof body?.plan === 'string' ? body.plan.trim().toUpperCase() : '';
  const periodicite: Periodicite = body?.periodicite === 'YEARLY' ? 'YEARLY' : 'MONTHLY';
  const accesImmediat = body?.accesImmediat === true;

  if (!planCode) return NextResponse.json({ erreur: 'Plan manquant.' }, { status: 400 });
  if (!cgvVersionValide(body?.cgvVersion)) {
    return NextResponse.json(
      { erreur: 'Les conditions générales de vente ont été mises à jour : rechargez la page pour les accepter.' },
      { status: 422 },
    );
  }
  if (!accesImmediat) {
    return NextResponse.json(
      { erreur: 'Les conditions générales de vente et la demande d’accès immédiat doivent être acceptées pour continuer.' },
      { status: 422 },
    );
  }

  // `configStripe()` (appelée plus bas par `resoudrePrixStripe` et
  // `appelStripe`) lève si `STRIPE_SECRET_KEY` est absente — sans ce filet,
  // l'exception remontait telle quelle (500 muet) plutôt qu'un message
  // exploitable, même piège que documenté dans /api/plans/essayer.
  let priceId: string | null;
  try {
    priceId = await resoudrePrixStripe(planCode, periodicite);
  } catch (e) {
    if (e instanceof MissingStripeConfigError) {
      console.error('abonnement/checkout:', e.message);
      return NextResponse.json({ erreur: "Le paiement est temporairement indisponible, réessayez plus tard." }, { status: 503 });
    }
    throw e;
  }
  if (!priceId) {
    // Un plan sans prix Stripe configuré dans le mode courant (test/live) —
    // config manquante côté back-office, ou formule qui n'est délibérément
    // pas vendable (ex. le plan technique d'essai, §12 de docs/abonnements.md).
    // Jamais un 500 : c'est une erreur de configuration, pas une panne.
    return NextResponse.json({ erreur: "Cette formule n'est pas disponible au paiement pour le moment." }, { status: 422 });
  }

  const customerId = await getIdClientStripe(user.id);
  const accepteLe = new Date().toISOString();

  // `siteUrl()` et non `new URL(req.url).origin` : derrière l'équilibreur
  // Virtuozzo, cette dernière rend `http://localhost:3000` — l'adresse
  // d'écoute de l'application, pas le domaine par lequel le membre est
  // arrivé (mesuré, § 7.16 du dossier de migration). Stripe renverrait donc
  // le membre sur une page morte après son paiement. Même outil que
  // /api/admin/impersonate, pour la même raison : une URL ABSOLUE est
  // nécessaire ici, une `Location` relative ne s'applique pas.
  const origine = siteUrl();

  const resultat = await appelStripe<{ url: string | null }>('/checkout/sessions', {
    idempotencyKey: cleIdempotence('checkout', user.id, planCode, periodicite),
    corps: {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // `customer` si on le connaît déjà (portail, changement de formule
      // futurs) ; sinon `customer_email` + l'ID interne en métadonnée —
      // c'est cette métadonnée que le webhook lit pour rattacher le premier
      // paiement à ce compte, indépendamment de l'ordre d'arrivée des
      // événements (cf. docs/abonnements.md §14).
      ...(customerId ? { customer: customerId } : { customer_email: user.email }),
      client_reference_id: user.id,
      subscription_data: {
        metadata: {
          user_id: user.id,
          waiver_accepted_at: accepteLe,
          cgv_version: CGV_VERSION,
          cgv_accepted_at: accepteLe,
        },
      },
      metadata: { user_id: user.id },
      success_url: `${origine}/reglages?abonnement=confirme`,
      cancel_url: `${origine}/plans`,
    },
  });

  if (!resultat.ok) {
    console.error('abonnement/checkout:', resultat.message);
    return NextResponse.json({ erreur: "Impossible d'ouvrir la page de paiement, réessayez." }, { status: 502 });
  }
  if (!resultat.data.url) {
    return NextResponse.json({ erreur: "Impossible d'ouvrir la page de paiement, réessayez." }, { status: 502 });
  }

  return NextResponse.json({ url: resultat.data.url });
}
