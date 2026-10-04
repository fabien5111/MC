import { describe, expect, it } from 'vitest';
import { PSEUDO_DELAI_CHANGEMENT_JOURS, prochainChangementPseudo } from '@/lib/pseudo';

const JOUR = 86_400_000;
const MAINTENANT = new Date('2026-10-04T12:00:00Z');

describe('prochainChangementPseudo', () => {
  it('libre tant que le membre n\'a jamais changé de pseudo', () => {
    expect(prochainChangementPseudo(null, MAINTENANT)).toBeNull();
    expect(prochainChangementPseudo(undefined, MAINTENANT)).toBeNull();
  });

  it('verrouillé pendant 60 jours après un changement', () => {
    const changement = new Date(MAINTENANT.getTime() - 10 * JOUR).toISOString();
    const echeance = prochainChangementPseudo(changement, MAINTENANT);
    expect(echeance).not.toBeNull();
    expect(echeance!.getTime() - new Date(changement).getTime()).toBe(PSEUDO_DELAI_CHANGEMENT_JOURS * JOUR);
  });

  it('libre une fois le délai écoulé (60 jours pile compris)', () => {
    const pile = new Date(MAINTENANT.getTime() - PSEUDO_DELAI_CHANGEMENT_JOURS * JOUR).toISOString();
    expect(prochainChangementPseudo(pile, MAINTENANT)).toBeNull();
    const ancien = new Date(MAINTENANT.getTime() - 200 * JOUR).toISOString();
    expect(prochainChangementPseudo(ancien, MAINTENANT)).toBeNull();
  });

  it('date illisible : pas de blocage', () => {
    expect(prochainChangementPseudo('pas-une-date', MAINTENANT)).toBeNull();
  });
});
