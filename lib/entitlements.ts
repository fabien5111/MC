// Droits d'abonnement — logique pure.
//
// Module volontairement SANS accès base ni `next/headers` : il est consommé
// par les Server Components, par les Client Components (jauges, blocage
// éducatif) et par les écrans d'administration. Même séparation que
// `ideas.ts` / `ideas-data.ts` et `pseudo.ts` / `pseudo-data.ts` — regrouper
// le data-fetching ici casserait le build du bundle client.
//
// **Le calcul des droits effectifs n'est pas ici : il est en SQL**
// (`mc_effective_rights`). Ce module ne fait que consommer son résultat.
// Deux implémentations de la règle du maximum, l'une en TypeScript et
// l'autre en PL/pgSQL, auraient divergé au premier changement — et c'est la
// version SQL qui fait foi, puisque c'est elle que les triggers appliquent.
// Cf. docs/abonnements.md §1.2.

// ── Formes de données ───────────────────────────────────────

export type LimitType = 'NONE' | 'STOCK' | 'FLOW';
export type RightValue = 'YES' | 'NO' | 'LIMIT';

/** Une ligne de `mc_effective_rights`, telle que le moteur SQL la rend. */
export type EffectiveRight = {
  featureKey: string;
  limitType: LimitType;
  allowed: boolean;
  unlimited: boolean;
  limitValue: number | null;
};

/** Droits effectifs d'un membre, indexés par clé de fonctionnalité. */
export type Entitlements = Record<string, EffectiveRight>;

/** Une case de la grille : ce qu'une version de plan accorde. */
export type GridRight = {
  value: RightValue;
  limitValue: number | null;
  unlimited: boolean;
};

export type GridFeature = {
  key: string;
  label: string;
  description: string | null;
  section: string;
  sectionOrder: number;
  orderIndex: number;
  limitType: LimitType;
  unit: string | null;
  visible: boolean;
};

export type GridPlan = {
  code: string;
  label: string;
  tagline: string | null;
  orderIndex: number;
  isDefault: boolean;
  trialAllowed: boolean;
  active: boolean;
  priceMonthly: number | null;
  priceYearly: number | null;
  currency: string;
};

/** La grille complète : ce que la page publique et le back-office affichent. */
export type Grid = {
  plans: GridPlan[];
  features: GridFeature[];
  /** rights[codePlan][cleFonctionnalite] */
  rights: Record<string, Record<string, GridRight>>;
};

// ── Verdict ─────────────────────────────────────────────────

export type Verdict =
  | { autorise: true }
  | {
      autorise: false;
      raison: 'PLAN_INSUFFISANT' | 'LIMITE_ATTEINTE';
      limite: number | null;
      usage: number;
    };

/**
 * Accès binaire. Une fonctionnalité **absente** des droits est refusée : un
 * oubli de ligne en back-office ne doit pas ouvrir un droit payant à tout le
 * monde (l'inverse — une limite non paramétrée — vaut illimité, parce qu'une
 * case oubliée ne doit pas fermer le site). Cf. docs/abonnements.md §1.5.
 */
export function canAccess(rights: Entitlements, key: string): boolean {
  return rights[key]?.allowed === true;
}

/** Plafond applicable. `null` = illimité (ou non plafonnable). */
export function getLimit(rights: Entitlements, key: string): number | null {
  const r = rights[key];
  if (!r || !r.allowed || r.unlimited) return null;
  return r.limitValue;
}

/**
 * Verdict à afficher, à partir de droits et d'une consommation déjà connus.
 *
 * **Jamais une garde avant écriture** : entre ce verdict et l'action, une
 * autre requête peut consommer le dernier crédit. La garde est le trigger
 * `mc_enforce_stock` (stock) ou `mc_consume` (flux). Ce verdict sert à
 * afficher — griser un bouton, composer un message.
 */
export function verdict(rights: Entitlements, key: string, usage: number): Verdict {
  const r = rights[key];
  if (!r || !r.allowed) return { autorise: false, raison: 'PLAN_INSUFFISANT', limite: null, usage };
  if (r.limitType === 'NONE' || r.unlimited || r.limitValue === null) return { autorise: true };
  if (usage >= r.limitValue) {
    return { autorise: false, raison: 'LIMITE_ATTEINTE', limite: r.limitValue, usage };
  }
  return { autorise: true };
}

