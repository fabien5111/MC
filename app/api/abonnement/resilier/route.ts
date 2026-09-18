// Route Handler — résiliation en libre-service (JEP-29, referme le trou
// laissé par le lot A : `mc_cancel_own_subscription` restait purement SQL,
// sans jamais parler à Stripe — un membre aurait perdu ses droits en
// continuant d'être prélevé).
//
// **Deux chemins, choisis par le PROVIDER de l'abonnement, jamais par un
// paramètre du client :**
//  - `provider = 'stripe'` → Stripe est prévenu (`cancel_at_period_end`) ;
//    `subscriptions` n'est PAS réécrit ici, c'est le webhook qui l'aligne
//    (`customer.subscription.updated`, quasi immédiat). La date de fin
//    annoncée au membre vient de la réponse Stripe elle-même — synchrone —
//    jamais d'une relecture de la base, qui pourrait encore porter l'ancienne
//    valeur le temps que le webhook arrive.
//  - tout le reste (`TRIAL`, `GIFT`, `manual`, l'ancien `SIMULATION`) → aucun
//    objet Stripe n'existe : `mc_cancel_own_subscription` reste inchangée,
//    exactement le geste d'avant ce lot.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { cleIdempotence } from '@/lib/billing';
import { appelStripe, getAbonnementResiliable, MissingStripeConfigError } from '@/lib/billing-data';

export const maxDuration = 15;

type SubscriptionStripe = {
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  schedule?: unknown;
  items?: { data?: { current_period_end?: number }[] };
};

/** Un champ `schedule` Stripe est soit l'identifiant, soit l'objet complet. */
function identifiantEcheancier(valeur: unknown): string | null {
  if (typeof valeur === 'string') return valeur || null;
  const id = (valeur as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id ? id : null;
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule) : action impossible.' }, { status: 403 });
  }

  const abonnement = await getAbonnementResiliable(user.id);
  if (!abonnement) return NextResponse.json({ erreur: 'Aucun abonnement actif à résilier.' }, { status: 404 });

  if (abonnement.provider !== 'stripe' || !abonnement.externalSubscriptionId) {
    // Essai, don administrateur, ou reliquat de l'ancienne simulation :
    // aucun objet Stripe à prévenir. Geste inchangé depuis avant ce lot.
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('mc_cancel_own_subscription');
    if (error) return NextResponse.json({ erreur: traduireErreurRpc(error.message) }, { status: 422 });
    return NextResponse.json({ finPeriode: data });
  }

  // **Un échéancier attaché bloque toute modification de l'abonnement.**
  // Le cas se produit dès qu'un membre programme une descente en gamme puis
  // décide finalement de résilier : sans cette libération, Stripe refuse et
  // le membre se retrouve sans moyen d'arrêter ses prélèvements. Résilier
  // prime sur un changement programmé, qui n'a plus d'objet.
  try {
    const lu = await appelStripe<SubscriptionStripe>(`/subscriptions/${abonnement.externalSubscriptionId}`);
    const echeancier = lu.ok ? identifiantEcheancier(lu.data.schedule) : null;
    if (echeancier) {
      const libere = await appelStripe<unknown>(`/subscription_schedules/${echeancier}/release`, {
        idempotencyKey: crypto.randomUUID(),
        corps: {},
      });
      if (!libere.ok) {
        console.error('abonnement/resilier (libération):', libere.message);
        return NextResponse.json({ erreur: 'La résiliation a échoué, réessayez.' }, { status: 502 });
      }
    }
  } catch (e) {
    if (e instanceof MissingStripeConfigError) {
      console.error('abonnement/resilier:', e.message);
      return NextResponse.json({ erreur: 'La résiliation est temporairement indisponible, réessayez plus tard.' }, { status: 503 });
    }
    throw e;
  }

  let resultat;
  try {
    resultat = await appelStripe<SubscriptionStripe>(`/subscriptions/${abonnement.externalSubscriptionId}`, {
      idempotencyKey: cleIdempotence('resilier', user.id, abonnement.externalSubscriptionId),
      corps: { cancel_at_period_end: true },
    });
  } catch (e) {
    if (e instanceof MissingStripeConfigError) {
      console.error('abonnement/resilier:', e.message);
      return NextResponse.json({ erreur: 'La résiliation est temporairement indisponible, réessayez plus tard.' }, { status: 503 });
    }
    throw e;
  }

  if (!resultat.ok) {
    console.error('abonnement/resilier:', resultat.message);
    return NextResponse.json({ erreur: 'La résiliation a échoué, réessayez.' }, { status: 502 });
  }

  // Fin de période lue sur la réponse Stripe elle-même — synchrone et sûre —
  // plutôt que sur la base, où le webhook n'a peut-être pas encore écrit.
  const finUnix = resultat.data.current_period_end ?? resultat.data.items?.data?.[0]?.current_period_end ?? null;
  const finPeriode = finUnix ? new Date(finUnix * 1000).toISOString() : abonnement.endsAt;

  return NextResponse.json({ finPeriode });
}

function traduireErreurRpc(message: string): string {
  const messages: Record<string, string> = {
    MC_SUB_AUTH: 'Connexion requise.',
    MC_SUB_NOT_FOUND: 'Aucun abonnement actif à résilier.',
  };
  const code = message.split(':')[0];
  return messages[code] ?? "La résiliation n'a pas pu aboutir.";
}
