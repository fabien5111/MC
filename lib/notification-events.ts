import { IDEA_STATUSES, isIdeaStatus } from '@/lib/ideas';

// Catalogue des événements notifiés (JEP-278) — module PUR, utilisable côté
// serveur (moteur `notifier`) comme côté client (grille de préférences de
// /reglages). Aucune lecture de base, aucun import `next/headers`.
//
// **Une seule source de vérité** : la grille de JEP-279 est construite en
// lisant ce catalogue, donc un événement ajouté ici apparaît de lui-même dans
// l'écran de préférences. Ne jamais tenir une seconde liste d'événements ou de
// catégories ailleurs.

export type Rythme = 'immediat' | 'quotidien' | 'hebdo';

export const CATEGORIES = [
  'mes_recettes',
  'communaute',
  'mes_avis',
  'fournees',
  'idees',
  'abonnement',
  'support',
  'moderation',
] as const;
export type Categorie = (typeof CATEGORIES)[number];

export type CategorieInfo = {
  libelle: string;
  /** Réservée aux admins et gestionnaires : absente de la grille d'un membre. */
  backOffice?: boolean;
  /** Canal « site » non désactivable (abonnement, support : la continuité du service en dépend). */
  siteVerrouille?: boolean;
  /** Canal « e-mail » non désactivable : toute la catégorie est obligatoire (support et compte). */
  emailVerrouille?: boolean;
  /** Raison affichée, en grisé, dans la grille de préférences (JEP-279). */
  noteVerrouille?: string;
};

export const CATEGORIE_INFO: Record<Categorie, CategorieInfo> = {
  mes_recettes: { libelle: 'Mes recettes' },
  communaute: { libelle: 'Communauté' },
  mes_avis: { libelle: 'Mes avis' },
  fournees: { libelle: 'Fournées (rappels)' },
  idees: { libelle: 'Boîte à idées' },
  abonnement: {
    libelle: 'Abonnement',
    siteVerrouille: true,
    noteVerrouille:
      'Les confirmations de souscription et de résiliation sont obligatoires (obligation légale) : elles partent toujours. Les alertes affichées sur le site restent visibles.',
  },
  support: {
    libelle: 'Support et compte',
    siteVerrouille: true,
    emailVerrouille: true,
    noteVerrouille: 'Ces messages sont toujours envoyés, sur le site comme par e-mail : ils ne peuvent pas être désactivés.',
  },
  moderation: { libelle: 'Modération (back-office)', backOffice: true },
};

/**
 * Une RUBRIQUE est la plus petite unité réglable par un membre (sous-catégorie
 * de la grille). Sa clé est celle stockée dans `notification_preferences.category`
 * : `mes_recettes.favoris` pour une sous-catégorie, ou le nom de la catégorie
 * elle-même quand celle-ci n'est pas découpée (`mes_avis`). Jamais de colonne ou
 * de migration à ajouter pour une rubrique de plus.
 *
 * **Héritage** : une ligne enregistrée au niveau de la CATÉGORIE (avant le
 * découpage, ou par la reprise de `notify_email = false`) vaut pour toutes ses
 * rubriques tant que le membre n'en a pas réglé une individuellement — un
 * e-mail refusé ne devient jamais un e-mail reçu à cause du découpage.
 */
export type Rubrique = {
  cle: string;
  categorie: Categorie;
  /** Titre de la sous-catégorie ; `null` quand la catégorie n'est pas découpée. */
  libelle: string | null;
  /** Une phrase : ce que couvre la rubrique. */
  description: string;
  /** Valeurs proposées à un membre qui n'a rien réglé — volontairement sobres. */
  defaut: { site: boolean; email: boolean; rythme: Rythme };
  /** Rythmes que le membre peut choisir pour l'e-mail (« immédiat » absent = récapitulatif seulement). */
  rythmesPermis: Rythme[];
};

const TOUS: Rythme[] = ['immediat', 'quotidien', 'hebdo'];
const RECAP: Rythme[] = ['quotidien', 'hebdo'];
const IMMEDIAT = { site: true, email: true, rythme: 'immediat' as Rythme };
const RECAP_SOBRE = { site: true, email: false, rythme: 'hebdo' as Rythme };

