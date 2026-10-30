// Modération des membres (JEP-272, lots 1 et 2) — logique pure, sans accès base.
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

import { formatDate, formatDateHeure } from '@/lib/format';

export const STATUT_SUSPENDU = 'suspended';
export const STATUT_DESACTIVE = 'disabled';

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
  // JEP-262 : forçage de la confirmation d'e-mail, tracé dans le même journal.
  confirmation_email: "Confirmation d'e-mail forcée",
  relance_confirmation: 'Relance du mail de confirmation',
  // JEP-33 : suppression du compte par un admin (ligne portée par le profil anonyme).
  anonymisation: 'Anonymisation du compte',
  // JEP-362 : export des données (par l'admin, ou par le membre lui-même si aucun admin n'est nommé).
  export_donnees: 'Export des données',
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

// ── Accès d'un compte bloqué ────────────────────────────────────────────

/**
 * Pages et chemins qu'un membre suspendu ou désactivé peut encore ouvrir
 * (garde du middleware). Il se connecte — plus de bannissement GoTrue — mais
 * n'a accès qu'à son écran de blocage, au formulaire de contact (le recours),
 * aux pages légales et au flux d'authentification (rappel de session,
 * déconnexion). Tout le reste est renvoyé vers `/compte-suspendu`.
 */
const CHEMINS_BLOQUE = ['/compte-suspendu', '/contact', '/auth', '/hors-ligne', '/mentions-legales', '/confidentialite', '/cgu', '/cgv', '/cookies'];

