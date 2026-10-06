// Modération des membres (JEP-272, lot 1) — logique pure, sans accès base.
//
// Importable par les Client Components (fiche membre du back-office) comme
// par le serveur : la lecture en base vit dans `lib/moderation-data.ts`, même
// séparation que `pseudo.ts` / `pseudo-data.ts`.
//
// **`profiles` fait foi** (arbitrage du 06/10/2026) : c'est `profiles.status`
// qui décide si un compte est bloqué, jamais `allowlist.status`, qui ne sert
// plus qu'aux invitations.
//
// Deux états bloquants, portés par `profiles.status` :
// - `suspended` — sanction, avec une date de fin facultative
//   (`suspended_until`, vide = sans limite) et un motif ;
// - `disabled` — compte fermé, réversible à la main seulement.
//
// Pourquoi un statut `suspended` plutôt que la seule date de fin : `status`
// est déjà lu à chaque page par `getProfile()` (`PROFILE_COLUMNS`). La garde
// de `requireUser()` ne coûte donc AUCUNE requête pour l'immense majorité des
// membres ; seul un compte marqué paie la lecture de son motif et de sa date.
//
// **Levée automatique** : une suspension dont la date de fin est passée n'est
// plus bloquante, sans qu'aucun cron ait à réécrire la ligne — le calcul est
// fait à la lecture, ici et dans la fonction SQL `public.is_blocked_user()`,
// qui doit rester alignée. Le bannissement GoTrue, posé pour la même durée,
// expire de lui-même.

export const STATUT_SUSPENDU = 'suspended';
export const STATUT_DESACTIVE = 'disabled';

/** Durée d'un bannissement GoTrue « sans limite » : cent ans. */
export const BAN_SANS_LIMITE = '876000h';

export const MOTIF_MAX_LENGTH = 1000;

export type EtatModeration =
  | { etat: 'actif' }
  | { etat: 'suspendu'; motif: string | null; jusquAu: string | null }
  | { etat: 'desactive'; motif: string | null };

export type LigneModeration = {
  status?: string | null;
  suspended_until?: string | null;
  suspension_reason?: string | null;
  disabled_reason?: string | null;
};

/** Le statut seul suffit-il à dire que le compte est (peut-être) bloqué ? */
export function statutPeutBloquer(status: string | null | undefined): boolean {
  return status === STATUT_SUSPENDU || status === STATUT_DESACTIVE;
}

/**
 * État effectif d'un compte. Une suspension échue vaut « actif » : c'est la
 * levée automatique. Une date illisible est traitée comme « sans limite »
 * (le plus prudent).
 */
export function etatModeration(ligne: LigneModeration | null | undefined, maintenant: Date = new Date()): EtatModeration {
  if (!ligne) return { etat: 'actif' };
  if (ligne.status === STATUT_DESACTIVE) {
    return { etat: 'desactive', motif: ligne.disabled_reason ?? null };
  }
  if (ligne.status === STATUT_SUSPENDU) {
    const fin = ligne.suspended_until ? new Date(ligne.suspended_until) : null;
    if (fin && !Number.isNaN(fin.getTime()) && fin.getTime() <= maintenant.getTime()) return { etat: 'actif' };
    return { etat: 'suspendu', motif: ligne.suspension_reason ?? null, jusquAu: ligne.suspended_until ?? null };
  }
  return { etat: 'actif' };
}

export function estBloque(e: EtatModeration): boolean {
  return e.etat !== 'actif';
}

/**
 * Statut affiché dans la liste des membres du back-office : `profiles.status`,
 * sauf une suspension échue, qui redevient « actif ».
 */
export function statutAffiche(ligne: LigneModeration, maintenant: Date = new Date()): string {
  const e = etatModeration(ligne, maintenant);
  if (e.etat === 'suspendu') return STATUT_SUSPENDU;
  if (e.etat === 'desactive') return STATUT_DESACTIVE;
  return ligne.status === STATUT_SUSPENDU ? 'active' : ligne.status || 'active';
}

// ── Actions de modération ───────────────────────────────────────────────

export type ActionModeration = 'suspendre' | 'desactiver' | 'lever';

/** Valeur stockée dans `member_moderation_events.action`. */
export const ACTION_JOURNAL: Record<ActionModeration, 'suspension' | 'desactivation' | 'levee'> = {
  suspendre: 'suspension',
  desactiver: 'desactivation',
  lever: 'levee',
};

export const LIBELLE_ACTION_JOURNAL: Record<string, string> = {
  suspension: 'Suspension',
  desactivation: 'Désactivation',
  levee: 'Levée',
};

export type DemandeModeration = {
  action: ActionModeration;
  motif: string | null;
  /** Fin de suspension (ISO), `null` = sans limite. Ignorée hors suspension. */
  jusquAu: string | null;
};

