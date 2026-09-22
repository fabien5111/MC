// Route Handler — changement de formule (JEP-29 §5).
//
// Deux gestes radicalement différents derrière un seul bouton, et c'est la
// GRILLE qui tranche lequel — `plans.order_index`, jamais le code du plan
// (règle ESLint du dépôt ; un palier ajouté en back-office doit se placer
// tout seul).
//
// **Montée en gamme : immédiate, payée au prorata, et ATOMIQUE.**
// `proration_behavior: 'always_invoice'` facture la différence tout de suite,
// `payment_behavior: 'error_if_incomplete'` fait échouer l'appel entier si ce
// paiement n'aboutit pas. Conséquence voulue : le membre est soit monté ET
// payé, soit ni l'un ni l'autre — jamais monté sans avoir payé.
//
// Ce dernier point n'est pas théorique : notre propre arbitrage mappe
// `past_due` sur `ACTIVE` (un abonné dont la carte expire garde son accès
// pendant les relances, §14). Laisser une montée s'installer en `past_due`
// reviendrait donc à **offrir le palier supérieur** à qui n'a pas payé. D'où
// l'atomicité, et le refus de `default_incomplete`.
//
// **Descente en gamme : à l'échéance, sans remboursement.** Le membre garde
// ce qu'il a payé jusqu'au bout. Un simple changement de prix sur
// l'abonnement prendrait effet IMMÉDIATEMENT côté objet Stripe — donc côté
// droits, notre webhook lisant le prix courant — et retirerait des droits
// déjà payés. D'où l'échéancier (`subscription_schedules`), seul moyen natif
// de dire « ce prix-ci jusqu'à l'échéance, celui-là après ».
//
// **La périodicité ne vient jamais du client.** Elle est lue sur l'abonnement
// lui-même : changer de formule ne change pas de périodicité, et se fier à la
// bascule d'affichage de `/plans` débiterait une année au prorata à un
// abonné mensuel dont la bascule était du mauvais côté.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getGrid } from '@/lib/entitlements-data';
import { isReadOnlySession } from '@/lib/impersonation';
import {
  cleIdempotence,
  echeancierConforme,
  lireAbonnementStripe,
  lirePhasesEcheancier,
  messageRefusChangement,
  phaseCourante,
  sensChangement,
} from '@/lib/billing';
import {
  appelStripe,
  getAbonnementStripeCourant,
  resoudrePrixStripe,
  MissingStripeConfigError,
} from '@/lib/billing-data';

export const maxDuration = 30;