export const RUBRIQUES: Rubrique[] = [
  // ── Mes recettes : 5 ─────────────────────────────────────────────────
  {
    cle: 'mes_recettes.publication',
    categorie: 'mes_recettes',
    libelle: 'Publication ou refus',
    description: 'Votre recette est publiée, ou refusée avec le motif.',
    defaut: IMMEDIAT,
    rythmesPermis: TOUS,
  },
  {
    cle: 'mes_recettes.avis',
    categorie: 'mes_recettes',
    libelle: 'Avis reçus',
    description: 'Un avis est publié sur l’une de vos recettes.',
    defaut: IMMEDIAT,
    rythmesPermis: TOUS,
  },
  {
    cle: 'mes_recettes.favoris',
    categorie: 'mes_recettes',
    libelle: 'Favoris',
    description: 'Un membre met l’une de vos recettes en favori. Par e-mail, vous ne les recevez que dans le récapitulatif.',
    defaut: RECAP_SOBRE,
    rythmesPermis: RECAP,
  },
  {
    cle: 'mes_recettes.projets',
    categorie: 'mes_recettes',
    libelle: 'Projets qui s’en inspirent',
    description: 'L’une de vos recettes sert de composant dans le projet d’un membre.',
    defaut: RECAP_SOBRE,
    rythmesPermis: RECAP,
  },
  {
    cle: 'mes_recettes.mise_en_avant',
    categorie: 'mes_recettes',
    libelle: 'Mise en avant sur l’accueil',
    description: 'L’une de vos recettes devient la recette mise en avant sur la page d’accueil.',
    defaut: IMMEDIAT,
    rythmesPermis: TOUS,
  },
  // ── Communauté : 3 ───────────────────────────────────────────────────
  {
    cle: 'communaute.abonnes',
    categorie: 'communaute',
    libelle: 'Nouveaux abonnés',
    description: 'Un membre commence à vous suivre.',
    defaut: RECAP_SOBRE,
    rythmesPermis: RECAP,
  },
  {
    cle: 'communaute.suivis',
    categorie: 'communaute',
    libelle: 'Pâtissiers que vous suivez',
    description: 'Un pâtissier que vous suivez publie une recette.',
    defaut: RECAP_SOBRE,
    rythmesPermis: RECAP,
  },
  {
    cle: 'communaute.partages',
    categorie: 'communaute',
    libelle: 'Carnets et recettes partagés',
    description: 'Un membre partage son carnet ou une recette avec vous.',
    defaut: RECAP_SOBRE,
    rythmesPermis: TOUS,
  },
  // ── Mes avis : non découpée ──────────────────────────────────────────
  {
    cle: 'mes_avis',
    categorie: 'mes_avis',
    libelle: null,
    description: 'Publication ou refus des avis que vous avez laissés sur des recettes.',
    defaut: IMMEDIAT,
    rythmesPermis: TOUS,
  },
  // ── Fournées : 3 ─────────────────────────────────────────────────────
  {
    cle: 'fournees.etapes',
    categorie: 'fournees',
    libelle: 'Étapes à commencer aujourd’hui',
    description: 'Le matin d’une étape de fournée à lancer, selon son jour (J − n).',
    defaut: IMMEDIAT,
    rythmesPermis: TOUS,
  },
  {
    cle: 'fournees.veille',
    categorie: 'fournees',
    libelle: 'Rappel la veille du jour J',
    description: 'Votre fournée est prévue le lendemain.',
    defaut: IMMEDIAT,
    rythmesPermis: TOUS,
  },
  {
    cle: 'fournees.avis',
    categorie: 'fournees',
    libelle: 'Invitation à donner votre avis',
    description: 'Le lendemain d’une fournée terminée, si vous n’avez pas encore noté la recette.',
    defaut: IMMEDIAT,
    rythmesPermis: TOUS,
  },
  // ── Boîte à idées : 3 ────────────────────────────────────────────────
  {
    cle: 'idees.statut',
    categorie: 'idees',
    libelle: 'Évolution du statut de vos idées',
    description: 'L’une de vos idées passe à l’étude, en développement, terminée ou refusée (avec la note de l’équipe).',
    defaut: RECAP_SOBRE,
    rythmesPermis: TOUS,
  },
  {
    cle: 'idees.fusion',
    categorie: 'idees',
    libelle: 'Fusion avec une autre idée',
    description: 'L’une de vos idées est réunie avec une idée proche.',
    defaut: RECAP_SOBRE,
    rythmesPermis: TOUS,
  },
  {
    cle: 'idees.soutenues',
    categorie: 'idees',
    libelle: 'Idées que vous avez soutenues',
    description: 'Une idée pour laquelle vous avez voté est réalisée.',
    defaut: RECAP_SOBRE,
    rythmesPermis: RECAP,
  },
  // ── Non découpées ────────────────────────────────────────────────────
  {
    cle: 'abonnement',
    categorie: 'abonnement',
    libelle: null,
    description:
      'Fin d’essai et échéances qui approchent, expiration, échec de paiement, confirmation de souscription et de résiliation.',
    defaut: IMMEDIAT,
    rythmesPermis: ['immediat'],
  },
  {
    cle: 'support',
    categorie: 'support',
    libelle: null,
    description: 'Réponses à vos demandes de contact et alertes de sécurité de votre compte.',
    defaut: IMMEDIAT,
    rythmesPermis: ['immediat'],
  },
  {
    cle: 'moderation',
    categorie: 'moderation',
    libelle: null,
    description: 'Recettes et avis en attente de validation, regroupés dans un récapitulatif.',
    defaut: { site: true, email: true, rythme: 'quotidien' },
    rythmesPermis: RECAP,
  },
];

