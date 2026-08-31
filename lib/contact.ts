// Formulaire de contact — logique PURE (aucun accès réseau ni base), partagée
// par le formulaire public (Client Component), les routes serveur et l'écran
// d'administration. Motif `pseudo.ts` / `ideas.ts` : le data-fetching vit à
// part, dans `lib/contact-data.ts`.
//
// Cette séparation n'est pas cosmétique : le formulaire est un Client
// Component ; s'il importait le module de données, il tirerait `next/headers`
// via `lib/supabase/server` et casserait le build.
//
// Décisions de conception et écarts assumés vis-à-vis de la spécification :
// `docs/contact-jira.md`.
import { formatDateHeure } from '@/lib/format';

// ─────────────────────────────────────────────────────────────────────────
// Types de demande
// ─────────────────────────────────────────────────────────────────────────

// `ticketJira` : seul `bug` alimente le suivi d'anomalies. `donnees-personnelles`
// ne doit JAMAIS y aller (RGPD, §11 du document de conception) — une demande
// d'effacement n'a rien à faire dans un outil hébergé chez un tiers.
// `conservationMois` documente ici la durée appliquée par la purge SQL ; la
// purge reste écrite en SQL, cette valeur ne fait que la rendre lisible côté
// application.
export const CONTACT_TYPES = {
  bug: {
    label: 'Signaler un problème',
    labelCourt: 'Bug',
    badgeClass: 'bg-error-container text-on-error-container',
    ticketJira: true,
    prioritaire: false,
    conservationMois: 24,
  },
  suggestion: {
    label: 'Suggestion',
    labelCourt: 'Suggestion',
    badgeClass: 'bg-secondary-container text-on-secondary-container',
    ticketJira: false,
    prioritaire: false,
    conservationMois: 12,
  },
  question: {
    label: 'Question',
    labelCourt: 'Question',
    badgeClass: 'bg-primary-fixed text-on-primary-fixed',
    ticketJira: false,
    prioritaire: false,
    conservationMois: 12,
  },
  'donnees-personnelles': {
    label: 'Mes données personnelles',
    labelCourt: 'Données personnelles',
    badgeClass: 'bg-tertiary-container text-on-tertiary-container',
    ticketJira: false,
    // Délai de réponse légal d'un mois : la notification à l'administrateur
    // part avec une mention prioritaire.
    prioritaire: true,
    conservationMois: 12,
  },
} as const satisfies Record<
  string,
  {
    label: string;
    labelCourt: string;
    badgeClass: string;
    ticketJira: boolean;
    prioritaire: boolean;
    conservationMois: number;
  }
>;

export type ContactType = keyof typeof CONTACT_TYPES;

export const CONTACT_TYPE_KEYS = Object.keys(CONTACT_TYPES) as ContactType[];

export function isContactType(v: unknown): v is ContactType {
  return typeof v === 'string' && v in CONTACT_TYPES;
}

// ─────────────────────────────────────────────────────────────────────────
// Statuts de la demande
// ─────────────────────────────────────────────────────────────────────────

// Quatre statuts, dont la distinction `a_deployer` / `termine` est la raison
// d'être du dispositif : un correctif développé n'est pas un correctif en
// ligne, et le membre ne doit être prévenu que du second.
export const CONTACT_STATUSES = {
  recu: { label: 'Reçu', badgeClass: 'bg-primary-fixed text-on-primary-fixed' },
  en_cours: { label: 'En cours de traitement', badgeClass: 'bg-secondary-container text-on-secondary-container' },
  a_deployer: { label: 'À déployer', badgeClass: 'bg-tertiary-container text-on-tertiary-container' },
  termine: { label: 'Terminé', badgeClass: 'bg-primary text-on-primary' },
} as const satisfies Record<string, { label: string; badgeClass: string }>;

export type ContactStatus = keyof typeof CONTACT_STATUSES;

export const CONTACT_STATUS_KEYS = Object.keys(CONTACT_STATUSES) as ContactStatus[];

export function isContactStatus(v: unknown): v is ContactStatus {
  return typeof v === 'string' && v in CONTACT_STATUSES;
}

export type JiraSyncStatus = 'not_applicable' | 'pending' | 'sent' | 'failed';

// Ni `scheduled` ni `cancelled` : l'e-mail de déploiement part immédiatement
// (cf. `docs/contact-jira.md` §2.2). `sent` et `skipped` sont terminaux ;
// `failed` ne se rejoue que sur action explicite de l'administrateur.
export type EmailStatus = 'pending' | 'sent' | 'failed' | 'skipped';

// Origine d'un changement de statut, écrite dans `contact_status_history`.
export type SourceStatut = 'admin' | 'jira-webhook' | 'jira-sync';

// `closed_at` marque la clôture et sert de point de départ à la purge. Un
// retour en arrière l'efface : une demande rouverte n'est plus close, son
// compte à rebours de conservation redémarre à zéro le jour où elle se
// referme. Centralisé ici pour que les trois écrivains (formulaire, admin,
// synchronisation Jira) ne puissent pas en diverger.
export function dateClotureApres(statut: ContactStatus, maintenantIso: string): string | null {
  return statut === 'termine' ? maintenantIso : null;
}

