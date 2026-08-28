// Tests du calcul pur des droits d'abonnement.
//
// Portée volontairement étroite : ce fichier ne teste que `lib/entitlements.ts`,
// seul module du chantier dont une erreur est silencieuse. Le calcul des
// droits effectifs lui-même est en SQL (`mc_effective_rights`) et se vérifie
// en base, pas ici.
import { describe, expect, it } from 'vitest';
import {
  annualSaving,
  blockingMessage,
  canAccess,
  coherenceIssues,
  diffRights,
  formatRight,
  gaugeLevel,
  getLimit,
  hasYearlyOption,
  isOverLimit,
  quotaFailure,
  rightScore,
  upgradeSuggestion,
  verdict,
  type Entitlements,
  type Grid,
  type GridFeature,
  type GridPlan,
  type GridRight,
} from './entitlements';

const oui: GridRight = { value: 'YES', limitValue: null, unlimited: false };
const non: GridRight = { value: 'NO', limitValue: null, unlimited: false };
const illimite: GridRight = { value: 'LIMIT', limitValue: null, unlimited: true };
const nonParametre: GridRight = { value: 'LIMIT', limitValue: null, unlimited: false };
const limite = (n: number): GridRight => ({ value: 'LIMIT', limitValue: n, unlimited: false });

function feature(over: Partial<GridFeature> & { key: string }): GridFeature {
  return {
    label: over.key,
    description: null,
    section: 'Section',
    sectionOrder: 1,
    orderIndex: 1,
    limitType: 'NONE',
    unit: null,
    visible: true,
    ...over,
  };
}

function plan(code: string, orderIndex: number, over: Partial<GridPlan> = {}): GridPlan {
  return {
    code,
    label: code,
    tagline: null,
    orderIndex,
    isDefault: orderIndex === 1,
    trialAllowed: orderIndex > 1,
    active: true,
    priceMonthly: null,
    priceYearly: null,
    currency: 'EUR',
    ...over,
  };
}

const grille: Grid = {
  plans: [plan('FREE', 1), plan('PLUS', 2), plan('PRO', 3)],
  features: [
    feature({ key: 'fournees_actives_max', label: 'Fournées actives', limitType: 'STOCK', unit: 'fournées' }),
    feature({ key: 'import_ia_mensuel', label: 'Import par IA', limitType: 'FLOW', unit: 'imports / mois' }),
    feature({ key: 'mode_projet', label: 'Mode projet' }),
  ],
  rights: {
    FREE: { fournees_actives_max: limite(2), import_ia_mensuel: non, mode_projet: non },
    PLUS: { fournees_actives_max: limite(15), import_ia_mensuel: limite(20), mode_projet: non },
    PRO: { fournees_actives_max: illimite, import_ia_mensuel: limite(100), mode_projet: oui },
  },
};

const droits: Entitlements = {
  fournees_actives_max: { featureKey: 'fournees_actives_max', limitType: 'STOCK', allowed: true, unlimited: false, limitValue: 2 },
  import_ia_mensuel: { featureKey: 'import_ia_mensuel', limitType: 'FLOW', allowed: false, unlimited: false, limitValue: null },
  mode_projet: { featureKey: 'mode_projet', limitType: 'NONE', allowed: false, unlimited: false, limitValue: null },
};

describe('accès et plafonds', () => {
  it('refuse une fonctionnalité absente des droits', () => {
    // Un oubli de ligne en back-office ne doit pas ouvrir un droit payant.
    expect(canAccess(droits, 'fonctionnalite_inconnue')).toBe(false);
  });

  it('rend null pour un plafond illimité comme pour un droit refusé', () => {
    expect(getLimit(droits, 'fournees_actives_max')).toBe(2);
    expect(getLimit(droits, 'mode_projet')).toBeNull();
    expect(
      getLimit({ x: { featureKey: 'x', limitType: 'STOCK', allowed: true, unlimited: true, limitValue: null } }, 'x'),
    ).toBeNull();
  });
});