export function rubriquesDeCategorie(categorie: Categorie): Rubrique[] {
  return RUBRIQUES.filter((r) => r.categorie === categorie);
}

export function rubriqueInfo(cle: string): Rubrique | null {
  return RUBRIQUES.find((r) => r.cle === cle) ?? null;
}

/** Priorité d'envoi quand le quota de la journée est serré (plus petit = plus tôt). */
export type PrioriteEnvoi = 0 | 1 | 2;
/** 0 = non désactivable (légal, sécurité, support) · 1 = P1 · 2 = P2 / récapitulatifs. */
export const PRIORITE_VERROUILLE: PrioriteEnvoi = 0;

/** Données passées à `notifier` — champs libres, lus par les gabarits. */
export type DonneesEvenement = {
  /** Pseudo de l'acteur (« Alice a mis votre recette en favori »). */
  acteur?: string | null;
  /** Titre de la recette, de l'idée, de la fournée… */
  titre?: string | null;
  /** Texte libre (motif de refus, note admin, statut…). */
  detail?: string | null;
  /** Nombre d'occurrences regroupées (anti-rafale). */
  nombre?: number;
  /** Autres acteurs, pour le gabarit groupé (au plus trois, les plus récents). */
  acteurs?: string[];
  /** Lien relatif (« /recette/12 »). */
  lien?: string | null;
  [cle: string]: unknown;
};

export type GabaritNotification = { titre: string; corps: string };

export type DefinitionEvenement = {
  categorie: Categorie;
  /** Clé de la rubrique (sous-catégorie) qui règle cet événement — cf. `RUBRIQUES`. */
  rubrique: string;
  /** Impossible à désactiver, sur aucun canal : légal, sécurité, support. */
  verrouille?: boolean;
  /**
   * Jamais d'e-mail immédiat : l'événement ne part que dans le récapitulatif
   * du membre (favoris, abonnés, recettes d'un pâtissier suivi…). La cloche,
   * elle, reste immédiate.
   */
  recapSeulement?: boolean;
  /** 1 = forte valeur, faible volume · 2 = utile. Le verrouillé est toujours 0. */
  priorite: PrioriteEnvoi;
  /**
   * Regroupement anti-rafale : les événements identiques, rapprochés et non
   * lus, deviennent UNE notification (« 5 membres ont mis votre recette en
   * favori »). La clé est calculée à partir de ce champ des données (ex.
   * l'id de la recette) ; absent = jamais regroupé.
   */
  groupeParCle?: string;
  /** Texte de la notification individuelle. */
  gabarit: (d: DonneesEvenement) => GabaritNotification;
  /** Texte de la notification regroupée (quand `nombre` > 1). */
  gabaritGroupe?: (d: DonneesEvenement) => GabaritNotification;
  /** Où mène la notification (chemin relatif) — ce que la cloche ouvre au clic. */
  lien?: (d: DonneesEvenement) => string | null;
};

/** Libellé affiché d'un statut d'idée (« En développement »…), à défaut le texte tel quel. */
function libelleStatutIdee(statut: unknown): string {
  const brut = typeof statut === 'string' ? statut : '';
  return isIdeaStatus(brut) ? IDEA_STATUSES[brut].label : brut || 'un nouveau statut';
}

