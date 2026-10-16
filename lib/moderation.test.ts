import { describe, expect, it } from 'vitest';
import {
  BAN_SANS_LIMITE,
  colonnesProfil,
  dureeBannissement,
  estRefusCompteBloque,
  actionAbonnementParDefaut,
  actionsAbonnementPossibles,
  composerEmailModeration,
  emailObligatoire,
  validerActionAbonnement,
  type EtatAbonnement,
  MESSAGE_COMPTE_BLOQUE,
  estBloque,
  etatModeration,
  statutAffiche,
  validerDemandeModeration,
  type ContexteModeration,
} from '@/lib/moderation';

const MAINTENANT = new Date('2026-10-06T12:00:00Z');
const DEMAIN = '2026-10-07T12:00:00.000Z';
const HIER = '2026-10-05T12:00:00.000Z';

const ctx = (over: Partial<ContexteModeration> = {}): ContexteModeration => ({
  acteurId: 'admin-1',
  cibleId: 'membre-1',
  cibleRole: 'member',
  etatActuel: { etat: 'actif' },
  ...over,
});

describe('etatModeration', () => {
  it('actif par défaut', () => {
    expect(etatModeration(null, MAINTENANT)).toEqual({ etat: 'actif' });
    expect(etatModeration({ status: 'active' }, MAINTENANT)).toEqual({ etat: 'actif' });
    expect(etatModeration({ status: 'pending' }, MAINTENANT)).toEqual({ etat: 'actif' });
  });

  it('désactivé, avec son motif', () => {
    expect(etatModeration({ status: 'disabled', disabled_reason: 'Spam' }, MAINTENANT)).toEqual({
      etat: 'desactive',
      motif: 'Spam',
    });
  });

  it('suspendu tant que la date de fin n’est pas passée', () => {
    const e = etatModeration({ status: 'suspended', suspended_until: DEMAIN, suspension_reason: 'Insultes' }, MAINTENANT);
    expect(e).toEqual({ etat: 'suspendu', motif: 'Insultes', jusquAu: DEMAIN });
    expect(estBloque(e)).toBe(true);
  });

  it('suspendu sans limite quand la date est vide', () => {
    expect(etatModeration({ status: 'suspended', suspended_until: null }, MAINTENANT)).toMatchObject({ etat: 'suspendu', jusquAu: null });
  });

  it('levée automatique : une suspension échue redevient active', () => {
    const ligne = { status: 'suspended', suspended_until: HIER };
    expect(etatModeration(ligne, MAINTENANT)).toEqual({ etat: 'actif' });
    expect(statutAffiche(ligne, MAINTENANT)).toBe('active');
  });

  it('statut affiché d’une suspension en cours', () => {
    expect(statutAffiche({ status: 'suspended', suspended_until: DEMAIN }, MAINTENANT)).toBe('suspended');
    expect(statutAffiche({ status: 'disabled' }, MAINTENANT)).toBe('disabled');
    expect(statutAffiche({ status: null }, MAINTENANT)).toBe('active');
  });
});

describe('validerDemandeModeration', () => {
  it('refuse d’agir sur soi-même', () => {
    const v = validerDemandeModeration({ action: 'suspendre', motif: 'x' }, ctx({ cibleId: 'admin-1' }), MAINTENANT);
    expect(v.ok).toBe(false);
  });

  it('refuse de suspendre ou désactiver un admin, accepte un gestionnaire', () => {
    expect(validerDemandeModeration({ action: 'desactiver' }, ctx({ cibleRole: 'admin' }), MAINTENANT).ok).toBe(false);
    expect(validerDemandeModeration({ action: 'suspendre', motif: 'x' }, ctx({ cibleRole: 'admin' }), MAINTENANT).ok).toBe(false);
    expect(validerDemandeModeration({ action: 'suspendre', motif: 'x' }, ctx({ cibleRole: 'gestionnaire' }), MAINTENANT).ok).toBe(true);
  });

  it('exige un motif pour suspendre', () => {
    expect(validerDemandeModeration({ action: 'suspendre', motif: '   ' }, ctx(), MAINTENANT).ok).toBe(false);
  });

  it('refuse une date de fin passée ou illisible', () => {
    expect(validerDemandeModeration({ action: 'suspendre', motif: 'x', jusquAu: HIER }, ctx(), MAINTENANT).ok).toBe(false);
    expect(validerDemandeModeration({ action: 'suspendre', motif: 'x', jusquAu: 'demain' }, ctx(), MAINTENANT).ok).toBe(false);
  });

  it('accepte une suspension datée ou sans limite', () => {
    const v = validerDemandeModeration({ action: 'suspendre', motif: ' Spam ', jusquAu: DEMAIN }, ctx(), MAINTENANT);
    expect(v).toEqual({ ok: true, demande: { action: 'suspendre', motif: 'Spam', jusquAu: DEMAIN } });
    const sansLimite = validerDemandeModeration({ action: 'suspendre', motif: 'Spam', jusquAu: '' }, ctx(), MAINTENANT);
    expect(sansLimite.ok && sansLimite.demande.jusquAu).toBe(null);
  });

  it('le plus fort l’emporte : pas de suspension sur un compte désactivé', () => {
    const desactive = ctx({ etatActuel: { etat: 'desactive', motif: null } });
    expect(validerDemandeModeration({ action: 'suspendre', motif: 'x' }, desactive, MAINTENANT).ok).toBe(false);
    expect(validerDemandeModeration({ action: 'desactiver' }, desactive, MAINTENANT).ok).toBe(false);
    const suspendu = ctx({ etatActuel: { etat: 'suspendu', motif: 'x', jusquAu: null } });
    expect(validerDemandeModeration({ action: 'desactiver' }, suspendu, MAINTENANT).ok).toBe(true);
  });

  it('ne lève que ce qui est bloqué, admin compris', () => {
    expect(validerDemandeModeration({ action: 'lever' }, ctx(), MAINTENANT).ok).toBe(false);
    const bloque = ctx({ cibleRole: 'admin', etatActuel: { etat: 'desactive', motif: null } });
    expect(validerDemandeModeration({ action: 'lever' }, bloque, MAINTENANT).ok).toBe(true);
  });

  it('refuse une action inconnue', () => {
    expect(validerDemandeModeration({ action: 'bannir' }, ctx(), MAINTENANT).ok).toBe(false);
  });
});