// Une mise à jour venue de Jira ne rétrograde jamais une demande close À LA
// MAIN : l'administrateur a tranché en connaissance de cause, un ticket qui
// repart en arrière dans le workflow ne doit pas défaire sa décision.
export function jiraPeutEcraser(statutActuel: ContactStatus, sourceActuelle: string | null): boolean {
  return !(statutActuel === 'termine' && sourceActuelle === 'admin');
}

// ─────────────────────────────────────────────────────────────────────────
// Référence de la demande
// ─────────────────────────────────────────────────────────────────────────

// Alphabet sans I, O, 0 ni 1 : la référence est lue à voix haute et recopiée
// à la main (objet d'e-mail, ticket Jira, recherche dans le back-office).
// 32 caractères exactement, ce qui permet de tirer chaque position avec un
// masque de 5 bits — sans le biais qu'introduirait un modulo sur 256.
const ALPHABET_REFERENCE = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const REFERENCE_LONGUEUR = 6;

const RE_REFERENCE = new RegExp(`^REF-[${ALPHABET_REFERENCE}]{${REFERENCE_LONGUEUR}}$`);

// 32^6 ≈ 1,07 milliard de combinaisons. L'unicité reste garantie par l'index
// unique en base, jamais par cette fonction : en cas de collision, la route
// retire un nouveau tirage.
export function genererReference(): string {
  const octets = new Uint8Array(REFERENCE_LONGUEUR);
  crypto.getRandomValues(octets);
  let suffixe = '';
  for (const octet of octets) suffixe += ALPHABET_REFERENCE[octet & 31];
  return `REF-${suffixe}`;
}

export function estReference(v: unknown): boolean {
  return typeof v === 'string' && RE_REFERENCE.test(v);
}

// ─────────────────────────────────────────────────────────────────────────
// Contexte technique — origine et version
// ─────────────────────────────────────────────────────────────────────────

// N'accepte qu'un CHEMIN interne (`/recette/tarte-au-citron`), jamais une URL
// complète : le champ n'est affiché qu'en texte dans le back-office et le
// ticket Jira, mais accepter un `http://` externe permettrait d'y faire
// figurer une adresse trompeuse sans qu'aucun code n'ait besoin d'y cliquer
// pour que ce soit gênant à lire.
export function cheminOrigineValide(v: unknown): string | null {
  if (typeof v !== 'string' || !v.startsWith('/') || v.startsWith('//')) return null;
  return v.slice(0, 2048);
}

// ─────────────────────────────────────────────────────────────────────────
// Photos jointes — restent dans Supabase, ne partent JAMAIS vers Jira
// ─────────────────────────────────────────────────────────────────────────

// Une capture d'écran peut montrer un pseudo, un e-mail affiché à l'écran, le
// nom d'un autre membre — l'inverse exact de ce que le ticket Jira garantit
// (docs/contact-jira.md). Les photos restent donc uniquement dans
// `contact_message_photos`, visibles dans le back-office ; Jira ne reçoit
// qu'une mention de leur présence et un lien vers cet écran
// (`ContexteTicket.photoAdminUrl`, `corpsTicketJira`).
export const CONTACT_PHOTOS_MAX = 3;

// Une compression côté client (`resizeImageToDataUrl`, ~1400 px de large)
// tient largement en dessous de ce plafond ; il n'existe que pour écarter une
// entrée aberrante (photo non compressée, appel direct de la route) avant
// qu'elle ne pèse sur le corps de la requête serverless (~4,5 Mo au total,
// plusieurs photos comprises — cf. `/api/transcribe-photo`).
export const CONTACT_PHOTO_DATA_URL_MAX = 2_000_000;

/**
 * Ne rejette jamais la demande pour une photo invalide : une entrée qui
 * n'est pas une data-URL d'image, ou trop lourde, est silencieusement
 * écartée plutôt que de faire échouer tout l'envoi — une photo ratée ne
 * doit jamais faire perdre le message qui l'accompagne.
 */
export function validerPhotos(saisie: unknown): string[] {
  if (!Array.isArray(saisie)) return [];
  return saisie
    .filter((v): v is string => typeof v === 'string' && v.startsWith('data:image/') && v.length <= CONTACT_PHOTO_DATA_URL_MAX)
    .slice(0, CONTACT_PHOTOS_MAX);
}

// ─────────────────────────────────────────────────────────────────────────
// Validation de la saisie
// ─────────────────────────────────────────────────────────────────────────

export const SUJET_MIN = 5;
export const SUJET_MAX = 120;
export const MESSAGE_MIN = 20;
export const MESSAGE_MAX = 4000;
export const EMAIL_MAX = 254;

export type SaisieDemande = {
  type?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
};

export type ChampDemande = 'type' | 'email' | 'subject' | 'message';

export type DemandeValide = {
  type: ContactType;
  // `null` pour un membre connecté : la route reprend l'adresse du profil,
  // jamais celle envoyée par le navigateur — elle serait falsifiable.
  email: string | null;
  subject: string;
  message: string;
};

export type ValidationDemande =
  | { ok: true; data: DemandeValide }
  | { ok: false; errors: Partial<Record<ChampDemande, string>> };

