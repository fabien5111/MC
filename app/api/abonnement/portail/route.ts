// Route Handler — ouverture du portail client Stripe (JEP-29 §4.2).
//
// Le portail gère uniquement la MISE À JOUR DU MOYEN DE PAIEMENT (§14 de
// docs/abonnements.md pose que résiliation et changement d'offre restent des
// gestes du site, jamais du portail) — la configuration du portail côté
// Stripe (Dashboard → Customer portal) doit donc désactiver ses propres
// options d'annulation et de changement de plan, sans quoi un membre y
// trouverait deux chemins concurrents pour le même geste.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { appelStripe, getIdClientStripe, MissingStripeConfigError } from '@/lib/billing-data';

export const maxDuration = 15;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  // Lecture seule côté portail Stripe : mettre à jour un moyen de paiement
  // n'écrit rien dans notre base, donc rien à bloquer pour une session
  // d'impersonation — contrairement au Checkout et à la résiliation.

  let customerId: string | null;
  try {
    customerId = await getIdClientStripe(user.id);
  } catch (e) {
    if (e instanceof MissingStripeConfigError) {
      console.error('abonnement/portail:', e.message);
      return NextResponse.json({ erreur: 'Le service est temporairement indisponible, réessayez plus tard.' }, { status: 503 });
    }
    throw e;
  }
  if (!customerId) {
    return NextResponse.json({ erreur: "Aucun abonnement Stripe n'est associé à ce compte." }, { status: 404 });
  }

  const origine = new URL(req.url).origin;
  const resultat = await appelStripe<{ url: string | null }>('/billing_portal/sessions', {
    // Pas de clé stable ici : une ouverture de portail n'a aucune conséquence
    // à dédupliquer (elle ne fait qu'ouvrir une page), une clé fraîche par
    // clic est donc plus simple qu'une fenêtre à calibrer pour rien.
    idempotencyKey: crypto.randomUUID(),
    corps: { customer: customerId, return_url: `${origine}/reglages` },
  });

  if (!resultat.ok || !resultat.data.url) {
    console.error('abonnement/portail:', !resultat.ok ? resultat.message : 'URL manquante');
    return NextResponse.json({ erreur: "Impossible d'ouvrir le portail de facturation, réessayez." }, { status: 502 });
  }

  return NextResponse.json({ url: resultat.data.url });
}