describe('dureeBannissement / colonnesProfil', () => {
  it('suspension datée : minutes arrondies au-dessus, jamais plus long que la suspension', () => {
    const fin = new Date(MAINTENANT.getTime() + 90 * 60_000).toISOString();
    expect(dureeBannissement({ action: 'suspendre', motif: 'x', jusquAu: fin }, MAINTENANT)).toBe('90m');
    const finCourte = new Date(MAINTENANT.getTime() + 10 * 60_000 + 1_000).toISOString();
    expect(dureeBannissement({ action: 'suspendre', motif: 'x', jusquAu: finCourte }, MAINTENANT)).toBe('11m');
  });

  it('sans limite et désactivation : cent ans ; levée : none', () => {
    expect(dureeBannissement({ action: 'suspendre', motif: 'x', jusquAu: null }, MAINTENANT)).toBe(BAN_SANS_LIMITE);
    expect(dureeBannissement({ action: 'desactiver', motif: null, jusquAu: null }, MAINTENANT)).toBe(BAN_SANS_LIMITE);
    expect(dureeBannissement({ action: 'lever', motif: null, jusquAu: null }, MAINTENANT)).toBe('none');
  });

  it('colonnes écrites : une désactivation efface la suspension, une levée efface tout', () => {
    expect(colonnesProfil({ action: 'suspendre', motif: 'm', jusquAu: DEMAIN })).toEqual({
      status: 'suspended',
      suspended_until: DEMAIN,
      suspension_reason: 'm',
      disabled_reason: null,
    });
    expect(colonnesProfil({ action: 'desactiver', motif: 'm', jusquAu: null })).toMatchObject({
      status: 'disabled',
      suspended_until: null,
      disabled_reason: 'm',
    });
    expect(colonnesProfil({ action: 'lever', motif: null, jusquAu: null })).toEqual({
      status: 'active',
      suspended_until: null,
      suspension_reason: null,
      disabled_reason: null,
    });
  });
});

describe('estRefusCompteBloque', () => {
  it('reconnaît le refus d\'une policy blocked_user_*', () => {
    expect(estRefusCompteBloque('new row violates row-level security policy "blocked_user_ins" for table "profiles"')).toBe(true);
    expect(estRefusCompteBloque('new row violates row-level security policy "blocked_user_upd" for table "recipes"')).toBe(true);
    expect(estRefusCompteBloque('new row violates row-level security policy "blocked_user_del" for table "favorites"')).toBe(true);
  });

  it('ne confond pas avec un autre refus ou une autre erreur', () => {
    expect(estRefusCompteBloque('new row violates row-level security policy "impersonation_ro_ins" for table "profiles"')).toBe(false);
    expect(estRefusCompteBloque('new row violates row-level security policy for table "recipes"')).toBe(false);
    expect(estRefusCompteBloque('duplicate key value violates unique constraint')).toBe(false);
    expect(estRefusCompteBloque(null)).toBe(false);
    expect(estRefusCompteBloque(undefined)).toBe(false);
  });

  it('le message montré ne nomme aucune policy', () => {
    expect(MESSAGE_COMPTE_BLOQUE).not.toMatch(/policy|row-level|blocked_user/i);
  });
});

const STRIPE: EtatAbonnement = {
  libelle: 'Gourmand',
  type: 'PAID',
  stripe: true,
  finPeriode: '2026-11-06T12:00:00.000Z',
  enPause: false,
  resiliationProgrammee: false,
  lectureStripe: 'ok',
};

