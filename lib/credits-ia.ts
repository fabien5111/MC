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
};

// ── Grille ──────────────────────────────────────────────────

export const COUT_AJUSTEMENT = 1;
export const COUT_PROJET_STRUCTURE = 1;
export const COUT_PROJET_COMPOSANT = 2;
export const COUT_PHOTO_PAGE = 3;
export const COUT_PHOTO_STRUCTURATION = 2;

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

/** « 1 crédit », « 6 crédits ». */
export function libelleCredits(n: number): string {
  return `${n} crédit${Math.abs(n) > 1 ? 's' : ''}`;
}

/** Groupe d'une action : identifiant v4 fourni par le navigateur, validé. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function groupeValide(v: unknown): string | null {
  return typeof v === 'string' && UUID.test(v) ? v.toLowerCase() : null;
}
