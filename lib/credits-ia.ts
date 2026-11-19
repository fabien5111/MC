// Crédits IA (JEP-405) — logique pure.
//
// Les fonctions d'IA ne consomment plus chacune leur propre quota mensuel :
// elles débitent une dotation unique, `credits_ia_mensuel` (fonctionnalité
// FLOW de la grille, PLUS 120 / PRO 300 / PRO_ESSAI 40), d'un nombre de
// crédits qui dépend de l'action. C'est ICI, et nulle part ailleurs, qu'est
// écrit le coût d'une action : routes, boutons et historique le lisent.
//
// **Règle de calcul de la grille** (arbitrage du 11/11/2026) : crédits =
// coût p90 de l'action ÷ 0,004 $, arrondi à l'entier supérieur (relevé de
// `ai_usage` du 11/11/2026). Une nouvelle fonction se chiffre avec la même
// formule, sans débat.
//
// Les droits d'ACCÈS restent portés par leurs propres clés (`import_ia_mensuel`,
// `ajustement_ia_mensuel`, `mode_projet_ia_mensuel`, passées en « oui / non ») :
// le mode projet reste fermé au PLUS, quel que soit son solde.
//
// Module sans accès base : lu par les routes, les Server et Client Components.

/** Clé de la grille qui porte la dotation mensuelle. */
export const CLE_CREDITS_IA = 'credits_ia_mensuel';

/**
 * Actions débitées. La valeur est stockée (`ai_credit_movements.action`, et la
 * contrainte CHECK de la table la recopie) : ne jamais renommer une clé.
 */
export const ACTIONS_CREDITS = [
  'ajustement',
  'projet_structure',
  'projet_composant',
  'import_texte',
  'import_pdf',
  'import_photo_page',
  'import_photo_structuration',
  'redaction_champ',
  'redaction_completion',
] as const;
export type ActionCredits = (typeof ACTIONS_CREDITS)[number];

/** Clé de droit d'accès vérifiée avant tout débit, par action. */
export const DROIT_ACTION: Record<ActionCredits, string> = {
  ajustement: 'ajustement_ia_mensuel',
  projet_structure: 'mode_projet_ia_mensuel',
  projet_composant: 'mode_projet_ia_mensuel',
  import_texte: 'import_ia_mensuel',
  import_pdf: 'import_ia_mensuel',
  import_photo_page: 'import_ia_mensuel',
  import_photo_structuration: 'import_ia_mensuel',
  // JEP-414 : clé à part, pour ouvrir la rédaction indépendamment des autres.
  redaction_champ: 'redaction_ia',
  redaction_completion: 'redaction_ia',
};

/** Libellé lisible d'une action (historique, messages). */
export const LIBELLE_ACTION: Record<ActionCredits, string> = {
  ajustement: 'Ajustement des quantités par IA',
  projet_structure: 'Mode projet : proposition de structure',
  projet_composant: 'Mode projet : proposition d’une préparation',
  import_texte: 'Import d’un texte',
  import_pdf: 'Import d’un PDF',
  import_photo_page: 'Import photo : lecture d’une page',
  import_photo_structuration: 'Import photo : mise en forme de la recette',
  redaction_champ: 'Rédaction d’un texte par IA',
  redaction_completion: 'Rédaction des champs vides par IA',
};

// ── Grille ──────────────────────────────────────────────────

export const COUT_AJUSTEMENT = 1;
export const COUT_PROJET_STRUCTURE = 1;
export const COUT_PROJET_COMPOSANT = 2;
export const COUT_PHOTO_PAGE = 3;
export const COUT_PHOTO_STRUCTURATION = 2;

/**
 * Rédaction des textes d'une recette (JEP-414) : un champ à la demande coûte
 * 1 crédit ; « Compléter avec l'IA » envoie la recette UNE fois pour tous les
 * champs vides, d'où 1 crédit par tranche de 3 champs, 2 au minimum (relevé
 * estimé : ~0,018 $ au p90 pour 15 champs avec Haiku — à remesurer).
 */
