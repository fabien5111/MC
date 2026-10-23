// Purge des comptes jamais confirmés (JEP-262, lot 4) — logique pure.
//
// Un compte inscrit mais jamais confirmé après N jours est une adresse morte
// ou mal saisie : il occupe l'adresse e-mail (Supabase la refuserait à une
// nouvelle inscription) et gonfle les chiffres. La suppression est
// IRRÉVERSIBLE : tout ici est écrit pour refuser dans le doute.
//
// Une décision par compte, dans cet ordre, la première qui exclut gagne :
//   confirmé → trop récent / date illisible → pas de profil → rôle ou statut
//   particulier → a laissé du contenu.
// Ne reste candidat qu'un compte vieux, jamais confirmé, membre ordinaire et
// actif, sans la moindre trace d'usage.

/** Seuil par défaut, en jours (arbitrage du 23/10/2026). */
export const TTL_DEFAUT_JOURS = 30;
/** Plancher : en dessous, un membre qui confirme avec quelques jours de retard serait purgé. */
export const TTL_MIN_JOURS = 7;
/** Au plus N suppressions par passage : un défaut de lecture ne vide pas la base d'un coup. */
export const PLAFOND_SUPPRESSIONS = 20;

/** `UNCONFIRMED_ACCOUNT_TTL_DAYS` : entier ≥ plancher ; absent ou illisible → défaut. */
export function ttlJours(brut: string | undefined | null): number {
  const n = Number((brut ?? '').trim());
  if (!Number.isInteger(n) || n <= 0) return TTL_DEFAUT_JOURS;
  return Math.max(TTL_MIN_JOURS, n);
}

export type CompteAuth = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  created_at?: string | null;
};

export type ProfilPurge = { id: string; role: string | null; status: string | null };

export type MotifExclusion = 'confirme' | 'recent' | 'date_illisible' | 'sans_profil' | 'role' | 'statut' | 'contenu';

const JOUR_MS = 24 * 60 * 60 * 1000;

/** Âge du compte en jours entiers, ou `null` si la date de création est illisible. */
export function ageEnJours(compte: CompteAuth, maintenant: Date): number | null {
  const t = Date.parse(compte.created_at ?? '');
  if (Number.isNaN(t)) return null;
  return Math.floor((maintenant.getTime() - t) / JOUR_MS);
}

/** Premier filtre, sans aucune lecture en base : confirmation et ancienneté. */
export function premierFiltre(compte: CompteAuth, maintenant: Date, ttl: number): MotifExclusion | null {
  if (compte.email_confirmed_at) return 'confirme';
  const age = ageEnJours(compte, maintenant);
  if (age === null) return 'date_illisible';
  if (age < ttl) return 'recent';
  return null;
}

/** Second filtre, d'après le profil : jamais un admin, un gestionnaire, ni un compte modéré. */
export function filtreProfil(profil: ProfilPurge | undefined): MotifExclusion | null {
  if (!profil) return 'sans_profil';
  if (profil.role && profil.role !== 'member') return 'role';
  if (profil.status && profil.status !== 'active') return 'statut';
  return null;
}

/** « t***@proton.me » : le rapport part dans des journaux, pas besoin de l'adresse entière. */
export function masquerEmail(email: string | null | undefined): string {
  if (!email) return '(sans adresse)';
  const arobase = email.lastIndexOf('@');
  if (arobase < 1) return '***';
  return `${email[0]}***${email.slice(arobase)}`;
}

/** Identifiant abrégé pour les journaux (8 premiers caractères). */
export function idAbrege(id: string): string {
  return id.slice(0, 8);
}

export type Candidat = { id: string; email: string; creeLe: string; ageJours: number };

export type RapportPurge = {
  mode: 'rapport' | 'suppression';
  ttlJours: number;
  examines: number;
  exclus: Partial<Record<MotifExclusion, number>>;
  candidats: Candidat[];
  /** Vrai si le plafond a limité les suppressions de ce passage. */
  plafonne: boolean;
  supprimes: number;
  echecs: { id: string; erreur: string }[];
};