type Programmation = { ok: true } | { ok: false; message: string };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule) : action impossible.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const planCode = typeof body?.plan === 'string' ? body.plan.trim().toUpperCase() : '';
  const renonciation = body?.renonciationRetractation === true;
  // Jeton d'unicité posé par le CLIC, pas par la requête : deux envois du
  // même clic partagent le jeton (aucun double débit), alors qu'une reprise
  // délibérée après « changez de carte » en produit un neuf — sans quoi la
  // fenêtre d'idempotence rejouerait le refus en cache et rendrait ce
  // conseil inapplicable pendant dix minutes.
  const jeton = typeof body?.jeton === 'string' && body.jeton.length <= 64 ? body.jeton : null;
  if (!planCode) return NextResponse.json({ erreur: 'Plan manquant.' }, { status: 400 });

  const courant = await getAbonnementStripeCourant(user.id);
  if (!courant) {
    return NextResponse.json(
      { erreur: "Aucun abonnement en ligne à modifier — souscrivez depuis la page des formules." },
      { status: 409 },
    );
  }

  let prixCible: string | null;
  try {
    prixCible = await resoudrePrixStripe(planCode, courant.periodicite);
  } catch (e) {
    if (e instanceof MissingStripeConfigError) {
      console.error('abonnement/changer:', e.message);
      return NextResponse.json({ erreur: 'Le service est temporairement indisponible, réessayez plus tard.' }, { status: 503 });
    }
    throw e;
  }
  if (!prixCible) {
    return NextResponse.json({ erreur: "Cette formule n'est pas disponible au paiement pour le moment." }, { status: 422 });
  }

  const grid = await getGrid();
  const cible = grid.plans.find((p) => p.code === planCode)?.orderIndex ?? null;
  if (cible === null) return NextResponse.json({ erreur: 'Formule inconnue.' }, { status: 422 });

  const sens = sensChangement(courant.planOrderIndex, cible);
  if (sens === 'IDENTIQUE') {
    return NextResponse.json({ erreur: 'C’est déjà votre formule actuelle.' }, { status: 422 });
  }

  // L'abonnement est relu chez Stripe, et non dans notre base : c'est lui qui
  // porte l'identifiant de ligne d'article et l'échéance réelle, les seules
  // valeurs sur lesquelles on a le droit de composer une facturation.
  const lu = await appelStripe<Record<string, unknown>>(`/subscriptions/${courant.subscriptionId}`);
  if (!lu.ok) {
    console.error('abonnement/changer (lecture):', lu.message);
    return NextResponse.json({ erreur: 'Impossible de lire votre abonnement, réessayez.' }, { status: 502 });
  }
  const abo = lireAbonnementStripe(lu.data);
  if (!abo) {
    return NextResponse.json({ erreur: 'Votre abonnement est dans un état inattendu, contactez-nous.' }, { status: 409 });
  }
  const echeancierId = identifiantEcheancier(lu.data.schedule);

  // Un abonnement déjà résilié n'a pas de « suite » à programmer : poser un
  // échéancier en `release` par-dessus ferait repartir la facturation au
  // tarif inférieur, effaçant en silence une résiliation demandée. Le chemin
  // MONTÉE, lui, traite ce cas explicitement (il vaut reprise).
  if (sens === 'DESCENTE' && abo.annulationProgrammee) {
    return NextResponse.json(
      {
        erreur:
          'Votre abonnement est déjà résilié et prendra fin à son échéance. ' +
          'Il n’y a pas de formule à programmer ensuite : vous repasserez à la formule gratuite.',
      },
      { status: 409 },
    );
  }

  if (sens === 'DESCENTE') {
    const r = await programmerDescente(user.id, courant.subscriptionId, abo.priceId, prixCible, abo.finPeriodeIso, echeancierId);
    return r.ok
      ? NextResponse.json({ sens: 'DESCENTE', immediat: false, effetLe: abo.finPeriodeIso })
      : NextResponse.json({ erreur: r.message }, { status: 502 });
  }

  // Une montée ouvre un accès immédiat à du contenu numérique contre un
  // prélèvement immédiat : même situation que la souscription initiale, donc
  // même renonciation, revérifiée ici et jamais sur la seule foi du client.
  // Une descente ne débite rien et n'ouvre rien : elle n'en demande pas.
  if (!renonciation) {
    return NextResponse.json(
      { erreur: 'La renonciation au délai de rétractation doit être acceptée pour continuer.' },
      { status: 422 },
    );
  }

  // Stripe refuse de modifier un abonnement piloté par un échéancier. Avant
  // de le libérer, on note ce qu'il programmait : si la montée échoue au
  // paiement, il faut pouvoir REMETTRE la descente que le membre avait
  // programmée, sinon elle disparaîtrait en silence.
  let prixDescenteProgrammee: string | null = null;
  if (echeancierId) {
    const relu = await appelStripe<unknown>(`/subscription_schedules/${echeancierId}`);
    if (!relu.ok) {
      // On refuse plutôt que de libérer à l'aveugle : détruire un changement
      // programmé sans savoir ce qu'il programmait le rendrait
      // irrécupérable, et le membre n'en saurait rien.
      console.error('abonnement/changer (lecture échéancier):', relu.message);
      return NextResponse.json(
        { erreur: 'Un changement de formule est déjà programmé et nous ne parvenons pas à le lire. Réessayez plus tard.' },
        { status: 502 },
      );
    }
    const phases = lirePhasesEcheancier(relu.data);
    prixDescenteProgrammee = phases.length > 1 ? phases[phases.length - 1].priceId : null;
    if (!(await libererEcheancier(echeancierId))) {
      // Sans libération, Stripe refusera la modification. Abandonner ici
      // laisse la descente programmée INTACTE — bien plus honnête que
      // d'échouer plus loin en annonçant au membre qu'elle a été annulée.
      return NextResponse.json(
        { erreur: 'Un changement de formule est déjà programmé et n’a pas pu être levé. Réessayez plus tard.' },
        { status: 502 },
      );
    }
  }

  const resultat = await appelStripe<unknown>(`/subscriptions/${courant.subscriptionId}`, {
    idempotencyKey: jeton ? `monter:${user.id}:${jeton}` : cleIdempotence('monter', user.id, courant.subscriptionId, prixCible),
    corps: {
      items: [{ id: abo.itemId, price: prixCible }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'error_if_incomplete',
      // Monter en gamme vaut reprise : payer davantage dit assez clairement
      // qu'on veut continuer. Sans ça, un membre ayant résilié paierait un
      // prorata sur un abonnement que Stripe clôt à l'échéance.
      cancel_at_period_end: false,
      // Seule cette clé est transmise : Stripe fusionne les métadonnées sur
      // une mise à jour, `user_id` posé à la souscription est donc préservé.
      metadata: { waiver_accepted_at: new Date().toISOString() },
    },
  });

  if (!resultat.ok) {
    console.error('abonnement/changer (montée):', resultat.message);
    let message = messageRefusChangement(resultat.code);
    if (prixDescenteProgrammee) {
      const remise = await programmerDescente(
        user.id,
        courant.subscriptionId,
        abo.priceId,
        prixDescenteProgrammee,
        abo.finPeriodeIso,
        null,
      );
      if (!remise.ok) {
        console.error('abonnement/changer: remise en place de la descente impossible');
        message += ' Le changement de formule que vous aviez programmé a été annulé : reprogrammez-le si besoin.';
      }
    }
    return NextResponse.json({ erreur: message }, { status: resultat.status === 402 ? 402 : 502 });
  }

  // Aucune écriture en base ici : `customer.subscription.updated` arrive dans
  // la foulée et c'est le webhook qui pose le nouveau palier (§14).
  return NextResponse.json({ sens: 'MONTEE', planCode, immediat: true });
}