// ── Jauges ──────────────────────────────────────────────────

export type GaugeLevel = 'normal' | 'attention' | 'atteint';

/** Seuils du §9.3 : normal jusqu'à 70 %, attention de 70 à 99 %, atteint à 100 %. */
export function gaugeLevel(usage: number, limit: number | null): GaugeLevel {
  if (limit === null || limit <= 0) return usage > 0 && limit === 0 ? 'atteint' : 'normal';
  if (usage >= limit) return 'atteint';
  return usage / limit >= 0.7 ? 'attention' : 'normal';
}

/**
 * Un membre rétrogradé reste au-dessus de sa limite : c'est attendu et ne
 * doit produire aucune erreur (§7.4). On le distingue pour pouvoir le dire
 * en clair plutôt que d'afficher une jauge à 300 %.
 */
export function isOverLimit(usage: number, limit: number | null): boolean {
  return limit !== null && usage > limit;
}

// ── Comparaison de droits ───────────────────────────────────

/**
 * Score ordinal d'une case de grille, pour comparer deux versions ou deux
 * plans. `YES`, l'illimité assumé et le **non paramétré** valent tous
 * l'infini : c'est la sémantique réelle au runtime, et présenter un passage
 * de « non paramétré » à « 20 » comme une amélioration serait un mensonge.
 */
export function rightScore(r: GridRight | undefined): number {
  if (!r || r.value === 'NO') return -1;
  if (r.value === 'YES') return Number.POSITIVE_INFINITY;
  if (r.unlimited || r.limitValue === null) return Number.POSITIVE_INFINITY;
  return r.limitValue;
}

export type RightChange = {
  featureKey: string;
  before: GridRight | undefined;
  after: GridRight | undefined;
  /** Une modification favorable s'applique tout de suite aux abonnés en cours. */
  favorable: boolean;
};

/**
 * Différences entre deux versions d'un même plan, pour l'écran de
 * confirmation du back-office (§8.1). Le sens de la modification n'est pas
 * saisi par l'admin : il se déduit du score.
 */
export function diffRights(
  before: Record<string, GridRight>,
  after: Record<string, GridRight>,
): RightChange[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const out: RightChange[] = [];
  for (const key of keys) {
    const a = before[key];
    const b = after[key];
    const sa = rightScore(a);
    const sb = rightScore(b);
    if (sa === sb) continue;
    out.push({ featureKey: key, before: a, after: b, favorable: sb > sa });
  }
  return out.sort((x, y) => x.featureKey.localeCompare(y.featureKey));
}

// ── Contrôle de cohérence de la grille (§8.2) ───────────────

export type CoherenceIssue = {
  kind: 'LIMITE_NON_PARAMETREE' | 'PROGRESSIVITE';
  severity: 'critique' | 'attention';
  featureKey: string;
  planCode: string;
  message: string;
};

/**
 * Ce que le bandeau permanent du back-office doit signaler.
 *
 * Le cas **critique** est la limite de flux non paramétrée : elle vaut
 * illimité au runtime, donc une dépense d'API non bornée. Une limite de
 * stock oubliée ne coûte que des lignes en base — c'est un avertissement.
 * L'incohérence de progressivité n'est jamais bloquante : c'est peut-être
 * voulu.
 */