describe('verdict', () => {
  it('autorise tant que la consommation est sous le plafond', () => {
    expect(verdict(droits, 'fournees_actives_max', 1)).toEqual({ autorise: true });
  });

  it('refuse à égalité, pas seulement au-dessus', () => {
    // La comparaison est `usage < limite` : à 2 sur 2, on ne crée plus.
    expect(verdict(droits, 'fournees_actives_max', 2)).toMatchObject({
      autorise: false,
      raison: 'LIMITE_ATTEINTE',
    });
  });

  it('distingue le plan insuffisant de la limite atteinte', () => {
    expect(verdict(droits, 'mode_projet', 0)).toMatchObject({ raison: 'PLAN_INSUFFISANT' });
  });

  it('laisse passer un membre rétrogradé au-dessus de sa limite, sans erreur', () => {
    // §7.4 : l'existant est préservé, seule la création est bloquée.
    const v = verdict(droits, 'fournees_actives_max', 5);
    expect(v.autorise).toBe(false);
    expect(isOverLimit(5, 2)).toBe(true);
  });
});

describe('jauges', () => {
  it('applique les seuils 70 % et 100 %', () => {
    expect(gaugeLevel(6, 10)).toBe('normal');
    expect(gaugeLevel(7, 10)).toBe('attention');
    expect(gaugeLevel(10, 10)).toBe('atteint');
    expect(gaugeLevel(30, 10)).toBe('atteint');
  });

  it('ne barre jamais une consommation illimitée', () => {
    expect(gaugeLevel(9999, null)).toBe('normal');
  });
});

describe('comparaison de droits', () => {
  it('classe non paramétré avec illimité, pas avec zéro', () => {
    // C'est la sémantique du runtime : sans valeur saisie, rien ne plafonne.
    expect(rightScore(nonParametre)).toBe(Number.POSITIVE_INFINITY);
    expect(rightScore(illimite)).toBe(Number.POSITIVE_INFINITY);
    expect(rightScore(non)).toBe(-1);
    expect(rightScore(limite(3))).toBe(3);
  });

  it('voit un plafond posé sur une limite non paramétrée comme défavorable', () => {
    const changes = diffRights({ a: nonParametre }, { a: limite(20) });
    expect(changes).toHaveLength(1);
    expect(changes[0].favorable).toBe(false);
  });

  it('marque favorable une limite relevée et défavorable une limite abaissée', () => {
    expect(diffRights({ a: limite(3) }, { a: limite(5) })[0].favorable).toBe(true);
    expect(diffRights({ a: limite(5) }, { a: limite(3) })[0].favorable).toBe(false);
  });

  it('ignore les cases inchangées', () => {
    expect(diffRights({ a: limite(3), b: oui }, { a: limite(3), b: oui })).toEqual([]);
  });
});

describe('contrôle de cohérence', () => {
  it('classe critique un quota de flux non paramétré, et seulement lui', () => {
    // Un flux sans quota, c'est une dépense d'API non bornée ; un stock sans
    // plafond ne coûte que des lignes en base.
    const g: Grid = {
      ...grille,
      rights: {
        ...grille.rights,
        PLUS: { ...grille.rights.PLUS, import_ia_mensuel: nonParametre, fournees_actives_max: nonParametre },
      },
    };
    const issues = coherenceIssues(g).filter((i) => i.kind === 'LIMITE_NON_PARAMETREE');
    expect(issues.find((i) => i.featureKey === 'import_ia_mensuel')?.severity).toBe('critique');
    expect(issues.find((i) => i.featureKey === 'fournees_actives_max')?.severity).toBe('attention');
  });

  it('signale une régression de progressivité entre deux plans successifs', () => {
    const g: Grid = {
      ...grille,
      rights: { ...grille.rights, PRO: { ...grille.rights.PRO, import_ia_mensuel: limite(5) } },
    };
    const issues = coherenceIssues(g).filter((i) => i.kind === 'PROGRESSIVITE');
    expect(issues).toHaveLength(1);
    expect(issues[0].planCode).toBe('PRO');
  });

  it('ne signale rien sur une grille saine', () => {
    expect(coherenceIssues(grille)).toEqual([]);
  });
});

