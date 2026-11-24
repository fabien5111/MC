import { describe, expect, it } from 'vitest';
import {
  COULEURS_FOURNEE,
  colonnesSemaine,
  ajouterJoursIso,
  couleurFournee,
  couleursParRang,
  dateIsoLocale,
  grouperConsecutifs,
  indexDeplacement,
  joursConsecutifs,
  premierJourAffiche,
  tempsEtape,
  travailActif,
} from '@/lib/planning-jour';

describe('couleurFournee', () => {
  it('est stable et prise dans la palette', () => {
    expect(couleurFournee(7)).toBe(couleurFournee(7));
    expect(COULEURS_FOURNEE).toContain(couleurFournee(123456));
    expect(couleurFournee(0)).toBe(COULEURS_FOURNEE[0]);
    expect(couleurFournee(COULEURS_FOURNEE.length + 1)).toBe(COULEURS_FOURNEE[1]);
  });
});

describe('couleursParRang', () => {
  it('attribue les teintes dans l’ordre d’apparition, sans doublon', () => {
    const m = couleursParRang([42, 7, 42, 9, 3, 15]);
    expect([...m.keys()]).toEqual([42, 7, 9, 3, 15]);
    expect(m.get(42)).toBe(COULEURS_FOURNEE[0]);
    expect(m.get(7)).toBe(COULEURS_FOURNEE[1]);
    expect(new Set(m.values()).size).toBe(5);
  });
  it('boucle au-delà de la palette', () => {
    const ids = Array.from({ length: COULEURS_FOURNEE.length + 1 }, (_, i) => i + 100);
    const m = couleursParRang(ids);
    expect(m.get(ids[COULEURS_FOURNEE.length])).toBe(COULEURS_FOURNEE[0]);
  });
});

describe('grouperConsecutifs', () => {
  it('regroupe les étapes consécutives d’une même fournée', () => {
    const g = grouperConsecutifs([{ planId: 1 }, { planId: 1 }, { planId: 2 }]);
    expect(g.map((x) => [x.planId, x.items.length])).toEqual([
      [1, 2],
      [2, 1],
    ]);
  });
  it('respecte un ordre qui alterne entre fournées', () => {
    const g = grouperConsecutifs([{ planId: 1 }, { planId: 2 }, { planId: 1 }]);
    expect(g.map((x) => x.planId)).toEqual([1, 2, 1]);
  });
  it('liste vide', () => {
    expect(grouperConsecutifs([])).toEqual([]);
  });
});

describe('tempsEtape', () => {
  it('compose les temps et le total', () => {
    expect(tempsEtape({ prep_time: 15, wait_time: 15, cook_time: 20, cook_temp: 150 })).toEqual({
      parties: ['15 min prép', '15 min repos', '20 min à 150 °C'],
      total: '50 min',
    });
  });
  it('pas de total pour une seule composante', () => {
    expect(tempsEtape({ prep_time: 10, wait_time: null, cook_time: null, cook_temp: null })).toEqual({
      parties: ['10 min prép'],
      total: null,
    });
  });
  it('cuisson sans durée', () => {
    expect(tempsEtape({ prep_time: null, wait_time: null, cook_time: null, cook_temp: 180 }).parties).toEqual(['cuisson à 180 °C']);
  });
  it('reste seul : seulement la cuisson', () => {
    expect(tempsEtape({ prep_time: 20, wait_time: 60, cook_time: 25, cook_temp: 170 }, true)).toEqual({
      parties: ['25 min à 170 °C'],
      total: null,
    });
  });
  it('aucun temps', () => {
    expect(tempsEtape({ prep_time: null, wait_time: null, cook_time: null, cook_temp: null })).toEqual({ parties: [], total: null });
  });
});

describe('indexDeplacement', () => {
  it('borne aux extrémités', () => {
    expect(indexDeplacement(0, 3, -1)).toBeNull();
    expect(indexDeplacement(2, 3, 1)).toBeNull();
    expect(indexDeplacement(1, 3, -1)).toBe(0);
    expect(indexDeplacement(1, 3, 1)).toBe(2);
  });
});

describe('premierJourAffiche', () => {
  const j = (date: string, incomplet: boolean) => ({ date, incomplet });
  it('premier jour non terminé, dans le passé', () => {
    expect(premierJourAffiche([j('2026-11-17', false), j('2026-11-18', true), j('2026-11-19', true)], '2026-11-19')).toBe(1);
  });
  it('premier jour non terminé, aujourd’hui', () => {
    expect(premierJourAffiche([j('2026-11-18', false), j('2026-11-19', true)], '2026-11-19')).toBe(1);
  });
  it('passé terminé, reste à faire dans le futur : aujourd’hui', () => {
    expect(premierJourAffiche([j('2026-11-18', false), j('2026-11-19', false), j('2026-11-21', true)], '2026-11-19')).toBe(1);
  });
  it('aujourd’hui sans étape : premier jour à venir', () => {
    expect(premierJourAffiche([j('2026-11-18', false), j('2026-11-21', true)], '2026-11-19')).toBe(1);
  });
  it('tout est passé et terminé : dernier jour', () => {
    expect(premierJourAffiche([j('2026-11-10', false), j('2026-11-11', false)], '2026-11-19')).toBe(1);
  });
  it('date du jour inconnue : premier non terminé', () => {
    expect(premierJourAffiche([j('2026-11-10', false), j('2026-11-21', true)], null)).toBe(1);
  });
  it('aucun jour', () => {
    expect(premierJourAffiche([], '2026-11-19')).toBe(0);
  });
});

describe('colonnesSemaine', () => {
  it('jamais une colonne sous 260 px', () => {
    expect(colonnesSemaine(1070)).toBe(3); // 3 × 260 + 2 × 12 = 804 ≤ 1070 < 4 colonnes (1076)
    expect(colonnesSemaine(1076)).toBe(4);
    expect(colonnesSemaine(1280)).toBe(4);
  });
  it('plafonne à 5 colonnes', () => {
    expect(colonnesSemaine(1600)).toBe(5);
    expect(colonnesSemaine(3000)).toBe(5);
  });
  it('au moins 2 colonnes', () => {
    expect(colonnesSemaine(300)).toBe(2);
    expect(colonnesSemaine(0)).toBe(2);
  });
});

describe('travailActif / dateIsoLocale', () => {
  it('additionne préparation et cuisson', () => {
    expect(travailActif([{ prep_time: 15, cook_time: 20 }, { prep_time: null, cook_time: 5 }])).toBe(40);
  });
  it('date locale', () => {
    expect(dateIsoLocale(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('ajouterJoursIso / joursConsecutifs', () => {
  it('passe d’un mois et d’une année à l’autre', () => {
    expect(ajouterJoursIso('2026-11-30', 1)).toBe('2026-12-01');
    expect(ajouterJoursIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(ajouterJoursIso('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('traverse le changement d’heure sans sauter ni répéter un jour', () => {
    expect(joursConsecutifs('2026-03-28', 4)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
    expect(joursConsecutifs('2026-10-24', 4)).toEqual(['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27']);
  });
  it('nombre de jours demandé, jamais négatif', () => {
    expect(joursConsecutifs('2026-11-24', 5)).toHaveLength(5);
    expect(joursConsecutifs('2026-11-24', 0)).toEqual([]);
    expect(joursConsecutifs('2026-11-24', -2)).toEqual([]);
  });
});