export function cheminOuvertAuCompteBloque(pathname: string): boolean {
  return CHEMINS_BLOQUE.some((p) => pathname === p || pathname.startsWith(`${p}/`));
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

// ── Refus d'écriture d'un compte bloqué ─────────────────────────────────

/** Message montré à un compte bloqué dont une action est refusée (routes API et écrans). */
/**
 * Page de connexion au portail client Stripe (Dashboard → Paramètres →
 * Facturation → Portail client → lien de connexion) : le membre y saisit son
 * e-mail, reçoit un code, et gère son abonnement SANS passer par le site, donc
 * sans être arrêté par le bannissement. Variable publique (inlinée au build)
 * car lue par le formulaire de connexion ; l'URL n'est pas un secret. Absente :
 * aucun lien n'est affiché.
 */
export function urlConnexionPortail(): string | null {
  return process.env.NEXT_PUBLIC_STRIPE_PORTAIL_CONNEXION_URL || null;
}

export const MESSAGE_COMPTE_BLOQUE = 'Votre compte est suspendu ou désactivé : cette action est impossible.';

/**
 * Le message brut d'une erreur d'écriture est-il le refus d'une policy
 * `blocked_user_*` (RLS, `RESTRICTIVE`) ? PostgreSQL nomme la policy dans son
 * message (`new row violates row-level security policy "blocked_user_ins" for
 * table "profiles"`), ce que l'écran ne doit jamais montrer tel quel.
 *
 * Ne voit que les écritures qui échouent avec une erreur (insertion,
 * upsert, `WITH CHECK`). Une modification ou une suppression filtrée par la
 * clause `USING` ne lève rien : la ligne est simplement invisible, zéro ligne
 * touchée.
 */
export function estRefusCompteBloque(messageBrut: string | null | undefined): boolean {
  return /row-level security policy "blocked_user_(ins|upd|del)"/.test(messageBrut ?? '');
}

// ── Abonnement du membre modéré (lot 2) ─────────────────────────────────
//
// Rien n'est automatique : l'admin choisit dans la fenêtre de confirmation,
// et la route revalide ce choix contre l'état réel de l'abonnement. Seul un
// abonnement Stripe (prélèvement réel) offre des gestes ; un essai, un don ou
// un abonnement manuel est seulement mentionné.

export type ActionAbonnement = 'aucune' | 'pause' | 'resilier' | 'reprendre';

export type EtatAbonnement = {
  libelle: string;
  /** `subscriptions.type` (TRIAL, GIFT, PAID…). */
  type: string;
  /** Abonnement prélevé par Stripe (provider `stripe` et identifiant connu). */
  stripe: boolean;
  /** Fin de la période en cours (ISO), si connue. */
  finPeriode: string | null;
  enPause: boolean;
  resiliationProgrammee: boolean;
  /** `echec` : Stripe n'a pas pu être lu, aucun geste n'est alors proposé. */
  lectureStripe: 'ok' | 'echec' | 'sans_objet';
};

export const LIBELLE_ACTION_ABONNEMENT: Record<ActionAbonnement, string> = {
  aucune: 'Ne rien faire',
  pause: 'Mettre en pause les prélèvements',
  resilier: 'Résilier à l’échéance',
  reprendre: 'Reprendre les prélèvements',
};

/** Gestes proposés à l'admin pour cette action et cet abonnement. */
export function actionsAbonnementPossibles(action: ActionModeration, ab: EtatAbonnement | null): ActionAbonnement[] {
  if (!ab || !ab.stripe || ab.lectureStripe !== 'ok') return ['aucune'];
  if (action === 'lever') return ab.enPause ? ['aucune', 'reprendre'] : ['aucune'];
  if (ab.resiliationProgrammee) return ['aucune'];
  return ab.enPause ? ['aucune', 'resilier'] : ['aucune', 'pause', 'resilier'];
}

/**
 * Choix présélectionné. « Ne rien faire » partout, sauf à la levée d'un compte
 * dont les prélèvements sont en pause : la reprise est proposée cochée, mais
 * l'admin la confirme (ou la décoche) dans la fenêtre.
 */
export function actionAbonnementParDefaut(action: ActionModeration, ab: EtatAbonnement | null): ActionAbonnement {
  return actionsAbonnementPossibles(action, ab).includes('reprendre') ? 'reprendre' : 'aucune';
}

export function validerActionAbonnement(
  brut: unknown,
  action: ActionModeration,
  ab: EtatAbonnement | null,
): { ok: true; valeur: ActionAbonnement } | { ok: false; erreur: string } {
  const valeur = brut == null || brut === '' ? 'aucune' : brut;
  if (valeur !== 'aucune' && valeur !== 'pause' && valeur !== 'resilier' && valeur !== 'reprendre') {
    return { ok: false, erreur: 'Action sur l’abonnement inconnue.' };
  }
  if (!actionsAbonnementPossibles(action, ab).includes(valeur)) {
    return { ok: false, erreur: 'Ce geste sur l’abonnement n’est plus possible : rouvrez la fenêtre pour voir son état actuel.' };
  }
  return { ok: true, valeur };
}

/**
 * Une résiliation se notifie toujours au membre : c'est la fin de son
 * contrat, pas une simple information. La case « Prévenir le membre » est
 * alors imposée.
 */
export function emailObligatoire(abonnement: ActionAbonnement): boolean {
  return abonnement === 'resilier';
}

// ── E-mail au membre (lot 2) ────────────────────────────────────────────

export type EmailModeration = {
  evenement: 'compte_suspendu' | 'compte_desactive' | 'compte_retabli';
  sujet: string;
  texte: string;
  /** Résumé d'une ligne pour la cloche. */
  detail: string;
  /** Où mène la cloche. */
  lien: string;
};

function ligneAbonnement(abonnement: ActionAbonnement, finPeriode: string | null): string | null {
  if (abonnement === 'pause') {
    return 'Les prélèvements de votre abonnement sont arrêtés pendant cette période : rien ne vous sera facturé.';
  }
  if (abonnement === 'resilier') {
    return finPeriode
      ? `Votre abonnement est résilié. Il prend fin le ${formatDate(finPeriode)}, sans nouveau prélèvement.`
      : 'Votre abonnement est résilié. Il prend fin à l’échéance de la période en cours, sans nouveau prélèvement.';
  }
  if (abonnement === 'reprendre') return 'Les prélèvements de votre abonnement reprennent normalement.';
  return null;
}

/**
 * Texte de l'e-mail envoyé au membre après une action de modération. Le motif
 * lui est montré tel quel, comme sur l'écran « Compte suspendu » : c'est la
 * décision d'un modérateur, pas une règle de détection à cacher.
 */
export function composerEmailModeration(p: {
  action: ActionModeration;
  motif: string | null;
  jusquAu: string | null;
  abonnement: ActionAbonnement;
  finPeriode: string | null;
  urlSite: string;
  /** Lien de connexion au portail Stripe, à fournir seulement si le membre a un abonnement Stripe. */
  urlPortail?: string | null;
}): EmailModeration {
  const contact = `${p.urlSite}/contact`;
  const abonnement = ligneAbonnement(p.abonnement, p.finPeriode);
  const blocs: string[] = ['Bonjour,'];
  let evenement: EmailModeration['evenement'];
  let sujet: string;
  let detail: string;
  let lien: string;

  if (p.action === 'suspendre') {
    evenement = 'compte_suspendu';
    sujet = 'Votre compte Je pâtisse ! est suspendu';
    detail = p.jusquAu
      ? `Votre compte est suspendu jusqu’au ${formatDateHeure(p.jusquAu)}.`
      : 'Votre compte est suspendu jusqu’à nouvel ordre.';
    lien = '/contact';
    blocs.push(detail.replace('Votre compte', 'Votre compte Je pâtisse !'));
    if (p.motif) blocs.push(`Motif : ${p.motif}`);
    blocs.push('Pendant la suspension, seule la page de votre compte reste accessible (contact, abonnement). Vos recettes et vos données sont conservées.');
  } else if (p.action === 'desactiver') {
    evenement = 'compte_desactive';
    sujet = 'Votre compte Je pâtisse ! est désactivé';
    detail = 'Votre compte a été désactivé.';
    lien = '/contact';
    blocs.push('Votre compte Je pâtisse ! a été désactivé.');
    if (p.motif) blocs.push(`Motif : ${p.motif}`);
    blocs.push(
      'Seule la page de votre compte reste accessible (contact, abonnement), et vos contenus publiés (recettes, avis, idées, profil) ne sont plus visibles. ' +
        'Ils sont conservés et réapparaîtront si votre compte est rétabli.',
    );
  } else {
    evenement = 'compte_retabli';
    sujet = 'Votre compte Je pâtisse ! est rétabli';
    detail = 'Votre compte est rétabli : vous pouvez de nouveau vous connecter.';
    lien = '/';
    blocs.push(`Votre compte Je pâtisse ! est rétabli. Vous pouvez de nouveau vous connecter : ${p.urlSite}/connexion`);
  }

  if (abonnement) blocs.push(abonnement);
  if (p.action !== 'lever' && p.urlPortail) {
    blocs.push(
      `Vous avez un abonnement : vous pouvez gérer votre moyen de paiement et vos factures depuis ce lien Stripe (adresse e-mail de votre compte, code reçu par e-mail) : ${p.urlPortail}`,
    );
  }
  if (p.action !== 'lever') {
    blocs.push(`Pour contester cette décision ou poser une question, écrivez-nous depuis la page Contact : ${contact}`);
  }
  // Signature : posée par le gabarit unique des e-mails (JEP-277).

  return { evenement, sujet, texte: blocs.join('\n\n'), detail, lien };
}
