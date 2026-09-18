// Tests du pur (`lib/billing.ts`). Rien de réseau ni de base ici : la
// vérification de signature et l'encodage de formulaire sont exactement le
// genre de code où une erreur ne se voit pas à la lecture, et où un test
// coûte trois lignes.
import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  TOLERANCE_SIGNATURE_SEC,
  FENETRE_IDEMPOTENCE_MS,
  cleIdempotence,
  codeErreurStripe,
  echeancierConforme,
  lirePhasesEcheancier,
  messageRefusChangement,
  phaseCourante,
  sensChangement,
  encoderFormulaireStripe,
  lireAbonnementStripe,
  lireClientFacture,
  lireSessionCheckout,
  messageEchecPaiement,
  messageErreurStripe,
  modeStripe,
  verifierSignatureStripe,
} from '@/lib/billing';

const SECRET = 'whsec_exemple_de_secret_de_test';
const CORPS = '{"id":"evt_1","type":"customer.subscription.updated"}';

function enTeteValide(corps: string, secret: string, t: number): string {
  const signature = createHmac('sha256', secret).update(`${t}.${corps}`).digest('hex');
  return `t=${t},v1=${signature}`;
}

describe('modeStripe', () => {
  it('reconnaît une clé de test', () => {
    expect(modeStripe('sk_test_51ABC')).toBe('test');
    expect(modeStripe('rk_test_51ABC')).toBe('test');
  });

  it('traite tout le reste comme du live, y compris une clé illisible', () => {
    // Fermeture plutôt qu'ouverture : une clé douteuse cherche des prix
    // `live` qui n'existent pas en développement, donc refuse la souscription
    // au lieu de l'ouvrir au mauvais tarif.
    expect(modeStripe('sk_live_51ABC')).toBe('live');
    expect(modeStripe('n_importe_quoi')).toBe('live');
  });
});

describe('verifierSignatureStripe', () => {
  const maintenant = 1_800_000_000;

  it('accepte une signature juste', () => {
    expect(verifierSignatureStripe(CORPS, enTeteValide(CORPS, SECRET, maintenant), SECRET, maintenant)).toBe(true);
  });

  it('refuse un corps modifié', () => {
    const enTete = enTeteValide(CORPS, SECRET, maintenant);
    expect(verifierSignatureStripe(`${CORPS} `, enTete, SECRET, maintenant)).toBe(false);
  });

  it('refuse un secret différent', () => {
    const enTete = enTeteValide(CORPS, SECRET, maintenant);
    expect(verifierSignatureStripe(CORPS, enTete, 'whsec_autre', maintenant)).toBe(false);
  });

  it('refuse un horodatage hors de la fenêtre de rejeu', () => {
    const vieux = maintenant - TOLERANCE_SIGNATURE_SEC - 1;
    const enTete = enTeteValide(CORPS, SECRET, vieux);
    // La signature est pourtant mathématiquement juste : c'est bien l'âge
    // qui la fait refuser.
    expect(verifierSignatureStripe(CORPS, enTete, SECRET, vieux)).toBe(true);
    expect(verifierSignatureStripe(CORPS, enTete, SECRET, maintenant)).toBe(false);
  });

  it('accepte quand une seule des signatures présentes est juste (rotation de secret)', () => {
    const juste = createHmac('sha256', SECRET).update(`${maintenant}.${CORPS}`).digest('hex');
    const enTete = `t=${maintenant},v1=${'0'.repeat(64)},v1=${juste}`;
    expect(verifierSignatureStripe(CORPS, enTete, SECRET, maintenant)).toBe(true);
  });

  it('refuse un en-tête absent, vide ou sans horodatage', () => {
    expect(verifierSignatureStripe(CORPS, null, SECRET, maintenant)).toBe(false);
    expect(verifierSignatureStripe(CORPS, '', SECRET, maintenant)).toBe(false);
    expect(verifierSignatureStripe(CORPS, 'v1=abc', SECRET, maintenant)).toBe(false);
    expect(verifierSignatureStripe(CORPS, `t=${maintenant}`, SECRET, maintenant)).toBe(false);
  });

  it('refuse sans secret configuré, plutôt que de tout accepter', () => {
    expect(verifierSignatureStripe(CORPS, enTeteValide(CORPS, SECRET, maintenant), '', maintenant)).toBe(false);
  });
});