const t = (v: string | null | undefined, repli: string): string => (v && v.trim() ? v.trim() : repli);

/** « Alice », « Alice et Bob », « Alice, Bob et 3 autres ». */
export function listeActeurs(acteurs: string[], nombre: number): string {
  const noms = acteurs.filter(Boolean).slice(0, 2);
  if (noms.length === 0) return `${nombre} membres`;
  const reste = nombre - noms.length;
  if (reste <= 0) return noms.length === 1 ? noms[0] : `${noms[0]} et ${noms[1]}`;
  return `${noms.join(', ')} et ${reste} autre${reste > 1 ? 's' : ''}`;
}

/**
 * Le catalogue. La clé est le nom stable de l'événement — il est stocké dans
 * `notifications.event` et `notification_outbox.event` : ne JAMAIS la renommer
 * sans migration des lignes existantes.
 */
export const EVENEMENTS = {
  // ── Abonnement (existant : doit partir à l'identique) ───────────────────
  // Les textes viennent de `composeNotification` (cron) et des messages du
  // webhook Stripe : ces événements reçoivent un `gabarit` pré-composé par
  // l'appelant via `detail`/`titre` (voir `gabaritPreCompose`).
  TRIAL_J3: precompose('abonnement'),
  TRIAL_J1: precompose('abonnement'),
  SUB_J3: precompose('abonnement'),
  SUB_J1: precompose('abonnement'),
  EXPIRED_J1: precompose('abonnement'),
  PAYMENT_FAILED: precompose('abonnement'),
  SUBSCRIPTION_CONFIRMED: precompose('abonnement', { verrouille: true }),
  SUBSCRIPTION_CANCELLED: precompose('abonnement', { verrouille: true }),

  // ── Support et compte ──────────────────────────────────────────────────
  contact_deploye: precompose('support', { verrouille: true }),
  contact_reponse: precompose('support', { verrouille: true }),
  mot_de_passe_change: precompose('support', { verrouille: true }),

  // ── Mes recettes (auteur) ──────────────────────────────────────────────
  recette_publiee: {
    categorie: 'mes_recettes',
    rubrique: 'mes_recettes.publication',
    lien: (d) => `/recette/${d.recetteId}`,
    priorite: 1,
    gabarit: (d) => ({
      titre: 'Votre recette est publiée',
      corps: `« ${t(d.titre, 'Votre recette')} » est désormais visible de tous.`,
    }),
  },
  recette_refusee: {
    categorie: 'mes_recettes',
    rubrique: 'mes_recettes.publication',
    lien: (d) => `/recette/${d.recetteId}`,
    priorite: 1,
    gabarit: (d) => ({
      titre: 'Votre recette n’a pas été publiée',
      corps: `« ${t(d.titre, 'Votre recette')} » a été refusée.${d.detail ? `\nMotif : ${d.detail}` : ''}`,
    }),
  },
  avis_recu: {
    categorie: 'mes_recettes',
    rubrique: 'mes_recettes.avis',
    lien: (d) => `/recette/${d.recetteId}#sec-commentaires`,
    priorite: 1,
    gabarit: (d) => ({
      titre: 'Nouvel avis sur votre recette',
      corps: `${t(d.acteur, 'Un membre')} a donné son avis sur « ${t(d.titre, 'votre recette')} ».`,
    }),
  },
  recette_favori: {
    categorie: 'mes_recettes',
    rubrique: 'mes_recettes.favoris',
    lien: (d) => `/recette/${d.recetteId}`,
    priorite: 2,
    recapSeulement: true,
    // Pas de regroupement dans la cloche (arbitrage du 03/10) : une entrée par
    // favori, avec le pseudo de la personne.
    gabarit: (d) => ({
      titre: 'Votre recette a été mise en favori',
      corps: `${t(d.acteur, 'Un membre')} a mis « ${t(d.titre, 'votre recette')} » en favori.`,
    }),
  },
  recette_composant: {
    categorie: 'mes_recettes',
    rubrique: 'mes_recettes.projets',
    lien: (d) => `/recette/${d.recetteId}`,
    priorite: 2,
    recapSeulement: true,
    gabarit: (d) => ({
      titre: 'Votre recette inspire un projet',
      corps: `${t(d.acteur, 'Un membre')} utilise « ${t(d.titre, 'votre recette')} » comme composant d’un projet.`,
    }),
  },
  recette_mise_en_avant: {
    categorie: 'mes_recettes',
    rubrique: 'mes_recettes.mise_en_avant',
    lien: (d) => `/recette/${d.recetteId}`,
    priorite: 2,
    gabarit: (d) => ({
      titre: 'Votre recette est mise en avant',
      corps: `« ${t(d.titre, 'Votre recette')} » est à l’honneur sur la page d’accueil.`,
    }),
  },

  // ── Mes avis ───────────────────────────────────────────────────────────
  avis_publie: {
    categorie: 'mes_avis',
    rubrique: 'mes_avis',
    lien: (d) => `/recette/${d.recetteId}#sec-commentaires`,
    priorite: 1,
    gabarit: (d) => ({
      titre: 'Votre avis est publié',
      corps: `Votre avis sur « ${t(d.titre, 'la recette')} » est en ligne. Merci !`,
    }),
  },
  avis_refuse: {
    categorie: 'mes_avis',
    rubrique: 'mes_avis',
    lien: (d) => d.batchId ? `/fournee/${d.batchId}` : `/recette/${d.recetteId}`,
    priorite: 1,
    gabarit: (d) => ({
      titre: 'Votre avis n’a pas été publié',
      corps: `Votre avis sur « ${t(d.titre, 'la recette')} » a été refusé.${d.detail ? `\nMotif : ${d.detail}` : ''}\nVous pouvez le corriger depuis la fournée.`,
    }),
  },

  // ── Communauté ─────────────────────────────────────────────────────────
  nouvel_abonne: {
    categorie: 'communaute',
    rubrique: 'communaute.abonnes',
    lien: (d) => d.acteurHandle ? `/u/${d.acteurHandle}` : '/profil',
    priorite: 2,
    recapSeulement: true,
    // Volontairement PAS regroupé (arbitrage du 03/10) : une entrée par abonné,
    // chacune ouvrant le profil de la personne, comme sur un réseau social.
    gabarit: (d) => ({
      titre: 'Un nouvel abonné',
      corps: `${t(d.acteur, 'Un membre')} vous suit désormais.`,
    }),
  },
  recette_suivi: {
    categorie: 'communaute',
    rubrique: 'communaute.suivis',
    lien: (d) => `/recette/${d.recetteId}`,
    priorite: 2,
    recapSeulement: true,
    // Pas de regroupement dans la cloche (arbitrage du 03/10) : une entrée par
    // recette publiée, chacune vers sa fiche.
    gabarit: (d) => ({
      titre: 'Nouvelle recette d’un pâtissier suivi',
      corps: `${t(d.acteur, 'Un pâtissier que vous suivez')} a publié « ${t(d.titre, 'une recette')} ».`,
    }),
  },
  partage_recu: {
    categorie: 'communaute',
    rubrique: 'communaute.partages',
    lien: (d) => d.recetteId ? `/recette/${d.recetteId}` : '/carnet?scope=shared',
    priorite: 1,
    gabarit: (d) => ({
      titre: 'On partage avec vous',
      corps: `${t(d.acteur, 'Un membre')} vous partage ${t(d.detail, 'un contenu')}.`,
    }),
  },

  // ── Fournées ───────────────────────────────────────────────────────────
  rappel_etape: {
    categorie: 'fournees',
    rubrique: 'fournees.etapes',
    lien: (d) => `/fournee/${d.batchId}`,
    priorite: 1,
    gabarit: (d) => ({
      titre: 'Une étape à commencer aujourd’hui',
      corps: `Fournée « ${t(d.titre, 'votre fournée')} » : ${t(d.detail, 'une étape')} est à commencer aujourd’hui.`,
    }),
  },
  rappel_veille: {
    categorie: 'fournees',
    rubrique: 'fournees.veille',
    lien: (d) => `/fournee/${d.batchId}`,
    priorite: 2,
    gabarit: (d) => ({
      titre: 'C’est demain !',
      corps: `Votre fournée « ${t(d.titre, 'votre fournée')} » est prévue demain.`,
    }),
  },
  invitation_avis: {
    categorie: 'fournees',
    rubrique: 'fournees.avis',
    lien: (d) => `/fournee/${d.batchId}`,
    priorite: 2,
    gabarit: (d) => ({
      titre: 'Comment était votre fournée ?',
      corps: `Donnez votre avis sur « ${t(d.titre, 'la recette')} » que vous avez cuisinée hier.`,
    }),
  },

  // ── Boîte à idées ──────────────────────────────────────────────────────
  idee_statut: {
    categorie: 'idees',
    rubrique: 'idees.statut',
    lien: (d) => '/idees',
    priorite: 1,
    gabarit: (d) => ({
      titre: 'Votre idée évolue',
      corps: `Votre idée « ${t(d.titre, 'votre idée')} » est passée à : ${libelleStatutIdee(d.detail)}.${d.note ? `\nNote de l’équipe : ${String(d.note)}` : ''}`,
    }),
  },
  idee_fusionnee: {
    categorie: 'idees',
    rubrique: 'idees.fusion',
    lien: (d) => '/idees',
    priorite: 2,
    gabarit: (d) => ({
      titre: 'Votre idée a été fusionnée',
      corps: `Votre idée « ${t(d.titre, 'votre idée')} » a été réunie avec une idée proche : ${t(d.detail, 'une autre idée')}.`,
    }),
  },
  idee_realisee: {
    categorie: 'idees',
    rubrique: 'idees.soutenues',
    lien: (d) => '/idees',
    priorite: 2,
    recapSeulement: true,
    gabarit: (d) => ({
      titre: 'Une idée que vous avez soutenue est réalisée',
      corps: `« ${t(d.titre, 'Une idée')} » est désormais en place.`,
    }),
  },

  // ── Modération (back-office) ───────────────────────────────────────────
  moderation_recette: {
    categorie: 'moderation',
    rubrique: 'moderation',
    lien: (d) => '/admin/recettes',
    priorite: 1,
    recapSeulement: true,
    groupeParCle: 'file',
    gabarit: (d) => ({
      titre: 'Une recette attend une modération',
      corps: `« ${t(d.titre, 'Une recette')} » attend votre validation.`,
    }),
    gabaritGroupe: (d) => ({
      titre: 'Des recettes attendent une modération',
      corps: `${d.nombre ?? 2} recettes attendent votre validation.`,
    }),
  },
  moderation_avis: {
    categorie: 'moderation',
    rubrique: 'moderation',
    lien: (d) => '/admin/commentaires',
    priorite: 1,
    recapSeulement: true,
    groupeParCle: 'file',
    gabarit: (d) => ({
      titre: 'Un avis attend une modération',
      corps: `Un avis sur « ${t(d.titre, 'une recette')} » attend votre validation${d.detail ? ` (score IA : ${d.detail})` : ''}.`,
    }),
    gabaritGroupe: (d) => ({
      titre: 'Des avis attendent une modération',
      corps: `${d.nombre ?? 2} avis attendent votre validation.`,
    }),
  },
} satisfies Record<string, DefinitionEvenement>;

