// Route Handler — annulation, depuis le back-office, d'un abonnement payé par
// carte (JEP-361). Réservée à l'admin complet, comme toute la fiche membre.
//
// **Pourquoi une route, et pas `mc_admin_cancel_subscription`.** La fonction
// SQL clôt la ligne `subscriptions` et rien d'autre. Sur un abonnement Stripe,
// c'était une désynchronisation : le membre repassait en gratuit sur le site,
// mais restait abonné chez Stripe — donc PRÉLEVÉ à l'échéance (constaté le
// 10/11/2026 en recette live). Ici l'annulation se fait CHEZ Stripe, et c'est
// le webhook (`customer.subscription.updated` / `.deleted`) qui aligne la
// base, comme pour toute résiliation : une seule source de vérité.
//
// - immédiate : `resilierImmediatement` (même chemin que la suppression de
//   compte, échéancier compris) ; aucun remboursement automatique — geste
//   manuel du Dashboard, comme ailleurs ;
// - à l'échéance : `cancel_at_period_end` (`appliquerActionAbonnement`, même
//   chemin que la modération).
//
// Le motif, obligatoire comme au back-office, est posé en métadonnée de
// l'abonnement Stripe (visible au Dashboard) et dans le journal serveur :
// la ligne `subscriptions` est réécrite par le webhook, pas par nous.
import { NextResponse } from 'next/server';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { isReadOnlySession } from '@/lib/impersonation';
import { appelStripe, MissingStripeConfigError } from '@/lib/billing-data';
import { resilierImmediatement } from '@/lib/anonymisation-data';
import { appliquerActionAbonnement } from '@/lib/moderation-actions';

const MOTIF_MAX = 500;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Vérification forte : un droit d'admin retiré ne doit pas survivre à son jeton.
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session en lecture seule : action refusée.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const subscriptionRowId = Number(body?.abonnement);
  const immediat = body?.immediat === true;
  const motif = typeof body?.motif === 'string' ? body.motif.trim().slice(0, MOTIF_MAX) : '';
  if (!Number.isInteger(subscriptionRowId) || subscriptionRowId <= 0) {
    return NextResponse.json({ erreur: 'Abonnement manquant.' }, { status: 400 });
  }
  if (!motif) return NextResponse.json({ erreur: 'Motif obligatoire.' }, { status: 400 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }

  // La ligne est relue ici, jamais prise sur la parole du navigateur : elle
  // doit appartenir au membre visé, être active et payée par Stripe.
  const { id: membreId } = await params;
  const { data: ligne, error } = await admin
    .from('subscriptions')
    .select('id, user_id, provider, status, external_subscription_id')
    .eq('id', subscriptionRowId)
    .eq('user_id', membreId)
    .maybeSingle();
  if (error) return NextResponse.json({ erreur: `Lecture impossible : ${error.message}` }, { status: 502 });
  if (!ligne || ligne.provider !== 'stripe' || !ligne.external_subscription_id) {
    return NextResponse.json({ erreur: 'Cet abonnement n’est pas payé par carte.' }, { status: 409 });
  }
  if (ligne.status !== 'ACTIVE') {
    return NextResponse.json({ erreur: 'Cet abonnement n’est plus actif.' }, { status: 409 });
  }
  const subscriptionId = ligne.external_subscription_id;

  try {
    // Trace du geste chez Stripe, best-effort : une métadonnée refusée ne doit
    // pas empêcher d'arrêter un prélèvement.
    const trace = await appelStripe<unknown>(`/subscriptions/${subscriptionId}`, {
      // Clé fraîche : le motif change d'un essai à l'autre, une clé stable
      // ferait refuser la seconde trace par Stripe (mêmes clé, autres paramètres).
      idempotencyKey: crypto.randomUUID(),
      corps: {
        metadata: {
          admin_annulation_motif: motif,
          admin_annulation_par: user.id,
          admin_annulation_le: new Date().toISOString(),
        },
      },
    });
    if (!trace.ok) console.error('admin/abonnement/annuler (motif):', trace.message);

    const r = immediat
      ? await resilierImmediatement(subscriptionId, membreId)
      : await appliquerActionAbonnement(subscriptionId, 'resilier', membreId);
    if (!r.ok) {
      console.error('admin/abonnement/annuler:', r.message);
      return NextResponse.json({ erreur: `Stripe a refusé l’annulation : ${r.message}` }, { status: 502 });
    }
  } catch (e) {
    if (e instanceof MissingStripeConfigError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }

  console.info(
    `admin/abonnement/annuler: abonnement ${subscriptionRowId} (${immediat ? 'immédiat' : 'à échéance'}) par ${user.id} — ${motif}`,
  );
  return NextResponse.json({ ok: true, immediat });
}