describe('encoderFormulaireStripe', () => {
  it('encode les structures imbriquées en notation à crochets', () => {
    const encode = encoderFormulaireStripe({ items: [{ id: 'si_1', price: 'price_2' }] });
    expect(decodeURIComponent(encode)).toBe('items[0][id]=si_1&items[0][price]=price_2');
  });

  it('omet undefined et null au lieu de les envoyer vides', () => {
    // Un champ présent et vide vaut effacement chez Stripe : l'omission est
    // ce qui distingue « laisser inchangé » de « supprimer ».
    const encode = encoderFormulaireStripe({ a: 'x', b: undefined, c: null, d: 0, e: false });
    expect(decodeURIComponent(encode)).toBe('a=x&d=0&e=false');
  });

  it('échappe ce qui casserait la chaîne', () => {
    expect(encoderFormulaireStripe({ url: 'https://x.fr/?a=1&b=2' })).toBe(
      'url=https%3A%2F%2Fx.fr%2F%3Fa%3D1%26b%3D2',
    );
  });

  it('rend une chaîne vide pour un corps vide', () => {
    expect(encoderFormulaireStripe({})).toBe('');
  });
});

describe('messageErreurStripe', () => {
  it('compose message et code', () => {
    expect(messageErreurStripe({ error: { message: 'No such price', code: 'resource_missing' } })).toBe(
      'No such price (resource_missing)',
    );
  });

  it('retombe sur le type quand il n’y a pas de code', () => {
    expect(messageErreurStripe({ error: { message: 'Oups', type: 'api_error' } })).toBe('Oups (api_error)');
  });

  it('ne lève pas sur une réponse illisible', () => {
    expect(messageErreurStripe(null)).toBe('réponse Stripe illisible.');
    expect(messageErreurStripe({})).toBe('réponse Stripe illisible.');
  });
});