export type NomEvenement = keyof typeof EVENEMENTS;

/**
 * Événement dont le texte est composé par l'appelant (abonnement, contact,
 * Stripe) : ces messages existaient avant le moteur et doivent partir À
 * L'IDENTIQUE. Le gabarit se contente de relayer `titre` et `detail`.
 */
function precompose(categorie: Categorie, opts: { verrouille?: boolean } = {}): DefinitionEvenement {
  return {
    categorie,
    rubrique: categorie,
    verrouille: opts.verrouille,
    priorite: opts.verrouille ? PRIORITE_VERROUILLE : 1,
    gabarit: (d) => ({ titre: t(d.titre, ''), corps: t(d.detail, '') }),
  };
}

export function definitionEvenement(nom: string): DefinitionEvenement | null {
  return (EVENEMENTS as Record<string, DefinitionEvenement>)[nom] ?? null;
}

/** Les événements d'une catégorie, dans l'ordre du catalogue. */
export function evenementsDeCategorie(categorie: Categorie): { nom: NomEvenement; def: DefinitionEvenement }[] {
  return (Object.entries(EVENEMENTS) as [NomEvenement, DefinitionEvenement][])
    .filter(([, def]) => def.categorie === categorie)
    .map(([nom, def]) => ({ nom, def }));
}