export const COUT_REDACTION_CHAMP = 1;
export const CHAMPS_PAR_CREDIT = 3;
export const COUT_COMPLETION_MIN = 2;
/** Étapes traitées par « Compléter avec l'IA » (les suivantes sont ignorées). */
export const ETAPES_MAX_COMPLETION = 12;

/** Crédits de « Compléter avec l'IA » pour `nbChamps` champs vides. */
export function coutCompletion(nbChamps: number): number {
  const n = Number.isFinite(nbChamps) && nbChamps > 0 ? Math.floor(nbChamps) : 0;
  return Math.max(COUT_COMPLETION_MIN, Math.ceil(n / CHAMPS_PAR_CREDIT));
}

/** Plafond de pages d'un import photo, tenu côté serveur (`mc_debiter_credits`). */
export const PAGES_PHOTO_MAX = 8;

/**
 * Tranches d'un import texte ou PDF, en caractères du texte envoyé à l'IA.
 * Mesuré le 11/11/2026 : PDF court (≈ 1 400 caractères) 0,0073 $, entremets
 * de plusieurs pages 0,0325 $ — c'est surtout la recette PRODUITE qui coûte,
 * et elle suit la longueur du texte.
 */
export const TRANCHES_IMPORT: readonly { jusqua: number; credits: number }[] = [
  { jusqua: 8_000, credits: 3 },
  { jusqua: 20_000, credits: 6 },
  { jusqua: Number.POSITIVE_INFINITY, credits: 9 },
];

/** Crédits d'un import texte ou PDF, d'après la longueur du texte. */
export function coutImportTexte(nbCaracteres: number): number {
  const n = Number.isFinite(nbCaracteres) && nbCaracteres > 0 ? nbCaracteres : 0;
  for (const t of TRANCHES_IMPORT) if (n <= t.jusqua) return t.credits;
  return TRANCHES_IMPORT[TRANCHES_IMPORT.length - 1].credits;
}

/** Crédits d'un import photo complet : mise en forme + chaque page lue. */
export function coutImportPhoto(nbPages: number): number {
  const pages = Math.max(0, Math.floor(nbPages));
  return COUT_PHOTO_STRUCTURATION + COUT_PHOTO_PAGE * pages;
}

// ── Affichage du tarif (page des plans) ─────────────────────

/**
 * « 3 à 9 crédits IA », ou « 1 crédit IA » quand il n'y a rien à encadrer. Le
 * « IA » est écrit ici, et non seulement dans le libellé de la ligne « Crédits
 * IA » : dans le tableau, la cellule se lit seule, sans repasser par sa ligne.
 */
function fourchette(min: number, max: number): string {
  return `${min === max ? libelleCredits(min) : `${min} à ${libelleCredits(max)}`} IA`;
}

/** Une ligne du tableau des formules : ce que coûte une action, en crédits. */
export type LigneCout = {
  /** Libellé de la ligne ; `null` = celui de la fonctionnalité de la grille. */
  label: string | null;
  /** Ce qui s'affiche dans la cellule des formules qui y ont droit. */
  texte: string;
  /** Précision en petit sous le chiffre (jamais une infobulle : pas de survol au doigt). */
  precision: string;
};

/**
 * Lignes de coût d'une fonctionnalité d'IA, pour le tableau des formules
 * (JEP-405). Calculées depuis les constantes de la grille ci-dessus — jamais
 * écrites à la main —, pour que ce que la page annonce ne puisse pas s'écarter
 * de ce qui est facturé. `null` : la fonctionnalité n'est pas une fonction d'IA
 * (la page l'affiche alors comme n'importe quelle ligne de la grille).
 *
 * **Fourchette quand un calcul précède l'imputation** : la longueur du texte
 * (import texte, PDF), le nombre de pages (photos) ou la nature de la demande
 * (mode projet).
 */
