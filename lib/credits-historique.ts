// Historique des crédits IA (JEP-405) — logique pure, sans accès base.
//
// Le journal (`ai_credit_movements`) compte UNE ligne par débit : un import
// photo de 3 pages en écrit quatre (trois pages + la mise en forme), rattachées
// par leur `groupe`. Le membre, lui, a fait UNE action : on regroupe donc par
// groupe, puis par période de dotation.
//
// **Période = celle de la jauge** (`periode_debut`, posée au débit) : le total
// d'une période égale ainsi exactement ce que « Mon forfait » annonce comme
// consommé, sans décalage de calendrier.
import { LIBELLE_ACTION, type ActionCredits } from '@/lib/credits-ia';

/** Une ligne du journal, telle que la base la rend. */
export type MouvementCredit = {
  id: number;
  created_at: string;
  periode_debut: string | null;
  action: string;
  credits: number;
  statut: 'debite' | 'rendu' | string;
  groupe: string;
  ref_table: string | null;
  ref_id: string | null;
};

/** Ce que le membre a fait : une action, ses crédits, son issue. */
export type OperationCredits = {
  groupe: string;
  /** Instant de la première ligne du groupe. */
  date: string;
  libelle: string;
  /** Crédits réellement consommés (lignes non rendues). */
  credits: number;
  /** Crédits rendus (appel IA en échec). */
  rendus: number;
  /** `partiel` : une partie du groupe a été rendue (ex. une page illisible). */
  statut: 'debite' | 'rendu' | 'partiel';
  /** Période de dotation (début), clé de regroupement. */
  periode: string;
  ref: { table: string; id: string } | null;
};

export type PeriodeCredits = {
  /** Début de période (ISO). */
  debut: string;
  /** Crédits consommés sur la période = la jauge de « Mon forfait ». */
  total: number;
  operations: OperationCredits[];
};

const libelleAction = (a: string): string => LIBELLE_ACTION[a as ActionCredits] ?? 'Action IA';

/** Premier jour du mois (UTC) d'une date ISO — repli quand `periode_debut` manque. */
function debutDeMois(iso: string): string {
  const d = new Date(iso);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** « Import photo, 3 pages » pour un groupe de lectures, sinon le libellé de l'action. */
export function libelleOperation(lignes: MouvementCredit[]): string {
  const pages = lignes.filter((l) => l.action === 'import_photo_page').length;
  if (pages > 0) {
    const termine = lignes.some((l) => l.action === 'import_photo_structuration');
    return `Import photo, ${pages} page${pages > 1 ? 's' : ''}${termine ? '' : ' (non terminé)'}`;
  }
  return libelleAction(lignes[0]?.action ?? '');
}

/** Regroupe les lignes du journal en opérations, la plus récente d'abord. */
export function regrouperOperations(lignes: MouvementCredit[]): OperationCredits[] {
  const parGroupe = new Map<string, MouvementCredit[]>();
  for (const l of lignes) {
    const g = parGroupe.get(l.groupe);
    if (g) g.push(l);
    else parGroupe.set(l.groupe, [l]);
  }

  const operations: OperationCredits[] = [];
  for (const [groupe, rows] of parGroupe) {
    rows.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    const consommes = rows.filter((r) => r.statut !== 'rendu');
    const rendus = rows.filter((r) => r.statut === 'rendu');
    const avecRef = rows.find((r) => r.ref_table && r.ref_id);
    operations.push({
      groupe,
      date: rows[0].created_at,
      libelle: libelleOperation(rows),
      credits: consommes.reduce((s, r) => s + r.credits, 0),
      rendus: rendus.reduce((s, r) => s + r.credits, 0),
      statut: rendus.length === 0 ? 'debite' : consommes.length === 0 ? 'rendu' : 'partiel',
      periode: rows[0].periode_debut ?? debutDeMois(rows[0].created_at),
      ref: avecRef ? { table: avecRef.ref_table as string, id: avecRef.ref_id as string } : null,
    });
  }
  return operations.sort((a, b) => b.date.localeCompare(a.date));
}

/** Opérations rangées par période de dotation, la plus récente d'abord. */
export function parPeriode(operations: OperationCredits[]): PeriodeCredits[] {
  const periodes = new Map<string, OperationCredits[]>();
  for (const o of operations) {
    const p = periodes.get(o.periode);
    if (p) p.push(o);
    else periodes.set(o.periode, [o]);
  }
  return [...periodes.entries()]
    .map(([debut, ops]) => ({
      debut,
      total: ops.reduce((s, o) => s + o.credits, 0),
      operations: ops.sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => b.debut.localeCompare(a.debut));
}

/** « 21 octobre 2026 » — date de début d'une période. */
export function libelleDebutPeriode(debut: string): string {
  return new Date(debut).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Zurich',
  });
}

/** Chemin vers l'objet produit, seulement s'il existe encore (`existants` : ids d'imports lisibles). */
export function lienOperation(op: OperationCredits, existants: ReadonlySet<string>): string | null {
  return op.ref?.table === 'imports' && existants.has(op.ref.id) ? `/relecture/${op.ref.id}` : null;
}