export function coherenceIssues(grid: Grid): CoherenceIssue[] {
  const out: CoherenceIssue[] = [];
  const features = new Map(grid.features.map((f) => [f.key, f]));
  const plans = [...grid.plans].sort((a, b) => a.orderIndex - b.orderIndex);

  for (const plan of plans) {
    const rights = grid.rights[plan.code] ?? {};
    for (const [key, right] of Object.entries(rights)) {
      const feature = features.get(key);
      if (!feature) continue;
      if (right.value === 'LIMIT' && right.limitValue === null && !right.unlimited) {
        const flux = feature.limitType === 'FLOW';
        out.push({
          kind: 'LIMITE_NON_PARAMETREE',
          severity: flux ? 'critique' : 'attention',
          featureKey: key,
          planCode: plan.code,
          message: flux
            ? `« ${feature.label} » n'a pas de quota sur ${plan.label} : la consommation est illimitée tant qu'aucune valeur n'est saisie.`
            : `« ${feature.label} » n'a pas de plafond sur ${plan.label} : l'accès est illimité tant qu'aucune valeur n'est saisie.`,
        });
      }
    }
  }

  // Progressivité : un plan supérieur ne devrait jamais offrir moins.
  for (let i = 1; i < plans.length; i++) {
    const lower = plans[i - 1];
    const upper = plans[i];
    for (const feature of grid.features) {
      const sLower = rightScore(grid.rights[lower.code]?.[feature.key]);
      const sUpper = rightScore(grid.rights[upper.code]?.[feature.key]);
      if (sUpper < sLower) {
        out.push({
          kind: 'PROGRESSIVITE',
          severity: 'attention',
          featureKey: feature.key,
          planCode: upper.code,
          message: `« ${feature.label} » est moins généreux sur ${upper.label} que sur ${lower.label}.`,
        });
      }
    }
  }
  return out;
}

// ── Rendu des valeurs ───────────────────────────────────────

/** Libellé d'une case, pour la page publique comme pour un message de blocage. */
export function formatRight(right: GridRight | undefined, feature: GridFeature): string {
  if (!right || right.value === 'NO') return 'Non inclus';
  if (right.value === 'YES') return 'Inclus';
  if (right.unlimited || right.limitValue === null) return 'Illimité';
  return feature.unit ? `${right.limitValue} ${feature.unit}` : String(right.limitValue);
}

/**
 * Économie de la formule annuelle (§9.2). `null` quand elle n'est pas
 * calculable — pas de tarif annuel, ou une annuité plus chère que douze
 * mensualités, qu'il vaut mieux ne pas annoncer comme une remise négative.
 */
export function annualSaving(monthly: number | null, yearly: number | null): number | null {
  if (monthly === null || yearly === null || monthly <= 0) return null;
  const full = monthly * 12;
  if (yearly >= full) return null;
  return Math.round(((full - yearly) / full) * 100);
}

/** La bascule mensuel/annuel n'apparaît que si un plan au moins la propose. */
export function hasYearlyOption(plans: GridPlan[]): boolean {
  return plans.some((p) => p.priceYearly !== null);
}

// ── Blocage éducatif (§9.4) ─────────────────────────────────

export type UpgradeSuggestion = {
  planCode: string;
  planLabel: string;
  /** Ce que ce plan accorde, en toutes lettres : « Illimité », « 20 imports / mois »… */
  value: string;
};

/**
 * Le plan le moins cher qui fait mieux que le plan courant sur cette
 * fonctionnalité. Renvoie `null` quand aucun ne fait mieux — le message ne
 * doit alors pas inviter à payer pour rien.
 */
export function upgradeSuggestion(
  grid: Grid,
  featureKey: string,
  currentPlanCode: string,
): UpgradeSuggestion | null {
  const feature = grid.features.find((f) => f.key === featureKey);
  if (!feature) return null;
  const current = rightScore(grid.rights[currentPlanCode]?.[featureKey]);
  const candidates = grid.plans
    .filter((p) => p.active && p.code !== currentPlanCode)
    .filter((p) => rightScore(grid.rights[p.code]?.[featureKey]) > current)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const best = candidates[0];
  if (!best) return null;
  return {
    planCode: best.code,
    planLabel: best.label,
    value: formatRight(grid.rights[best.code]?.[featureKey], feature),
  };
}

export type BlockingMessage = {
  titre: string;
  corps: string;
  /** Proposé seulement quand une porte de sortie gratuite existe réellement. */
  alternative: string | null;
  suggestion: UpgradeSuggestion | null;
};

/**
 * Message affiché quand une création est refusée. **Composant unique et
 * générique** : le texte se déduit de la grille, il n'est jamais écrit en dur
 * par fonctionnalité (§9.4). Ajouter une fonctionnalité en back-office ne
 * demande donc aucune ligne de code ici.
 */
