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
import { isReadOnlySession } from '@/lib/impersonation';
import { siteUrl } from '@/lib/site-url';
import { appelStripe, configStripe, getIdClientStripe, MissingStripeConfigError } from '@/lib/billing-data';

export const maxDuration = 15;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  // **Le portail écrit, même s'il n'écrit pas CHEZ NOUS** : on y remplace ou
  // supprime un moyen de paiement, et on y lit les factures et l'adresse de
  // facturation du membre. Une session « en tant que » en lecture seule n'a
  // donc rien à y faire — même garde que le Checkout et la résiliation.
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule) : action impossible.' }, { status: 403 });
  }

  // `configStripe()` est appelée ICI et pas seulement en profondeur par
  // `appelStripe` : `getIdClientStripe` ne la touche pas, un `try` posé
  // autour d'elle seule ne couvrait donc jamais le vrai point de levée, et
  // une clé manquante remontait en 500 muet au lieu du 503 prévu.
  try {
    configStripe();
  } catch (e) {
    if (e instanceof MissingStripeConfigError) {
      console.error('abonnement/portail:', e.message);
      return NextResponse.json({ erreur: 'Le service est temporairement indisponible, réessayez plus tard.' }, { status: 503 });
    }
    throw e;
  }

  const customerId = await getIdClientStripe(user.id);
  if (!customerId) {
    return NextResponse.json({ erreur: "Aucun abonnement Stripe n'est associé à ce compte." }, { status: 404 });
  }

  // `siteUrl()` et non `new URL(req.url).origin` : derrière l'équilibreur
  // Virtuozzo, cette dernière rend `http://localhost:3000` — l'adresse
  // d'écoute de l'application, pas le domaine par lequel le membre est
  // arrivé (mesuré, § 7.16 du dossier de migration). Stripe renverrait donc
  // le membre sur une page morte après son paiement. Même outil que
  // /api/admin/impersonate, pour la même raison : une URL ABSOLUE est
  // nécessaire ici, une `Location` relative ne s'applique pas.
  const origine = siteUrl();
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