export function lignesCoutIA(featureKey: string): LigneCout[] | null {
  const maxTranche = TRANCHES_IMPORT[TRANCHES_IMPORT.length - 1].credits;
  switch (featureKey) {
    case 'import_ia_mensuel':
      return [
        {
          label: 'Import par texte collé',
          texte: fourchette(TRANCHES_IMPORT[0].credits, maxTranche),
          precision: 'selon la longueur du texte',
        },
        {
          label: 'Import par PDF',
          texte: fourchette(TRANCHES_IMPORT[0].credits, maxTranche),
          precision: 'selon la longueur du texte du PDF',
        },
        {
          label: 'Import par photos',
          texte: fourchette(coutImportPhoto(1), coutImportPhoto(PAGES_PHOTO_MAX)),
          precision: `${COUT_PHOTO_STRUCTURATION} + ${COUT_PHOTO_PAGE} par page, ${PAGES_PHOTO_MAX} pages au plus`,
        },
      ];
    case 'ajustement_ia_mensuel':
      return [{ label: null, texte: fourchette(COUT_AJUSTEMENT, COUT_AJUSTEMENT), precision: 'par ajustement' }];
    case 'mode_projet_ia_mensuel':
      return [
        {
          label: null,
          texte: fourchette(
            Math.min(COUT_PROJET_STRUCTURE, COUT_PROJET_COMPOSANT),
            Math.max(COUT_PROJET_STRUCTURE, COUT_PROJET_COMPOSANT),
          ),
          precision: `${COUT_PROJET_STRUCTURE} par proposition de structure, ${COUT_PROJET_COMPOSANT} par préparation`,
        },
      ];
    case 'redaction_ia':
      return [
        { label: 'Rédaction d’un texte', texte: fourchette(COUT_REDACTION_CHAMP, COUT_REDACTION_CHAMP), precision: 'description, conseils, conservation…' },
        {
          label: 'Compléter les champs vides',
          texte: `${libelleCredits(COUT_COMPLETION_MIN)} IA et plus`,
          precision: `1 crédit par tranche de ${CHAMPS_PAR_CREDIT} champs, ${COUT_COMPLETION_MIN} au minimum`,
        },
      ];
    default:
      return null;
  }
}

// ── Solde ───────────────────────────────────────────────────

/** Ce que l'interface sait du solde (`mc_check_quota`). `null` = inconnu. */
export type EtatCredits = { limite: number | null; utilises: number | null };

/**
 * Crédits restants, `null` si inconnus (lecture en échec, ou dotation sans
 * plafond) — l'interface laisse alors l'action ouverte : le vrai refus reste
 * porté par la base au moment du débit.
 */
export function creditsRestants(etat: EtatCredits | null | undefined): number | null {
  if (!etat || etat.limite == null || etat.utilises == null) return null;
  return Math.max(0, etat.limite - etat.utilises);
}

/** Le solde connu couvre-t-il ce coût ? Inconnu = oui (cf. ci-dessus). */
export function soldeSuffisant(etat: EtatCredits | null | undefined, cout: number): boolean {
  const restants = creditsRestants(etat);
  return restants == null || restants >= cout;
}

/** Part de la dotation à partir de laquelle le membre est prévenu (alerte unique par période). */
export const SEUIL_ALERTE_POURCENT = 80;

/**
 * Ce débit vient-il de FRANCHIR le seuil d'alerte ? `utilises` est la
 * consommation APRÈS le débit de `credits`. Vrai une seule fois par montée :
 * avant le débit on était sous le seuil, après on l'a atteint. Dotation
 * illimitée ou inconnue : jamais.
 */
export function seuilFranchi(
  utilises: number | null | undefined,
  limite: number | null | undefined,
  credits: number,
  pourcent: number = SEUIL_ALERTE_POURCENT,
): boolean {
  if (utilises == null || limite == null || limite <= 0 || credits <= 0) return false;
  const avant = utilises - credits;
  return avant * 100 < pourcent * limite && utilises * 100 >= pourcent * limite;
}

/** « 1 crédit », « 6 crédits ». */
export function libelleCredits(n: number): string {
  return `${n} crédit${Math.abs(n) > 1 ? 's' : ''}`;
}

/** Groupe d'une action : identifiant v4 fourni par le navigateur, validé. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function groupeValide(v: unknown): string | null {
  return typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null;
}