export type ContexteModeration = {
  /** Id de l'admin qui agit. */
  acteurId: string;
  /** Id du membre visé. */
  cibleId: string;
  /** `profiles.role` du membre visé. */
  cibleRole: string | null;
  /** État actuel du membre visé. */
  etatActuel: EtatModeration;
};

export type VerdictModeration = { ok: true; demande: DemandeModeration } | { ok: false; erreur: string };

/**
 * Valide une demande de modération venue du navigateur, et applique les
 * garde-fous du ticket. Pure : la route la rejoue côté serveur, la fiche
 * peut s'en servir pour griser ses boutons.
 *
 * - Impossible d'agir sur soi-même, ni de suspendre/désactiver un admin
 *   (un gestionnaire, lui, peut l'être — arbitrage du 06/10/2026).
 * - Un seul état bloquant à la fois, le plus fort l'emporte : on ne suspend
 *   pas un compte désactivé (la désactivation n'a pas de fin, une suspension
 *   l'adoucirait en douce) ; désactiver un compte suspendu remplace la
 *   suspension.
 */
export function validerDemandeModeration(
  brut: { action?: unknown; motif?: unknown; jusquAu?: unknown },
  ctx: ContexteModeration,
  maintenant: Date = new Date(),
): VerdictModeration {
  const action = brut.action;
  if (action !== 'suspendre' && action !== 'desactiver' && action !== 'lever') {
    return { ok: false, erreur: 'Action de modération inconnue.' };
  }
  if (ctx.cibleId === ctx.acteurId) {
    return { ok: false, erreur: 'Vous ne pouvez pas modérer votre propre compte.' };
  }
  const motif = typeof brut.motif === 'string' ? brut.motif.trim().slice(0, MOTIF_MAX_LENGTH) : '';

  if (action === 'lever') {
    if (!estBloque(ctx.etatActuel)) return { ok: false, erreur: "Ce compte n'est ni suspendu ni désactivé." };
    return { ok: true, demande: { action, motif: motif || null, jusquAu: null } };
  }

  if (ctx.cibleRole === 'admin') {
    return { ok: false, erreur: 'Un administrateur ne peut être ni suspendu ni désactivé.' };
  }

  if (action === 'suspendre') {
    if (!motif) return { ok: false, erreur: 'Le motif de la suspension est obligatoire.' };
    if (ctx.etatActuel.etat === 'desactive') {
      return { ok: false, erreur: 'Ce compte est désactivé : levez d’abord la désactivation.' };
    }
    let jusquAu: string | null = null;
    if (brut.jusquAu != null && brut.jusquAu !== '') {
      const fin = typeof brut.jusquAu === 'string' ? new Date(brut.jusquAu) : null;
      if (!fin || Number.isNaN(fin.getTime())) return { ok: false, erreur: 'Date de fin illisible.' };
      if (fin.getTime() <= maintenant.getTime()) return { ok: false, erreur: 'La date de fin doit être dans le futur.' };
      jusquAu = fin.toISOString();
    }
    return { ok: true, demande: { action, motif, jusquAu } };
  }

  // désactiver
  if (ctx.etatActuel.etat === 'desactive') return { ok: false, erreur: 'Ce compte est déjà désactivé.' };
  return { ok: true, demande: { action, motif: motif || null, jusquAu: null } };
}

/**
 * Durée du bannissement GoTrue (`ban_duration`) correspondant à la demande.
 * Arrondie à l'heure supérieure : la garde applicative et la RLS, elles,
 * lèvent la suspension à la minute près — l'heure de bannissement en trop
 * ne retarde que la reconnexion, d'au plus une heure.
 */
export function dureeBannissement(demande: DemandeModeration, maintenant: Date = new Date()): string {
  if (demande.action === 'lever') return 'none';
  if (demande.action === 'suspendre' && demande.jusquAu) {
    const heures = Math.ceil((new Date(demande.jusquAu).getTime() - maintenant.getTime()) / 3_600_000);
    return `${Math.max(1, heures)}h`;
  }
  return BAN_SANS_LIMITE;
}

/** Colonnes de `profiles` écrites par une action de modération. */
export function colonnesProfil(demande: DemandeModeration): {
  status: string;
  suspended_until: string | null;
  suspension_reason: string | null;
  disabled_reason: string | null;
} {
  if (demande.action === 'suspendre') {
    return { status: STATUT_SUSPENDU, suspended_until: demande.jusquAu, suspension_reason: demande.motif, disabled_reason: null };
  }
  if (demande.action === 'desactiver') {
    return { status: STATUT_DESACTIVE, suspended_until: null, suspension_reason: null, disabled_reason: demande.motif };
  }
  return { status: 'active', suspended_until: null, suspension_reason: null, disabled_reason: null };
}