// Contrôle volontairement permissif : il écarte ce qui n'est manifestement
// pas une adresse, sans prétendre valider la RFC 5322 (impossible en pratique,
// et un faux refus coûte une demande perdue). La vérité, c'est l'e-mail qui
// part ou ne part pas.
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function texte(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Valide les quatre champs saisis. `estConnecte` conditionne le seul champ
 * dont l'obligation varie : un membre connecté n'a pas à ressaisir son
 * adresse, elle est reprise du profil côté serveur.
 *
 * Les contrôles client ne prouvent rien (`/api/contact` est appelable à la
 * main) : cette fonction est appelée des DEUX côtés, et c'est l'appel serveur
 * qui fait foi. Même doctrine que la vérification de pseudo.
 */
export function validerDemande(saisie: SaisieDemande, estConnecte: boolean): ValidationDemande {
  const errors: Partial<Record<ChampDemande, string>> = {};

  const type = saisie.type;
  if (!isContactType(type)) errors.type = 'Choisissez le type de votre demande.';

  const email = texte(saisie.email).slice(0, EMAIL_MAX);
  if (!estConnecte) {
    if (!email) errors.email = 'Indiquez votre adresse e-mail, sans quoi nous ne pourrons pas vous répondre.';
    else if (!RE_EMAIL.test(email)) errors.email = "Cette adresse e-mail ne semble pas valide.";
  }

  const subject = texte(saisie.subject);
  if (subject.length < SUJET_MIN) errors.subject = `Le sujet doit contenir au moins ${SUJET_MIN} caractères.`;
  else if (subject.length > SUJET_MAX) errors.subject = `Le sujet ne peut pas dépasser ${SUJET_MAX} caractères.`;

  const message = texte(saisie.message);
  if (message.length < MESSAGE_MIN) errors.message = `Votre message doit contenir au moins ${MESSAGE_MIN} caractères.`;
  else if (message.length > MESSAGE_MAX) errors.message = `Votre message ne peut pas dépasser ${MESSAGE_MAX} caractères.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: { type: type as ContactType, email: estConnecte ? null : email, subject, message },
  };
}

// Ordre d'affichage des erreurs — le focus se pose sur le PREMIER champ en
// erreur dans l'ordre du formulaire, pas dans l'ordre de l'objet renvoyé
// (dont l'itération suivrait l'ordre d'insertion, un détail d'implémentation).
export const ORDRE_CHAMPS: ChampDemande[] = ['type', 'email', 'subject', 'message'];

export function premierChampEnErreur(
  errors: Partial<Record<ChampDemande, string>>,
): ChampDemande | null {
  return ORDRE_CHAMPS.find((champ) => errors[champ]) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Anti-spam
// ─────────────────────────────────────────────────────────────────────────

// Pas de reCAPTCHA : un service publicitaire tiers réintroduirait une
// obligation de consentement. Trois couches, dont deux n'écrivent rien.

// Champ `website`, masqué par positionnement hors écran (jamais
// `display:none` seul, qu'un robot un peu sérieux détecte). Rempli → réponse
// 200 silencieuse, aucune ligne écrite : rien ne doit apprendre au robot
// qu'il a été repéré.
export function estPiegeRempli(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0;
}

export const DELAI_MINIMUM_MS = 3_000;

// Au-delà, l'horodatage d'ouverture est considéré comme périmé : un jeton
// signé récolté une fois pourrait sinon être rejoué indéfiniment.
export const DELAI_MAXIMUM_MS = 24 * 60 * 60_000;

// Trois issues qui appellent trois comportements DIFFÉRENTS côté route, d'où
// leur distinction plutôt qu'un simple booléen :
//  - `premature` et `invalide` sont des signatures de robot (spec §5.5.2) →
//    200 silencieux, sans écrire de ligne ;
//  - `expire` est un cas humain plausible (onglet resté ouvert plus de 24 h) →
//    mérite un message franc invitant à recharger, pas un silence qui ferait
//    croire à un envoi réussi.
export type VerdictDelai = 'ok' | 'premature' | 'expire' | 'invalide';

/**
 * L'horodatage d'ouverture est émis ET signé par le rendu serveur du
 * formulaire, jamais lu de l'horloge du navigateur : sans signature, la
 * couche se contourne en une ligne de console et ne vaut rien (signature et
 * vérification : `lib/contact-data.ts`, qui seul a accès au secret).
 *
 * Un horodatage dans le futur est traité comme une falsification, pas comme
 * une dérive d'horloge — la valeur vient du serveur, les deux bornes sont
 * lues sur la même horloge.
 */
export function verdictDelaiOuverture(ouvertureMs: number | null, maintenantMs: number): VerdictDelai {
  if (ouvertureMs === null) return 'invalide';
  const ecart = maintenantMs - ouvertureMs;
  if (ecart < 0) return 'invalide';
  if (ecart < DELAI_MINIMUM_MS) return 'premature';
  if (ecart > DELAI_MAXIMUM_MS) return 'expire';
  return 'ok';
}

export function delaiSuffisant(ouvertureMs: number, maintenantMs: number): boolean {
  return verdictDelaiOuverture(ouvertureMs, maintenantMs) === 'ok';
}

// Comptés EN BASE sur `contact_messages`, pas en mémoire du processus comme
// `/api/pseudo/verifier` : chaque instance serverless a sa propre mémoire, et
// cette route-ci écrit avec la clé service_role. Un compteur qu'on contourne
// en tombant sur une autre instance ne protège pas assez ça.
export const DEBIT_IP = { max: 3, fenetreMinutes: 10 } as const;
export const DEBIT_MEMBRE = { max: 5, fenetreMinutes: 24 * 60 } as const;

// ─────────────────────────────────────────────────────────────────────────
// Réduction du contexte navigateur
// ─────────────────────────────────────────────────────────────────────────

// Le user-agent brut n'est JAMAIS stocké ni transmis : on n'en garde que
// navigateur, version majeure, système et type d'appareil.
export const CONTEXTE_INCONNU = 'Contexte inconnu';

const NAVIGATEUR_INCONNU = 'Navigateur inconnu';
const SYSTEME_INCONNU = 'Système inconnu';

// Ordre significatif : du plus spécifique au plus générique. Chrome, Edge,
// Opera et Samsung Internet annoncent tous « Chrome/ » ; Safari n'est reconnu
// qu'après avoir écarté tout ce qui s'en réclame sur iOS.
const NAVIGATEURS: readonly { nom: string; re: RegExp }[] = [
  { nom: 'Edge', re: /Edg(?:e|A|iOS)?\/(\d+)/ },
  { nom: 'Opera', re: /(?:OPR|Opera)\/(\d+)/ },
  { nom: 'Samsung Internet', re: /SamsungBrowser\/(\d+)/ },
  { nom: 'Chrome', re: /CriOS\/(\d+)/ },
  { nom: 'Firefox', re: /FxiOS\/(\d+)/ },
  { nom: 'Firefox', re: /Firefox\/(\d+)/ },
  { nom: 'Chrome', re: /Chrome\/(\d+)/ },
  { nom: 'Safari', re: /Version\/(\d+)[.\d]*\s+(?:Mobile\/\S+\s+)?Safari/ },
];

const SYSTEMES: readonly { nom: string; re: RegExp }[] = [
  { nom: 'Android', re: /Android/ },
  { nom: 'iOS', re: /iPhone|iPad|iPod/ },
  { nom: 'Windows', re: /Windows NT/ },
  { nom: 'macOS', re: /Mac OS X/ },
  { nom: 'ChromeOS', re: /CrOS/ },
  { nom: 'Linux', re: /Linux/ },
];

function typeAppareil(ua: string): string {
  if (/iPad|Tablet/i.test(ua)) return 'tablette';
  if (/Mobi|iPhone|iPod/i.test(ua)) return 'mobile';
  // Android sans « Mobile » désigne une tablette, par convention Google.
  if (/Android/.test(ua)) return 'tablette';
  return 'ordinateur';
}

/**
 * « Mozilla/5.0 (Linux; Android 14…) Chrome/128.0.0.0 Mobile Safari/537.36 »
 *   → « Chrome 128 / Android / mobile »
 *
 * **Invariant :** la valeur renvoyée est composée EXCLUSIVEMENT de constantes
 * de ce module et de chiffres. Quand rien n'est reconnu, on renvoie une
 * constante — jamais un fragment de la chaîne d'origine. C'est ce qui garantit
 * qu'aucun user-agent brut ne peut fuir en base ni dans un ticket Jira, quel
 * que soit ce que le navigateur a envoyé.
 */
export function reduireUserAgent(ua: string | null | undefined): string {
  if (typeof ua !== 'string' || ua.trim() === '') return CONTEXTE_INCONNU;

  let navigateur = NAVIGATEUR_INCONNU;
  for (const { nom, re } of NAVIGATEURS) {
    const m = re.exec(ua);
    if (m) {
      navigateur = `${nom} ${m[1].slice(0, 4)}`;
      break;
    }
  }

  const systeme = SYSTEMES.find(({ re }) => re.test(ua))?.nom ?? SYSTEME_INCONNU;

  return `${navigateur} / ${systeme} / ${typeAppareil(ua)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Contenu du ticket Jira — pseudonymisé
// ─────────────────────────────────────────────────────────────────────────

export const JIRA_SUMMARY_MAX = 255;

const PREFIXE_RESUME = '[Signalement] ';

export function tronquer(texteSource: string, max: number): string {
  if (texteSource.length <= max) return texteSource;
  return `${texteSource.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function resumeTicketJira(sujet: string): string {
  return PREFIXE_RESUME + tronquer(sujet.trim(), JIRA_SUMMARY_MAX - PREFIXE_RESUME.length);
}

// Volontairement dépourvu de tout champ nominatif : ni e-mail, ni nom de
// profil, ni adresse IP, ni user-agent brut. On ne peut pas divulguer ce
// qu'on ne reçoit pas — c'est la garantie structurelle de la minimisation,
// et elle vaut mieux qu'une consigne de vigilance. Seul constructeur de
// description de ticket : ne jamais en composer une ailleurs.
export type ContexteTicket = {
  reference: string;
  message: string;
  /** UUID Supabase, ou `null` pour un visiteur non connecté. */
  userId: string | null;
  pageUrl: string | null;
  /** Déjà réduit par `reduireUserAgent`. */
  browserContext: string | null;
  appVersion: string | null;
  /**
   * URL de la fiche admin, à N'INCLURE QUE si la demande porte au moins une
   * photo (`null` sinon) — construite par l'appelant, jamais ici : cette
   * fonction reste pure, `siteUrl()` est un accès serveur. Les photos elles-
   * mêmes ne quittent JAMAIS Supabase (docs/contact-jira.md) : le ticket ne
   * reçoit qu'un chemin pour aller les voir, jamais leur contenu — même
   * doctrine que « Coordonnées du demandeur » deux lignes plus bas, qui
   * renvoie déjà vers ce même écran sans y faire figurer la moindre donnée
   * personnelle.
   */
  photoAdminUrl: string | null;
};

export function corpsTicketJira(c: ContexteTicket): string {
  const lignes = [
    `Signalement utilisateur — ${c.reference}`,
    '',
    c.message.trim(),
    '',
    '---',
    `Membre : ${c.userId ?? 'visiteur non connecté'}`,
    `Page : ${c.pageUrl || 'non renseignée'}`,
    `Contexte : ${c.browserContext || CONTEXTE_INCONNU}`,
    `Version : ${c.appVersion || 'non renseignée'}`,
  ];
  if (c.photoAdminUrl) {
    lignes.push(`Photo jointe — à consulter dans l'administration : ${c.photoAdminUrl}`);
  }
  lignes.push(`Coordonnées du demandeur : écran d'administration, référence ${c.reference}.`);
  return lignes.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Mappage des statuts Jira
// ─────────────────────────────────────────────────────────────────────────

export type StatutJira = {
  /** `issue.fields.status.id`. */
  id: string | null;
  /** `issue.fields.status.name`, nom exact. */
  nom: string;
  /** `issue.fields.status.statusCategory.key` : `new`, `indeterminate`, `done`. */
  categorie: string;
};

export type ConfigStatutsJira = {
  aDeployerId: string | null;
  aDeployerNom: string;
  deployeId: string | null;
  deployeNom: string;
};

export type MappageJira =
  | { action: 'ignorer'; avertissement: string | null }
  | {
      action: 'appliquer';
      statut: ContactStatus;
      clore: boolean;
      /** Seul un passage par le statut « déployé » autorise l'e-mail au membre. */
      notifier: boolean;
      avertissement: string | null;
    };

function normaliserNom(nom: string): string {
  return nom.trim().toLocaleLowerCase('fr-FR');
}

/**
 * `Terminé` et `Déployé` partagent la catégorie Jira `done` : la catégorie ne
 * peut donc pas trancher, et c'est l'identité du statut qui décide.
 *
 * L'**id** est testé en priorité — il survit à un renommage, contrairement au
 * nom. Le nom reste testé en repli, ce qui rend la reconnaissance strictement
 * plus robuste que l'un ou l'autre seul : il suffit que l'un des deux
 * corresponde.
 */
function correspond(statut: StatutJira, id: string | null, nom: string): boolean {
  if (id && statut.id && id === statut.id) return true;
  return nom.trim() !== '' && normaliserNom(nom) === normaliserNom(statut.nom);
}

export function mapperStatutJira(statut: StatutJira, config: ConfigStatutsJira): MappageJira {
  const estDeploye = correspond(statut, config.deployeId, config.deployeNom);
  const estADeployer = correspond(statut, config.aDeployerId, config.aDeployerNom);

  // Configuration ambiguë (les deux variables désignent le même statut) : on
  // retient TOUJOURS la branche qui n'envoie pas d'e-mail. Un membre prévenu à
  // tort ne se rattrape pas ; une demande bloquée en « À déployer » se voit et
  // se corrige.
  if (estDeploye && estADeployer) {
    return {
      action: 'appliquer',
      statut: 'a_deployer',
      clore: false,
      notifier: false,
      avertissement:
        `Configuration ambiguë : le statut Jira « ${statut.nom} » correspond à la fois à ` +
        'JIRA_STATUS_TO_DEPLOY et à JIRA_STATUS_DEPLOYED. Aucun e-mail envoyé.',
    };
  }

  if (estDeploye) {
    return { action: 'appliquer', statut: 'termine', clore: true, notifier: true, avertissement: null };
  }
  if (estADeployer) {
    return { action: 'appliquer', statut: 'a_deployer', clore: false, notifier: false, avertissement: null };
  }

  switch (statut.categorie) {
    case 'new':
      // « À faire » : le ticket existe, rien n'a commencé. La demande garde
      // le statut que lui a donné sa création ou l'administrateur.
      return { action: 'ignorer', avertissement: null };

    case 'indeterminate':
      return { action: 'appliquer', statut: 'en_cours', clore: false, notifier: false, avertissement: null };

    case 'done':
      // Repli de sécurité : un statut terminal que rien ne reconnaît (statut
      // renommé dans Jira, variable d'environnement périmée). La demande
      // s'arrête en « À déployer », visible dans les anomalies — jamais close,
      // jamais notifiée.
      return {
        action: 'appliquer',
        statut: 'a_deployer',
        clore: false,
        notifier: false,
        avertissement:
          `Statut Jira inconnu en catégorie « Terminé » : « ${statut.nom} ». ` +
          'Vérifiez JIRA_STATUS_TO_DEPLOY et JIRA_STATUS_DEPLOYED. Aucun e-mail envoyé.',
      };

    default:
      return {
        action: 'ignorer',
        avertissement: `Catégorie Jira inconnue « ${statut.categorie} » pour le statut « ${statut.nom} ».`,
      };
  }
}

/**
 * Garde d'idempotence du webhook. `issue_updated` se déclenche à CHAQUE
 * modification du ticket — un commentaire, une étiquette, une pièce jointe —
 * pas seulement aux changements de statut.
 *
 * La comparaison porte sur le statut **Jira** précédemment enregistré, jamais
 * sur le statut de la demande : celui-ci peut avoir été posé à la main par un
 * administrateur, auquel cas comparer sur lui ferait manquer le passage en
 * production et l'e-mail au membre ne partirait jamais.
 */
export function memeStatutJira(
  precedent: { id: string | null; nom: string | null },
  recu: StatutJira,
): boolean {
  if (precedent.id && recu.id) return precedent.id === recu.id;
  if (!precedent.nom) return false;
  return normaliserNom(precedent.nom) === normaliserNom(recu.nom);
}

// ─────────────────────────────────────────────────────────────────────────
// Décision de synchronisation — point d'entrée UNIQUE du webhook ET de la
// réconciliation quotidienne
// ─────────────────────────────────────────────────────────────────────────

export type EtatActuelDemande = {
  status: ContactStatus;
  statusSource: string | null;
  jiraStatusId: string | null;
  jiraStatus: string | null;
};

export type DecisionSynchro =
  | { action: 'ignorer'; raison: 'meme_statut' | 'mappage'; avertissement: string | null }
  | { action: 'appliquer'; statut: ContactStatus; clore: boolean; notifier: boolean; avertissement: string | null };

/**
 * Combine, dans le bon ordre, les trois gardes du §9 de la spécification —
 * webhook et réconciliation appellent CETTE fonction plutôt que de
 * recomposer `memeStatutJira` / `mapperStatutJira` / `jiraPeutEcraser`
 * chacun à sa façon, ce qui garantirait tôt ou tard que l'un des deux
 * chemins applique les gardes dans un ordre légèrement différent.
 *
 * 1. **Idempotence d'abord** (`memeStatutJira`) — la plus fréquente : un
 *    `issue_updated` sur un commentaire ou une étiquette n'a AUCUN rapport
 *    avec un changement de statut, et c'est le cas le plus courant qu'un
 *    webhook Jira envoie.
 * 2. **Mappage** (`mapperStatutJira`) — traduit le statut Jira en statut de
 *    la demande, ou `ignorer` pour une catégorie « à faire »/inconnue.
 * 3. **Protection d'une clôture manuelle** (`jiraPeutEcraser`) — en DERNIER :
 *    inutile de la consulter si les deux gardes précédentes ont déjà décidé
 *    de ne rien faire.
 */
export function decisionSynchroJira(
  actuel: EtatActuelDemande,
  recu: StatutJira,
  config: ConfigStatutsJira,
): DecisionSynchro {
  if (memeStatutJira({ id: actuel.jiraStatusId, nom: actuel.jiraStatus }, recu)) {
    return { action: 'ignorer', raison: 'meme_statut', avertissement: null };
  }

  const mappage = mapperStatutJira(recu, config);
  if (mappage.action === 'ignorer') {
    return { action: 'ignorer', raison: 'mappage', avertissement: mappage.avertissement };
  }

  if (!jiraPeutEcraser(actuel.status, actuel.statusSource)) {
    return { action: 'ignorer', raison: 'mappage', avertissement: null };
  }

  return {
    action: 'appliquer',
    statut: mappage.statut,
    clore: mappage.clore,
    notifier: mappage.notifier,
    avertissement: mappage.avertissement,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// E-mail de déploiement
// ─────────────────────────────────────────────────────────────────────────

export type ConditionsEmailDeploiement = {
  type: ContactType;
  email: string | null;
  deployNotify: boolean;
  statutEmail: EmailStatus;
  source: SourceStatut;
};

export type VerdictEmailDeploiement = { envoyer: true } | { envoyer: false; raison: string };

/**
 * Toutes les conditions du §10.3, en un seul endroit. Quand l'une manque, la
 * raison est renvoyée telle quelle pour être écrite en base avec
 * `deploy_email_status = 'skipped'` — un « pas d'e-mail » doit toujours être
 * explicable après coup.
 *
 * Ceci ne remplace PAS la réservation atomique (`update … where
 * deploy_email_status = 'pending'`) : entre ce verdict et l'envoi, un second
 * événement peut passer. C'est la base qui arbitre, cette fonction ne fait
 * qu'écarter en amont ce qui n'a aucune chance.
 */
export function emailDeploiementAutorise(c: ConditionsEmailDeploiement): VerdictEmailDeploiement {
  if (c.source === 'admin') {
    return { envoyer: false, raison: "clôture manuelle : seul le statut Jira « déployé » déclenche l'e-mail" };
  }
  if (c.type !== 'bug') {
    return { envoyer: false, raison: `type « ${c.type} » : seuls les signalements de bug sont notifiés` };
  }
  if (!c.email) {
    return { envoyer: false, raison: 'aucune adresse e-mail associée à la demande' };
  }
  if (!c.deployNotify) {
    return { envoyer: false, raison: 'notification désactivée sur cette demande (deploy_notify)' };
  }
  if (c.statutEmail !== 'pending') {
    return { envoyer: false, raison: `e-mail déjà traité (statut « ${c.statutEmail} »)` };
  }
  return { envoyer: true };
}

export type ContexteEmailDeploiement = {
  reference: string;
  /** Prénom si connu (profil connecté), sinon salutation générique. */
  authorFirstName: string | null;
  subject: string;
};

export type EmailDeploiementComposee = { subject: string; html: string; text: string };

/**
 * Contenu de l'e-mail de déploiement (spec §10.3). Reprend le sujet ORIGINAL
 * de la demande entre guillemets, pour que le membre reconnaisse
 * immédiatement de quel signalement il s'agit — il peut avoir signalé
 * plusieurs bugs.
 */
export function composeEmailDeploiement(ctx: ContexteEmailDeploiement): EmailDeploiementComposee {
  const salutation = ctx.authorFirstName ? `Bonjour ${ctx.authorFirstName},` : 'Bonjour,';
  const subject = `Le problème que vous avez signalé est corrigé [${ctx.reference}]`;

  const text = [
    salutation,
    '',
    'La correction du problème que vous nous aviez signalé est maintenant en ligne :',
    '',
    `  « ${ctx.subject} »`,
    '',
    'Vous pouvez retourner sur le site pour en profiter. Pensez à rafraîchir la',
    'page si vous aviez le site déjà ouvert.',
    '',
    'Si le problème persiste, répondez à ce message : nous rouvrirons le sujet.',
    '',
    'Merci de nous avoir aidés à améliorer Je pâtisse !',
    '',
    'L’équipe Je pâtisse !',
  ].join('\n');

  const echappe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
    <p>${salutation}</p>
    <p>La correction du problème que vous nous aviez signalé est maintenant en ligne :</p>
    <p>« ${echappe(ctx.subject)} »</p>
    <p>Vous pouvez retourner sur le site pour en profiter. Pensez à rafraîchir la page si vous aviez le site déjà ouvert.</p>
    <p>Si le problème persiste, répondez à ce message : nous rouvrirons le sujet.</p>
    <p>Merci de nous avoir aidés à améliorer Je pâtisse !</p>
    <p>L’équipe Je pâtisse !</p>`;

  return { subject, html, text };
}

export type NotificationDeploiementComposee = { title: string; body: string };

/** Pendant in-app de `composeEmailDeploiement` (décision retenue : notifier
 * aussi les membres connectés dans la cloche, en plus de l'e-mail — cf.
 * docs/contact-jira.md §2.8). */
export function composeNotificationDeploiement(subject: string): NotificationDeploiementComposee {
  return {
    title: 'Votre signalement est corrigé',
    body: `La correction du problème « ${subject} » est maintenant en ligne. Merci de nous avoir aidés à améliorer Je pâtisse !`,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Notification à l'administrateur — à chaque demande
// ─────────────────────────────────────────────────────────────────────────

export type ContexteNotificationAdmin = {
  reference: string;
  type: ContactType;
  subject: string;
  message: string;
  /** Nom du profil, ou « Visiteur » pour une demande non authentifiée. */
  authorLabel: string;
  authorEmail: string | null;
  createdAtIso: string;
  pageUrl: string | null;
  browserContext: string | null;
  /** `null` avant la création du ticket (lot Jira) — la ligne est alors omise. */
  jiraIssueKey: string | null;
  /** URL absolue vers la vue détail du back-office. */
  adminUrl: string;
};

export type NotificationAdminComposee = { subject: string; html: string; text: string };

/**
 * Notification par courriel à chaque demande (§10.1). Composée ici, PURE :
 * l'envoi (et la lecture des variables d'environnement qui le rendent
 * possible) reste dans `lib/contact-data.ts`.
 */
export function composeNotificationAdmin(ctx: ContexteNotificationAdmin): NotificationAdminComposee {
  const type = CONTACT_TYPES[ctx.type];
  const prioritaire = type.prioritaire;

  const subject = prioritaire
    ? `[PRIORITAIRE] [Je pâtisse !] Nouvelle demande — [${ctx.reference}]`
    : `[Je pâtisse !] Nouvelle demande ${type.labelCourt} — [${ctx.reference}]`;

  const auteur = ctx.authorEmail ? `${ctx.authorLabel} (${ctx.authorEmail})` : ctx.authorLabel;

  const lignes = [
    `Type : ${type.labelCourt}`,
    `Référence : ${ctx.reference}`,
    `Membre : ${auteur}`,
    `Reçue le : ${formatDateHeure(ctx.createdAtIso)}`,
    '',
    `Sujet : ${ctx.subject}`,
    '',
    ctx.message,
    '',
    `Page : ${ctx.pageUrl || 'non renseignée'}`,
    `Contexte : ${ctx.browserContext || CONTEXTE_INCONNU}`,
  ];
  if (ctx.jiraIssueKey) lignes.push(`Ticket Jira : ${ctx.jiraIssueKey}`);
  if (prioritaire) {
    lignes.push('', "⚠ Demande relative aux données personnelles : délai de réponse légal d'un mois.");
  }
  lignes.push('', `→ Ouvrir dans l'administration : ${ctx.adminUrl}`);

  const text = lignes.join('\n');
  const html = `<pre style="font:14px/1.5 -apple-system,sans-serif;white-space:pre-wrap;">${lignes
    .map((l) =>
      l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    )
    .join('\n')}</pre>`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────
// Réponse depuis le panneau d'administration (spec §10.2)
// ─────────────────────────────────────────────────────────────────────────

export const REPONSE_ADMIN_MIN = 10;
export const REPONSE_ADMIN_MAX = 5000;

// Rappelé en citation dans l'e-mail au demandeur : « votre message initial »,
// tronqué pour que la réponse reste lisible en premier — l'objet de l'e-mail
// porte déjà la référence pour retrouver l'échange complet.
const CITATION_MAX = 500;

export type ValidationReponseAdmin = { ok: true; body: string } | { ok: false; error: string };

/**
 * Même doctrine que `validerDemande` : les contrôles client ne prouvent
 * rien, la route serveur revalide (spec §10.2.2 — 10 à 5000 caractères, non
 * vide après nettoyage).
 */
export function validerReponseAdmin(saisie: unknown): ValidationReponseAdmin {
  const body = typeof saisie === 'string' ? saisie.trim() : '';
  if (body.length < REPONSE_ADMIN_MIN) return { ok: false, error: `La réponse doit contenir au moins ${REPONSE_ADMIN_MIN} caractères.` };
  if (body.length > REPONSE_ADMIN_MAX) return { ok: false, error: `La réponse ne peut pas dépasser ${REPONSE_ADMIN_MAX} caractères.` };
  return { ok: true, body };
}

export type ContexteReponseAdmin = {
  reference: string;
  /** Prénom de l'auteur si connu (profil connecté), sinon salutation générique. */
  authorFirstName: string | null;
  replyBody: string;
  originalSubject: string;
  originalMessage: string;
  originalDateIso: string;
};

export type ReponseAdminComposee = { subject: string; html: string; text: string };

/**
 * Compose l'e-mail envoyé au demandeur en réponse à sa fiche (§10.2). Le
 * corps est du texte brut saisi par l'administrateur, jamais du HTML libre
 * (spec §12) — l'échappement dans la version HTML est la seule protection.
 */
export function composeReponseAdmin(ctx: ContexteReponseAdmin): ReponseAdminComposee {
  const salutation = ctx.authorFirstName ? `Bonjour ${ctx.authorFirstName},` : 'Bonjour,';
  const citation = tronquer(ctx.originalMessage.trim(), CITATION_MAX);
  const date = formatDateHeure(ctx.originalDateIso);

  const subject = `Re : ${ctx.originalSubject} [${ctx.reference}]`;

  const text = [
    salutation,
    '',
    ctx.replyBody.trim(),
    '',
    '---',
    'Vous pouvez répondre directement à ce message.',
    '',
    `Votre message initial du ${date} :`,
    `> ${citation}`,
    '',
    'L’équipe Je pâtisse !',
  ].join('\n');

  const echappe = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `
    <p>${salutation}</p>
    <p>${echappe(ctx.replyBody.trim()).replace(/\n/g, '<br>')}</p>
    <hr>
    <p>Vous pouvez répondre directement à ce message.</p>
    <p>Votre message initial du ${date} :<br>
    <em>${echappe(citation).replace(/\n/g, '<br>')}</em></p>
    <p>L’équipe Je pâtisse !</p>`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────
// Écran d'administration
// ─────────────────────────────────────────────────────────────────────────

// Fenêtre servie par le rendu serveur (cf. `docs/contact-jira.md` §2.6) : le
// tri et la recherche sont instantanés côté client dans cette fenêtre, et les
// filtres statut/type — eux appliqués côté serveur via l'URL — permettent
// d'atteindre les demandes plus anciennes malgré le plafond.
export const CONTACT_LISTE_MAX = 200;

// Longueur de sujet affichée dans la liste avant troncature.
export const SUJET_LISTE_MAX = 60;

// ─────────────────────────────────────────────────────────────────────────
// Filtres statut/type de la liste — cases à cocher, multi-sélection
// ─────────────────────────────────────────────────────────────────────────

// Paramètres `?statuts=`/`?types=` : une liste de valeurs séparées par des
// virgules. **Absent** de l'URL → tout coché (comportement par défaut voulu :
// la liste montre tout tant qu'on n'a touché à rien). Présent mais **vide**
// (`?statuts=`) → rien coché, distinct de l'absence : c'est ce qu'écrit le
// bouton « Tout décocher », qui doit rester « rien » à la prochaine visite,
// pas retomber sur le défaut.
export function parseStatutsSelectionnes(raw: string | undefined): ContactStatus[] {
  if (raw === undefined) return [...CONTACT_STATUS_KEYS];
  if (raw === '') return [];
  return raw.split(',').filter(isContactStatus);
}

export function parseTypesSelectionnes(raw: string | undefined): ContactType[] {
  if (raw === undefined) return [...CONTACT_TYPE_KEYS];
  if (raw === '') return [];
  return raw.split(',').filter(isContactType);
}