/** Les événements réglés par une rubrique. */
export function evenementsDeRubrique(cle: string): { nom: NomEvenement; def: DefinitionEvenement }[] {
  return (Object.entries(EVENEMENTS) as [NomEvenement, DefinitionEvenement][])
    .filter(([, def]) => def.rubrique === cle)
    .map(([nom, def]) => ({ nom, def }));
}

// ── Préférences ──────────────────────────────────────────────────────────

/** Rythme tel que stocké dans `notification_preferences.rhythm`. */
export const RYTHME_DEPUIS_BASE: Record<string, Rythme> = { immediate: 'immediat', daily: 'quotidien', weekly: 'hebdo' };
export const RYTHME_VERS_BASE: Record<Rythme, string> = { immediat: 'immediate', quotidien: 'daily', hebdo: 'weekly' };
export const LIBELLE_RYTHME: Record<Rythme, string> = { immediat: 'Immédiat', quotidien: 'Quotidien', hebdo: 'Hebdomadaire' };

export type PreferenceCategorie = { site: boolean; email: boolean; rythme: Rythme };

/**
 * Lignes éparses de `notification_preferences`, indexées par clé de RUBRIQUE
 * (`mes_recettes.favoris`) ou, pour une ligne plus ancienne, de CATÉGORIE
 * (`mes_recettes`) : seules les divergences avec le défaut y sont stockées.
 */