describe('rendu des valeurs', () => {
  const f = grille.features[0];
  it('rend les quatre états lisibles', () => {
    expect(formatRight(non, f)).toBe('Non inclus');
    expect(formatRight(oui, f)).toBe('Inclus');
    expect(formatRight(illimite, f)).toBe('Illimité');
    expect(formatRight(limite(3), f)).toBe('3 fournées');
  });

  it('traite le non paramétré comme illimité, comme le moteur', () => {
    expect(formatRight(nonParametre, f)).toBe('Illimité');
  });
});

describe('tarifs', () => {
  it('calcule l’économie annuelle en pourcentage arrondi', () => {
    expect(annualSaving(5, 50)).toBe(17);
  });

  it('n’annonce pas de remise quand il n’y en a pas', () => {
    expect(annualSaving(5, 60)).toBeNull();
    expect(annualSaving(5, 70)).toBeNull();
    expect(annualSaving(null, 50)).toBeNull();
  });

  it('masque la bascule tant qu’aucun plan n’a de tarif annuel', () => {
    expect(hasYearlyOption(grille.plans)).toBe(false);
    expect(hasYearlyOption([plan('PLUS', 2, { priceYearly: 50 })])).toBe(true);
  });
});

describe('blocage éducatif', () => {
  it('propose le plan le moins cher qui fait mieux, pas le plus cher', () => {
    const s = upgradeSuggestion(grille, 'fournees_actives_max', 'FREE');
    expect(s?.planCode).toBe('PLUS');
    expect(s?.value).toBe('15 fournées');
  });

  it('ne propose rien quand aucun plan ne fait mieux', () => {
    expect(upgradeSuggestion(grille, 'mode_projet', 'PRO')).toBeNull();
  });

  it('compose le message depuis la grille, sans texte écrit en dur', () => {
    const m = blockingMessage(grille, 'fournees_actives_max', 'FREE', {
      autorise: false,
      raison: 'LIMITE_ATTEINTE',
      limite: 2,
      usage: 2,
    });
    expect(m?.corps).toContain('2 sur 2');
    expect(m?.corps).toContain('15 fournées');
    expect(m?.alternative).toContain('Terminez');
  });

  it('n’invente pas d’alternative gratuite quand il n’y en a pas', () => {
    const m = blockingMessage(grille, 'mode_projet', 'FREE', {
      autorise: false,
      raison: 'PLAN_INSUFFISANT',
      limite: null,
      usage: 0,
    });
    expect(m?.alternative).toBeNull();
    expect(m?.suggestion?.planCode).toBe('PRO');
  });

  it('ne rend aucun message quand l’action est autorisée', () => {
    expect(blockingMessage(grille, 'mode_projet', 'PRO', { autorise: true })).toBeNull();
  });
});

describe('refus remontés par la base', () => {
  it('décode un dépassement avec sa clé, sa consommation et son plafond', () => {
    expect(quotaFailure({ message: 'MC_QUOTA_EXCEEDED:fournees_actives_max:2:2' })).toEqual({
      code: 'EXCEEDED',
      featureKey: 'fournees_actives_max',
      usage: 2,
      limit: 2,
    });
  });

  it('décode un droit absent du plan', () => {
    expect(quotaFailure({ message: 'MC_QUOTA_DENIED:mode_projet' })).toMatchObject({
      code: 'DENIED',
      featureKey: 'mode_projet',
    });
  });

  it('ne travestit pas une panne en limite atteinte', () => {
    // Une vraie erreur base doit remonter telle quelle : la masquer derrière
    // « limite atteinte » enverrait le membre payer pour un bug.
    expect(quotaFailure({ message: 'could not connect to server' })).toBeNull();
    expect(quotaFailure(new Error('duplicate key value violates unique constraint'))).toBeNull();
  });

  it('reste robuste sur un message tronqué', () => {
    expect(quotaFailure({ message: 'MC_QUOTA_EXCEEDED:import_ia_mensuel' })).toEqual({
      code: 'EXCEEDED',
      featureKey: 'import_ia_mensuel',
      usage: null,
      limit: null,
    });
  });
});