describe('lireAbonnementStripe', () => {
  const base = {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: 1_800_000_000,
    items: { data: [{ id: 'si_1', price: { id: 'price_1' } }] },
    metadata: { user_id: 'uuid-membre', waiver_accepted_at: '2026-09-18T10:00:00.000Z' },
  };

  it('lit un abonnement complet', () => {
    expect(lireAbonnementStripe(base)).toEqual({
      subscriptionId: 'sub_1',
      customerId: 'cus_1',
      itemId: 'si_1',
      priceId: 'price_1',
      statut: 'active',
      finPeriodeIso: new Date(1_800_000_000 * 1000).toISOString(),
      annulationProgrammee: false,
      userId: 'uuid-membre',
      renonciationLe: '2026-09-18T10:00:00.000Z',
    });
  });

  it('trouve l’échéance sur l’ARTICLE quand elle n’est plus sur l’abonnement', () => {
    // Stripe a déplacé `current_period_end` vers les articles dans les
    // versions récentes de l'API. Lire un seul des deux endroits cesserait
    // de marcher au jour d'une montée de version faite depuis le Dashboard,
    // en écrivant des abonnements sans échéance — donc sans expiration.
    const { current_period_end: _retire, ...sansEcheance } = base;
    const nouveauFormat = {
      ...sansEcheance,
      items: { data: [{ id: 'si_1', price: { id: 'price_1' }, current_period_end: 1_800_000_000 }] },
    };
    expect(lireAbonnementStripe(nouveauFormat)?.finPeriodeIso).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it('accepte un champ expandable rendu en objet plutôt qu’en identifiant', () => {
    const abo = lireAbonnementStripe({ ...base, customer: { id: 'cus_2', object: 'customer' } });
    expect(abo?.customerId).toBe('cus_2');
  });

  it('rend null sans échéance exploitable, plutôt qu’un abonnement sans fin', () => {
    const { current_period_end: _retire, ...sansEcheance } = base;
    expect(lireAbonnementStripe(sansEcheance)).toBeNull();
    expect(lireAbonnementStripe({ ...base, current_period_end: 0 })).toBeNull();
  });

  it('rend null sur un objet incomplet', () => {
    expect(lireAbonnementStripe(null)).toBeNull();
    expect(lireAbonnementStripe({})).toBeNull();
    expect(lireAbonnementStripe({ ...base, items: { data: [] } })).toBeNull();
    expect(lireAbonnementStripe({ ...base, items: { data: [{ id: 'si_1' }] } })).toBeNull();
    expect(lireAbonnementStripe({ ...base, status: '' })).toBeNull();
  });

  it('laisse le statut BRUT, sans le traduire', () => {
    // La traduction en ACTIVE / CANCELLED n'existe qu'en SQL : deux
    // implémentations de cette règle divergeraient au premier changement.
    expect(lireAbonnementStripe({ ...base, status: 'past_due' })?.statut).toBe('past_due');
    expect(lireAbonnementStripe({ ...base, status: 'canceled' })?.statut).toBe('canceled');
  });

  it('rend des métadonnées nulles quand elles sont absentes', () => {
    const { metadata: _retire, ...sansMeta } = base;
    const abo = lireAbonnementStripe(sansMeta);
    expect(abo?.userId).toBeNull();
    expect(abo?.renonciationLe).toBeNull();
  });

  it('ne lit `annulationProgrammee` que sur un vrai booléen', () => {
    expect(lireAbonnementStripe({ ...base, cancel_at_period_end: true })?.annulationProgrammee).toBe(true);
    expect(lireAbonnementStripe({ ...base, cancel_at_period_end: 'true' })?.annulationProgrammee).toBe(false);
  });
});

describe('lireSessionCheckout', () => {
  it('lit la métadonnée en priorité', () => {
    expect(
      lireSessionCheckout({ customer: 'cus_1', metadata: { user_id: 'u1' }, client_reference_id: 'u2' }),
    ).toEqual({ userId: 'u1', customerId: 'cus_1' });
  });

  it('retombe sur client_reference_id', () => {
    expect(lireSessionCheckout({ customer: 'cus_1', client_reference_id: 'u2' })).toEqual({
      userId: 'u2',
      customerId: 'cus_1',
    });
  });

  it('rend null sans membre identifiable — un paiement créé à la main depuis le Dashboard', () => {
    expect(lireSessionCheckout({ customer: 'cus_1' })).toBeNull();
    expect(lireSessionCheckout({ metadata: { user_id: 'u1' } })).toBeNull();
    expect(lireSessionCheckout(null)).toBeNull();
  });
});

describe('lireClientFacture', () => {
  it('lit l’identifiant client, en chaîne comme en objet', () => {
    expect(lireClientFacture({ customer: 'cus_1' })).toBe('cus_1');
    expect(lireClientFacture({ customer: { id: 'cus_2' } })).toBe('cus_2');
    expect(lireClientFacture({})).toBeNull();
  });
});

describe('messageEchecPaiement', () => {
  it('dit explicitement que l’accès continue', () => {
    // C'est l'arbitrage JEP-29 rendu lisible : un message qui annoncerait le
    // seul échec laisserait croire à une coupure.
    const { titre, corps } = messageEchecPaiement('2026-09-25T10:00:00.000Z');
    expect(titre).toContain('votre accès continue');
    expect(corps).toContain('n’est pas interrompu');
    expect(corps).toContain('25 septembre 2026');
  });

  it('reste juste sans date de relance connue', () => {
    const { corps } = messageEchecPaiement(null);
    expect(corps).toContain('dans les prochains jours');
    expect(corps).not.toContain('Invalid Date');
  });
});

describe('cleIdempotence', () => {
  it('produit la même clé pour deux appels rapprochés', () => {
    expect(cleIdempotence('checkout', 'u1', 'PRO', 'MONTHLY')).toBe(cleIdempotence('checkout', 'u1', 'PRO', 'MONTHLY'));
  });

  it('distingue deux membres, deux plans ou deux périodicités', () => {
    const base = cleIdempotence('checkout', 'u1', 'PRO', 'MONTHLY');
    expect(cleIdempotence('checkout', 'u2', 'PRO', 'MONTHLY')).not.toBe(base);
    expect(cleIdempotence('checkout', 'u1', 'PLUS', 'MONTHLY')).not.toBe(base);
    expect(cleIdempotence('checkout', 'u1', 'PRO', 'YEARLY')).not.toBe(base);
  });

  it('ne fige pas indéfiniment : deux fenêtres distinctes rendent deux clés', () => {
    // Une clé stable sans limite de temps entomberait un abandon volontaire
    // jusqu'à 24 h (cache d'idempotence Stripe) — la fenêtre glissante évite
    // ça sans perdre la protection contre une vraie retransmission réseau.
    const vrai = Date.now;
    try {
      Date.now = () => 0;
      const premiere = cleIdempotence('resilier', 'u1', 'sub_1');
      Date.now = () => FENETRE_IDEMPOTENCE_MS * 3;
      const seconde = cleIdempotence('resilier', 'u1', 'sub_1');
      expect(premiere).not.toBe(seconde);
    } finally {
      Date.now = vrai;
    }
  });
});

describe('sensChangement', () => {
  it('lit le sens dans l’ordre de la grille, pas dans le code du plan', () => {
    // Un palier ajouté en back-office doit se comporter correctement sans
    // une ligne de code — et la règle ESLint du dépôt interdit de toute
    // façon un `code === 'PRO'`.
    expect(sensChangement(2, 3)).toBe('MONTEE');
    expect(sensChangement(3, 2)).toBe('DESCENTE');
    expect(sensChangement(2, 2)).toBe('IDENTIQUE');
  });
});

describe('codeErreurStripe', () => {
  it('lit le code, puis le decline_code en repli', () => {
    expect(codeErreurStripe({ error: { code: 'card_declined' } })).toBe('card_declined');
    expect(codeErreurStripe({ error: { decline_code: 'insufficient_funds' } })).toBe('insufficient_funds');
    expect(codeErreurStripe({ error: {} })).toBeNull();
    expect(codeErreurStripe(null)).toBeNull();
  });
});

describe('messageRefusChangement', () => {
  it('distingue une authentification demandée d’une carte refusée', () => {
    // Les confondre enverrait la moitié des gens changer une carte qui
    // fonctionne parfaitement.
    expect(messageRefusChangement('authentication_required')).toContain('confirmation');
    expect(messageRefusChangement('card_declined')).toContain('refusé');
    expect(messageRefusChangement('authentication_required')).not.toBe(messageRefusChangement('card_declined'));
  });

  it('dit que la formule est inchangée quand le motif est inconnu', () => {
    expect(messageRefusChangement(null)).toContain('inchangée');
    expect(messageRefusChangement('quelque_chose_de_nouveau')).toContain('inchangée');
  });
});

describe('lirePhasesEcheancier / echeancierConforme', () => {
  const FIN = 1_800_000_000;
  const echeancier = {
    phases: [
      { start_date: 1_797_000_000, end_date: FIN, items: [{ price: 'price_pro' }] },
      { start_date: FIN, end_date: null, items: [{ price: 'price_plus' }] },
    ],
  };

  it('lit les deux phases et leurs prix', () => {
    const phases = lirePhasesEcheancier(echeancier);
    expect(phases).toHaveLength(2);
    expect(phases[0].priceId).toBe('price_pro');
    expect(phases[1].priceId).toBe('price_plus');
    expect(phases[0].endDate).toBe(FIN);
  });

  it('accepte un prix rendu en objet plutôt qu’en identifiant', () => {
    const phases = lirePhasesEcheancier({ phases: [{ items: [{ price: { id: 'price_x' } }] }] });
    expect(phases[0].priceId).toBe('price_x');
  });

  it('valide l’échéancier attendu', () => {
    expect(echeancierConforme(lirePhasesEcheancier(echeancier), 'price_pro', 'price_plus', FIN)).toBe(true);
  });

  it('refuse tout échéancier qui ne dit pas exactement ce qu’on a demandé', () => {
    // C'est ce refus qui transforme une facturation de travers, silencieuse
    // et à retardement, en erreur immédiate suivie d'une annulation.
    const phases = lirePhasesEcheancier(echeancier);
    expect(echeancierConforme(phases, 'price_autre', 'price_plus', FIN)).toBe(false);
    expect(echeancierConforme(phases, 'price_pro', 'price_autre', FIN)).toBe(false);
    expect(echeancierConforme(phases, 'price_pro', 'price_plus', FIN + 86400)).toBe(false);
    expect(echeancierConforme([], 'price_pro', 'price_plus', FIN)).toBe(false);
    expect(echeancierConforme(phases.slice(0, 1), 'price_pro', 'price_plus', FIN)).toBe(false);
  });

  it('rend une liste vide sur un objet illisible', () => {
    expect(lirePhasesEcheancier(null)).toEqual([]);
    expect(lirePhasesEcheancier({})).toEqual([]);
  });
});

describe('phaseCourante', () => {
  const phases = [
    { startDate: 1000, endDate: 2000, priceId: 'price_a' },
    { startDate: 2000, endDate: 3000, priceId: 'price_b' },
  ];

  it('rend la phase qui encadre l’instant présent, pas la première', () => {
    // Après qu'une première descente a pris effet, la phase 0 est PASSÉE :
    // la reprendre ferait réémettre une date de début révolue.
    expect(phaseCourante(phases, 1500)?.priceId).toBe('price_a');
    expect(phaseCourante(phases, 2500)?.priceId).toBe('price_b');
  });

  it('accepte une dernière phase sans fin', () => {
    expect(phaseCourante([{ startDate: 1000, endDate: null, priceId: 'price_a' }], 9999)?.priceId).toBe('price_a');
  });

  it('retombe sur la plus récente déjà commencée quand aucune n’encadre', () => {
    expect(phaseCourante(phases, 3500)?.priceId).toBe('price_b');
  });

  it('rend null quand rien n’a commencé', () => {
    expect(phaseCourante(phases, 500)).toBeNull();
    expect(phaseCourante([], 1500)).toBeNull();
  });
});