/** Un champ `schedule` Stripe est soit l'identifiant, soit l'objet complet. */
function identifiantEcheancier(valeur: unknown): string | null {
  if (typeof valeur === 'string') return valeur || null;
  const id = (valeur as { id?: unknown } | null)?.id;
  return typeof id === 'string' && id ? id : null;
}

/**
 * Programme « la formule actuelle jusqu'à l'échéance, puis la nouvelle ».
 *
 * Sert à la descente en gamme, et à remettre en place une descente qu'une
 * montée en gamme ratée avait dû libérer.
 */
async function programmerDescente(
  userId: string,
  subscriptionId: string,
  prixCourant: string,
  prixCible: string,
  finPeriodeIso: string,
  echeancierExistant: string | null,
): Promise<Programmation> {
  const finPeriode = Math.floor(new Date(finPeriodeIso).getTime() / 1000);
  const echec: Programmation = { ok: false, message: "Le changement de formule n'a pas pu être programmé, réessayez." };

  // **On repart toujours d'un échéancier NEUF**, quitte à libérer celui qui
  // existe. Réécrire les phases d'un échéancier en cours obligerait à
  // réémettre ses phases passées telles quelles — Stripe refuse qu'on en
  // perde une — et le cas se présente dès qu'une première descente a pris
  // effet : la phase révolue devrait alors être recopiée à l'identique.
  // `from_subscription` rend au contraire, à tous les coups, un échéancier à
  // une seule phase calée sur la période en cours : la composition qui suit
  // n'a donc jamais qu'un seul cas à traiter.
  if (echeancierExistant) await libererEcheancier(echeancierExistant);

  const cree = await appelStripe<{ id?: string }>('/subscription_schedules', {
    // Clé fraîche : une clé stable rejouerait la création d'un échéancier
    // qu'un échec précédent a libéré, et rendrait le même identifiant mort
    // pendant toute la fenêtre.
    idempotencyKey: crypto.randomUUID(),
    corps: { from_subscription: subscriptionId },
  });
  if (!cree.ok || !cree.data.id) {
    console.error('abonnement/changer (échéancier):', !cree.ok ? cree.message : 'id manquant');
    return echec;
  }
  const echeancierId = cree.data.id;

  // **La phase courante est RELUE chez Stripe avant d'être réécrite.**
  // Passer `start_date: 'now'` déplacerait la frontière de la phase en cours
  // et pourrait déclencher un prorata sur une période déjà payée — l'inverse
  // exact de ce qu'une descente doit faire.
  const relu = await appelStripe<unknown>(`/subscription_schedules/${echeancierId}`);
  if (!relu.ok) {
    console.error('abonnement/changer (relecture échéancier):', relu.message);
    await libererEcheancier(echeancierId);
    return echec;
  }
  const courante = phaseCourante(relu.data, lirePhasesEcheancier(relu.data));
  if (!courante?.startDate) {
    console.error('abonnement/changer: phase courante illisible');
    await libererEcheancier(echeancierId);
    return echec;
  }

  const misAJour = await appelStripe<unknown>(`/subscription_schedules/${echeancierId}`, {
    // Clé fraîche, comme la création : l'échéancier vient d'être créé, une
    // clé stable rejouerait une réponse composée pour un AUTRE échéancier.
    idempotencyKey: crypto.randomUUID(),
    corps: {
      end_behavior: 'release',
      // Aucun prorata : une descente ne rembourse pas la période en cours, le
      // membre garde ce qu'il a payé jusqu'au bout (§5 du ticket).
      proration_behavior: 'none',
      // La dernière phase n'a ni `end_date` ni `iterations` — ce second
      // paramètre, hérité d'une version antérieure de l'API sans jamais
      // avoir pu être vérifié sur un vrai compte Stripe (§14 : « le point
      // qui n'a jamais été éprouvé »), y est refusé (« Received unknown
      // parameter: phases[iterations] », constaté le 22/09). Une phase sans
      // borne de fin est calculée par Stripe lui-même : un cycle complet de
      // facturation au prix cible, avant que l'échéancier ne se libère
      // (`end_behavior: 'release'`) et laisse l'abonnement continuer seul.
      phases: [
        { items: [{ price: prixCourant, quantity: 1 }], start_date: courante.startDate, end_date: finPeriode },
        { items: [{ price: prixCible, quantity: 1 }] },
      ],
    },
  });

  if (!misAJour.ok) {
    console.error('abonnement/changer (phases):', misAJour.message);
    await libererEcheancier(echeancierId);
    return echec;
  }

  // **Relecture de contrôle.** Un échéancier accepté mais mal composé
  // facturerait de travers, en silence et à retardement — le pire des modes
  // de défaillance sur de l'argent réel. On vérifie donc que Stripe a
  // enregistré exactement ce qu'on a demandé, et on libère sinon :
  // l'abonnement repart intact, et le membre reçoit une erreur immédiate
  // plutôt qu'une facture surprise.
  if (!echeancierConforme(lirePhasesEcheancier(misAJour.data), prixCourant, prixCible, finPeriode)) {
    console.error('abonnement/changer: échéancier non conforme');
    await libererEcheancier(echeancierId);
    return { ok: false, message: "Le changement de formule n'a pas pu être programmé. Votre formule actuelle est inchangée." };
  }

  return { ok: true };
}

/**
 * Détache l'échéancier sans toucher à l'abonnement (`release`, jamais
 * `cancel` — qui résilierait l'abonnement lui-même). C'est le filet qui
 * transforme une composition mal comprise en simple échec.
 */
async function libererEcheancier(echeancierId: string): Promise<boolean> {
  const r = await appelStripe<unknown>(`/subscription_schedules/${echeancierId}/release`, {
    idempotencyKey: crypto.randomUUID(),
    corps: {},
  });
  if (!r.ok) console.error('abonnement/changer (libération):', r.message);
  return r.ok;
}
