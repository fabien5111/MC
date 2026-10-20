import { describe, expect, it } from 'vitest';
import { PSEUDO_DELAI_CHANGEMENT_JOURS, PSEUDO_REFUS, prochainChangementPseudo, validerPseudo } from '@/lib/pseudo';

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

describe('validerPseudo — filet local (JEP-266)', () => {
  const refuse = (p: string) => expect(validerPseudo(p)).toEqual({ ok: false, message: PSEUDO_REFUS });
  const accepte = (p: string) => expect(validerPseudo(p).ok).toBe(true);

  it('refuse les vulgarités, même légères, en clair ou déguisées par des chiffres', () => {
    for (const p of ['merde', 'Con', 'Gros Cul', 'm3rde', 'c0n', 'b1te', 'Chier Fort', 'shit', 'Big Dick']) refuse(p);
  });

  it('refuse les termes religieux et politiques sans ambiguïté', () => {
    for (const p of ['Allah', 'Jihad', 'Macron', 'Trump', 'Vote RN', 'Le Pen', 'Free Palestine']) refuse(p);
  });

  it('refuse les expressions de plusieurs mots (ancienne entrée « sale-arabe »)', () => {
    refuse('Sale Arabe');
    refuse('sale-arabe');
  });

  it('accepte les prénoms, les chefs et les mots qui ne contiennent une vulgarité qu\'en sous-chaîne', () => {
    for (const p of ['Constance', 'Christian', 'Emmanuel Dupont', 'Pierre Hermé', 'ChocoAddict', 'Jésus Martin', 'Marine', 'Mohamed', 'Culinaire', 'Fabien 2', 'Pape Diouf']) accepte(p);
  });
});
