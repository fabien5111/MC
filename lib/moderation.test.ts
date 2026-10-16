import { describe, expect, it } from 'vitest';
import {
  BAN_SANS_LIMITE,
  colonnesProfil,
  dureeBannissement,
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
  it('suspension datée : heures arrondies au-dessus', () => {
    const fin = new Date(MAINTENANT.getTime() + 90 * 60_000).toISOString();
    expect(dureeBannissement({ action: 'suspendre', motif: 'x', jusquAu: fin }, MAINTENANT)).toBe('2h');
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