export function blockingMessage(
  grid: Grid,
  featureKey: string,
  currentPlanCode: string,
  v: Verdict,
): BlockingMessage | null {
  if (v.autorise) return null;
  const feature = grid.features.find((f) => f.key === featureKey);
  const label = feature?.label ?? featureKey;
  const suggestion = upgradeSuggestion(grid, featureKey, currentPlanCode);

  if (v.raison === 'PLAN_INSUFFISANT') {
    return {
      titre: `${label} n'est pas incluse dans votre formule`,
      corps: suggestion
        ? `${suggestion.planLabel} vous donne accès à « ${label} ».`
        : `Cette fonctionnalité n'est pas disponible sur votre formule.`,
      alternative: null,
      suggestion,
    };
  }

  const plafond = v.limite === null ? '' : ` (${v.limite})`;
  return {
    titre: `Vous avez atteint votre limite${plafond}`,
    corps: suggestion
      ? `Vous utilisez ${v.usage} sur ${v.limite} pour « ${label} ». ${suggestion.planLabel} vous en accorde : ${suggestion.value.toLowerCase()}.`
      : `Vous utilisez ${v.usage} sur ${v.limite} pour « ${label} ».`,
    alternative: freeAlternative(featureKey),
    suggestion,
  };
}

/**
 * Porte de sortie gratuite, quand elle existe. Volontairement la SEULE
 * table de correspondance par clé de tout le module : une alternative dépend
 * du geste concret que le membre peut faire, et ne se déduit d'aucune donnée
 * de la grille. Absente d'ici = pas d'alternative proposée, plutôt qu'un
 * conseil vague.
 */
function freeAlternative(featureKey: string): string | null {
  switch (featureKey) {
    case 'fournees_actives_max':
      return 'Terminez ou supprimez une fournée en cours pour en lancer une nouvelle.';
    case 'listes_courses_max':
      return 'Supprimez une liste de courses dont vous n’avez plus besoin.';
    case 'favoris_max':
      return 'Retirez une recette de vos favoris pour en ajouter une autre.';
    default:
      return null;
  }
}

// ── Refus remontés par la base ───────────────────────────────

export type QuotaFailure = {
  code: 'DENIED' | 'EXCEEDED' | 'FORBIDDEN' | 'AUTH' | 'AUTRE';
  featureKey: string | null;
  usage: number | null;
  limit: number | null;
};

/**
 * Traduit une erreur remontée par la base en refus exploitable.
 *
 * Les gardes SQL lèvent des messages de la forme
 * `MC_QUOTA_EXCEEDED:<clé>:<usage>:<plafond>` : ce format existe pour que
 * l'interface puisse composer un message éducatif sans relire la grille, et
 * pour qu'un refus de quota ne ressemble jamais à une panne. Une erreur qui
 * n'en est pas un est rendue telle quelle (`AUTRE`) — la masquer derrière un
 * « limite atteinte » serait un mensonge.
 */
export function quotaFailure(error: unknown): QuotaFailure | null {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error ?? '');
  if (!message.startsWith('MC_QUOTA_')) return null;

  const [tete, ...reste] = message.split(':');
  const nombre = (v: string | undefined) => {
    const n = Number.parseInt(v ?? '', 10);
    return Number.isFinite(n) ? n : null;
  };

  switch (tete) {
    case 'MC_QUOTA_EXCEEDED':
      return { code: 'EXCEEDED', featureKey: reste[0] ?? null, usage: nombre(reste[1]), limit: nombre(reste[2]) };
    case 'MC_QUOTA_DENIED':
      return { code: 'DENIED', featureKey: reste[0] ?? null, usage: null, limit: null };
    case 'MC_QUOTA_FORBIDDEN':
      return { code: 'FORBIDDEN', featureKey: null, usage: null, limit: null };
    case 'MC_QUOTA_AUTH':
      return { code: 'AUTH', featureKey: null, usage: null, limit: null };
    default:
      return { code: 'AUTRE', featureKey: reste[0] ?? null, usage: null, limit: null };
  }
}