export type PreferencesMembre = Partial<Record<string, PreferenceCategorie>>;

/**
 * Préférence effective d'une rubrique, par ordre de priorité :
 * 1. sa propre ligne ; 2. la ligne de sa catégorie (héritage, cf. `Rubrique`) ;
 * 3. le défaut du catalogue. Les verrous de la catégorie s'appliquent par-dessus.
 */
export function preferenceEffective(prefs: PreferencesMembre, cleRubrique: string): PreferenceCategorie {
  // Une clé de catégorie (ligne ancienne d'une file) se lit comme sa première rubrique.
  const r = rubriqueInfo(cleRubrique) ?? RUBRIQUES.find((x) => x.categorie === cleRubrique);
  if (!r) throw new Error(`rubrique inconnue « ${cleRubrique} »`);
  const info = CATEGORIE_INFO[r.categorie];
  const base = prefs[r.cle] ?? prefs[r.categorie] ?? r.defaut;
  return {
    // Le site est verrouillé pour l'abonnement et le support.
    site: info.siteVerrouille ? true : base.site,
    email: info.emailVerrouille ? true : base.email,
    rythme: r.rythmesPermis.includes(base.rythme) ? base.rythme : r.rythmesPermis[0],
  };
}

export type CanalDecision =
  | { site: false; email: 'aucun' }
  | { site: boolean; email: 'aucun' | 'immediat' | Exclude<Rythme, 'immediat'> };

/**
 * Où va un événement pour un membre — LE calcul unique du moteur.
 * - Verrouillé : cloche et e-mail immédiats, quoi que le membre ait réglé.
 * - « Récapitulatif seulement » : un rythme « immédiat » est ramené au
 *   quotidien (jamais d'e-mail unitaire pour un favori).
 */
export function decisionCanaux(def: DefinitionEvenement, prefs: PreferencesMembre): CanalDecision {
  if (def.verrouille) return { site: true, email: 'immediat' };
  const p = preferenceEffective(prefs, def.rubrique);
  if (!p.email) return { site: p.site, email: 'aucun' };
  if (def.recapSeulement && p.rythme === 'immediat') return { site: p.site, email: 'quotidien' };
  return { site: p.site, email: p.rythme };
}

/** Clé de regroupement anti-rafale d'une notification, ou null si l'événement n'en a pas. */
export function cleDeGroupe(nom: string, def: DefinitionEvenement, donnees: DonneesEvenement): string | null {
  if (!def.groupeParCle) return null;
  const valeur = donnees[def.groupeParCle];
  return `${nom}:${valeur == null ? '' : String(valeur)}`;
}

/** Texte d'une notification, individuelle ou regroupée. */
export function composerNotification(def: DefinitionEvenement, donnees: DonneesEvenement): GabaritNotification {
  if ((donnees.nombre ?? 1) > 1 && def.gabaritGroupe) return def.gabaritGroupe(donnees);
  return def.gabarit(donnees);
}

/** Lien relatif de la notification : celui des données s'il y en a un, sinon celui du catalogue. */
export function lienNotification(def: DefinitionEvenement, donnees: DonneesEvenement): string | null {
  return donnees.lien ?? def.lien?.(donnees) ?? null;
}