describe('gestes sur l’abonnement', () => {
  it('rien à proposer sans abonnement Stripe lisible', () => {
    expect(actionsAbonnementPossibles('suspendre', null)).toEqual(['aucune']);
    expect(actionsAbonnementPossibles('suspendre', { ...STRIPE, stripe: false, lectureStripe: 'sans_objet' })).toEqual(['aucune']);
    expect(actionsAbonnementPossibles('desactiver', { ...STRIPE, lectureStripe: 'echec' })).toEqual(['aucune']);
  });

  it('pause ou résiliation au blocage, reprise à la levée', () => {
    expect(actionsAbonnementPossibles('suspendre', STRIPE)).toEqual(['aucune', 'pause', 'resilier']);
    expect(actionsAbonnementPossibles('desactiver', { ...STRIPE, enPause: true })).toEqual(['aucune', 'resilier']);
    expect(actionsAbonnementPossibles('suspendre', { ...STRIPE, resiliationProgrammee: true })).toEqual(['aucune']);
    expect(actionsAbonnementPossibles('lever', { ...STRIPE, enPause: true })).toEqual(['aucune', 'reprendre']);
    expect(actionsAbonnementPossibles('lever', STRIPE)).toEqual(['aucune']);
  });

  it('« ne rien faire » par défaut, sauf la reprise d’une pause à la levée', () => {
    expect(actionAbonnementParDefaut('suspendre', STRIPE)).toBe('aucune');
    expect(actionAbonnementParDefaut('lever', { ...STRIPE, enPause: true })).toBe('reprendre');
  });

  it('la route refuse un geste devenu impossible', () => {
    expect(validerActionAbonnement(undefined, 'suspendre', null)).toEqual({ ok: true, valeur: 'aucune' });
    expect(validerActionAbonnement('pause', 'suspendre', STRIPE)).toEqual({ ok: true, valeur: 'pause' });
    expect(validerActionAbonnement('pause', 'suspendre', { ...STRIPE, enPause: true }).ok).toBe(false);
    expect(validerActionAbonnement('reprendre', 'suspendre', STRIPE).ok).toBe(false);
    expect(validerActionAbonnement('rembourser', 'suspendre', STRIPE).ok).toBe(false);
  });

  it('une résiliation impose l’e-mail', () => {
    expect(emailObligatoire('resilier')).toBe(true);
    expect(emailObligatoire('pause')).toBe(false);
    expect(emailObligatoire('aucune')).toBe(false);
  });
});

describe('composerEmailModeration', () => {
  const base = { motif: 'Propos injurieux', jusquAu: null, abonnement: 'aucune' as const, finPeriode: null, urlSite: 'https://dev.jepatisse.com' };

  it('lien du portail Stripe : seulement sur un blocage, quand il est fourni', () => {
    const url = 'https://billing.stripe.com/p/login/xyz';
    expect(composerEmailModeration({ ...base, action: 'suspendre', urlPortail: url }).texte).toContain(url);
    expect(composerEmailModeration({ ...base, action: 'desactiver', urlPortail: url }).texte).toContain(url);
    expect(composerEmailModeration({ ...base, action: 'lever', urlPortail: url }).texte).not.toContain(url);
    expect(composerEmailModeration({ ...base, action: 'suspendre' }).texte).not.toContain('billing.stripe.com');
  });

  it('suspension : motif, durée et recours', () => {
    const m = composerEmailModeration({ ...base, action: 'suspendre' });
    expect(m.evenement).toBe('compte_suspendu');
    expect(m.texte).toContain('jusqu’à nouvel ordre');
    expect(m.texte).toContain('Motif : Propos injurieux');
    expect(m.texte).toContain('https://dev.jepatisse.com/contact');
  });

  it('suspension datée et pause des prélèvements', () => {
    const m = composerEmailModeration({ ...base, action: 'suspendre', jusquAu: DEMAIN, abonnement: 'pause' });
    expect(m.texte).toContain('jusqu’au');
    expect(m.texte).toContain('rien ne vous sera facturé');
  });

  it('désactivation et résiliation avec sa date de fin', () => {
    const m = composerEmailModeration({ ...base, action: 'desactiver', abonnement: 'resilier', finPeriode: '2026-11-06T12:00:00.000Z' });
    expect(m.evenement).toBe('compte_desactive');
    expect(m.texte).toContain('ne sont plus visibles');
    expect(m.texte).toContain('Votre abonnement est résilié');
    expect(m.texte).toContain('2026');
  });

  it('levée : lien de connexion, pas de recours, reprise annoncée', () => {
    const m = composerEmailModeration({ ...base, action: 'lever', motif: null, abonnement: 'reprendre' });
    expect(m.evenement).toBe('compte_retabli');
    expect(m.texte).toContain('https://dev.jepatisse.com/connexion');
    expect(m.texte).not.toContain('/contact');
    expect(m.texte).toContain('reprennent');
  });
});
