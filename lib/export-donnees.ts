// Export des données d'un membre (RGPD, art. 15 et 20 — JEP-362) — logique
// PURE, importable par les composants client comme par le serveur. La lecture
// est dans `lib/export-donnees-data.ts` (clé service_role), motif
// anonymisation.ts / anonymisation-data.ts.
//
// Deux portes, un seul contenu : l'admin depuis la fiche membre
// (`POST /api/admin/membres/[id]/exporter`) et le membre lui-même depuis
// `/reglages` (`POST /api/compte/exporter`, une fois par 24 h). Chaque export
// laisse une ligne au journal de modération (`export_donnees`).
//
// Deux règles tiennent tout le module :
// - **rien d'un autre membre** au-delà du nom affiché d'un pâtissier suivi ou
//   d'une personne avec qui un partage existe : les colonnes qui désignent un
//   tiers (admin, auteur d'une recette source…) sont retirées
//   (`COLONNES_RETIREES`), les identifiants d'un suivi ou d'un partage sont
//   remplacés par le nom affiché (`remplacerParNom`) ; les abonnés du membre,
//   les avis reçus et les notifications reçues (qui nomment d'autres membres)
//   ne sont pas exportés ;
// - **un export incomplet n'est jamais rendu comme complet** : une lecture en
//   échec arrête l'export (seule une table absente — migration pas jouée — est
//   ignorée). La réponse est due sous un mois : mieux vaut un refus qu'on
//   relance qu'une archive qui omet en silence.
//
// **Une table ajoutée plus tard qui porte une donnée personnelle doit entrer
// ici** (rubrique + lecture), comme dans `TABLES_A_VIDER` de l'anonymisation.

/** Version du format de l'archive : à incrémenter si une rubrique change de forme. */
export const VERSION_EXPORT = 1;

/** Action du journal `member_moderation_events`. */
export const ACTION_JOURNAL_EXPORT = 'export_donnees';

export const MOTIF_EXPORT_ADMIN = 'Export des données du membre par un administrateur (RGPD)';
export const MOTIF_EXPORT_MEMBRE = 'Export de ses données par le membre (RGPD)';

/** Libre-service : un export par membre et par 24 heures. */
export const DELAI_EXPORT_MEMBRE_MS = 24 * 60 * 60 * 1000;

/** Texte de remplacement d'une image enregistrée en data-URL (photos hors périmètre). */
export const IMAGE_NON_EXPORTEE = '[image intégrée, non exportée]';

export type OrigineExport = 'admin' | 'membre';

/**
 * Rubriques de l'archive, dans l'ordre où elles apparaissent. L'explication
 * est recopiée dans l'en-tête du fichier : le JSON doit se lire seul.
 */
export const RUBRIQUES = [
  {
    cle: 'compte',
    titre: 'Compte',
    description:
      'Votre compte de connexion (adresse e-mail, dates d’inscription et de dernière connexion, mode de connexion, ' +
      'acceptation des CGU et déclaration d’âge), votre profil (pseudo, adresse publique, présentation, liens, ' +
      'statut) et, le cas échéant, votre invitation. Le mot de passe n’est jamais exporté : nous n’en gardons ' +
      'qu’une empreinte.',
  },
  {
    cle: 'recettes',
    titre: 'Recettes',
    description:
      'Toutes vos recettes, quel que soit leur statut (brouillon, publiée, privée, projet), avec leurs étapes, ' +
      'sous-étapes, photos d’étape (adresses), groupes d’ingrédients, ingrédients, ustensiles et catégories.',
  },
  {
    cle: 'projets',
    titre: 'Projets de dessert',
    description:
      'Pour chaque recette créée en mode projet : l’intention rédigée et les préparations qui la composent. ' +
      'Le nom de l’auteur d’une recette dont une préparation a été copiée n’y figure pas.',
  },
  {
    cle: 'listes_de_recettes',
    titre: 'Listes de recettes',
    description: 'Vos listes (dont la liste CAP) et les recettes que vous y avez rangées (identifiants).',
  },
  {
    cle: 'fournees',
    titre: 'Fournées',
    description:
      'Vos fournées : copie de la recette adaptée, ajustement, étapes, sous-étapes, ingrédients, ustensiles, ' +
      'avancement, notes et commentaires du jour J.',
  },
  {
    cle: 'avis',
    titre: 'Avis',
    description: 'Les notes et commentaires que vous avez laissés sur des recettes, avec leur statut de modération.',
  },
  {
    cle: 'idees',
    titre: 'Boîte à idées',
    description: 'Les idées que vous avez proposées et celles pour lesquelles vous avez voté.',
  },
  {
    cle: 'favoris',
    titre: 'Favoris',
    description: 'Les recettes que vous avez mises en favori (identifiants et date).',
  },
  {
    cle: 'abonnements_patissiers',
    titre: 'Pâtissiers suivis',
    description:
      'Les pâtissiers que vous suivez (nom affiché et date). Vos propres abonnés ne sont donnés qu’en nombre : ' +
      'la liste de leurs noms est une donnée qui les concerne.',
  },
  {
    cle: 'partages',
    titre: 'Partages',
    description:
      'Les partages de votre carnet et de vos recettes que vous avez accordés, et ceux que vous avez reçus, ' +
      'avec le nom affiché de l’autre membre.',
  },
  {
    cle: 'listes_de_courses',
    titre: 'Listes de courses',
    description: 'Vos listes de courses et leurs articles.',
  },
  {
    cle: 'imports',
    titre: 'Imports de recettes',
    description: 'Les recettes importées (texte, photos ou PDF) : source, brouillon produit par l’IA, statut.',
  },
  {
    cle: 'demandes_de_contact',
    titre: 'Demandes de contact',
    description:
      'Vos demandes envoyées par le formulaire de contact, les réponses échangées, l’historique de leur ' +
      'statut et les adresses des photos jointes. L’adresse IP n’est conservée que sous forme d’empreinte.',
  },
  {
    cle: 'abonnement_payant',
    titre: 'Abonnement',
    description:
      'Formules souscrites, historique, demandes de souscription, essais, identifiant client chez notre ' +
      'prestataire de paiement et e-mails d’abonnement envoyés. Nous ne détenons aucune donnée bancaire.',
  },
  {
    cle: 'notifications',
    titre: 'Notifications',
    description:
      'Vos préférences de notification et les appareils sur lesquels vous les avez activées (type de navigateur ' +
      'et date ; les clés techniques de chiffrement ne sont pas reprises). Les notifications reçues ne sont pas ' +
      'exportées : elles nomment d’autres membres.',
  },
  {
    cle: 'journal_moderation',
    titre: 'Journal de modération',
    description:
      'Les décisions qui concernent votre compte (suspension, levée, confirmation d’adresse, export de données…), ' +
      'sans le nom de l’administrateur.',
  },
  {
    cle: 'donnees_techniques',
    titre: 'Données techniques',
    description:
      'Historique de connexion (début, dernière activité, nombre de pages vues), affichages et clics sur les ' +
      'encarts partenaires, utilisation des fonctions d’IA et compteurs d’usage de votre formule.',
  },
] as const;

export type CleRubrique = (typeof RUBRIQUES)[number]['cle'];

/** Ce que l'archive ne contient pas, et pourquoi (repris dans l'en-tête). */
export const NON_INCLUS: string[] = [
  'Les photos elles-mêmes : seules leurs adresses sont fournies. Une image enregistrée directement dans la base est remplacée par « ' +
    IMAGE_NON_EXPORTEE +
    ' ».',
  'Le mot de passe : nous n’en conservons qu’une empreinte, inutilisable.',
  'Les données d’autres membres : vos abonnés (nombre seulement), les avis reçus sur vos recettes, les notifications reçues, le nom des administrateurs.',
  'Les journaux techniques du serveur (adresses IP de connexion), conservés à part pour la sécurité du service.',
];

/**
 * Colonnes jamais exportées, par table : identifiants d'un autre membre
 * (admin, auteur d'une recette source), colonnes techniques de recherche,
 * compteurs morts, clés de chiffrement des appareils.
 */
export const COLONNES_RETIREES: Record<string, string[]> = {
  profiles: ['full_name_norm', 'followers_count', 'following_count'],
  recipes: ['fts', 'title_norm'],
  ideas: ['fts'],
  recipe_project_components: ['source_author_id', 'source_author_name'],
  subscriptions: ['created_by'],
  subscription_requests: ['processed_by'],
  member_moderation_events: ['admin_id'],
  contact_replies: ['author_id'],
  contact_status_history: ['author_id'],
  push_subscriptions: ['p256dh', 'auth', 'endpoint'],
};

type Ligne = Record<string, unknown>;

/** Une valeur est-elle une image en data-URL (photos hors périmètre, et trop lourdes) ? */
function estDataUrlImage(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image');
}

/** Retire les colonnes interdites de `table` et remplace les data-URL d'image. Ne modifie pas l'entrée. */
export function nettoyer<T extends Ligne>(lignes: T[], table: string): Ligne[] {
  const retirees = new Set(COLONNES_RETIREES[table] ?? []);
  return lignes.map((l) => {
    const sortie: Ligne = {};
    for (const [k, v] of Object.entries(l)) {
      if (retirees.has(k)) continue;
      sortie[k] = estDataUrlImage(v) ? IMAGE_NON_EXPORTEE : v;
    }
    return sortie;
  });
}

/**
 * Remplace l'identifiant d'un autre membre (`colonne`) par son nom affiché
 * (`cible`). L'identifiant disparaît : seul le nom est une donnée que le
 * membre connaît déjà (il l'a suivi, ou partagé avec lui).
 */
export function remplacerParNom(lignes: Ligne[], colonne: string, noms: Map<string, string>, cible: string): Ligne[] {
  return lignes.map((l) => {
    const { [colonne]: id, ...reste } = l;
    return { ...reste, [cible]: (typeof id === 'string' && noms.get(id)) || 'Membre inconnu' };
  });
}

/** Regroupe `enfants` sous `parents` (clé `cle`), par la colonne `lien` qui vise `parents[].id`. */
export function imbriquer(parents: Ligne[], enfants: Ligne[], lien: string, cle: string): Ligne[] {
  const parId = new Map<unknown, Ligne[]>();
  for (const e of enfants) {
    const k = e[lien];
    const liste = parId.get(k);
    if (liste) liste.push(e);
    else parId.set(k, [e]);
  }
  return parents.map((p) => ({ ...p, [cle]: (parId.get(p.id) ?? []).map(({ [lien]: _l, ...reste }) => reste) }));
}

/** Tri par `order_index` (puis rien), sans modifier l'entrée : l'archive suit l'ordre de l'écran. */
export function parOrdre(lignes: Ligne[]): Ligne[] {
  return [...lignes].sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
}

/** Le délai minimum entre deux exports en libre-service est-il écoulé ? */
export function exportAutorise(
  derniere: string | null,
  maintenant: Date = new Date(),
): { ok: true } | { ok: false; prochainLe: Date } {
  if (!derniere) return { ok: true };
  const t = Date.parse(derniere);
  if (Number.isNaN(t)) return { ok: true };
  const ecoule = maintenant.getTime() - t;
  if (ecoule >= DELAI_EXPORT_MEMBRE_MS) return { ok: true };
  // Une date dans le futur (horloge déréglée) ne bloque jamais plus d'un délai.
  return { ok: false, prochainLe: new Date(maintenant.getTime() + Math.min(DELAI_EXPORT_MEMBRE_MS, DELAI_EXPORT_MEMBRE_MS - ecoule)) };
}

/** Nom du fichier téléchargé : `je-patisse-donnees-<slug>-<AAAA-MM-JJ>.json`. */
export function nomFichierExport(slug: string | null | undefined, date: Date): string {
  const propre = (slug ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40) || 'membre';
  return `je-patisse-donnees-${propre}-${date.toISOString().slice(0, 10)}.json`;
}

export type ArchiveExport = {
  a_propos: {
    titre: string;
    service: string;
    genere_le: string;
    version_format: number;
    demande_par: string;
    identifiant_membre: string;
    explication: string;
    rubriques: Record<string, string>;
    non_inclus: string[];
  };
  donnees: Record<CleRubrique, unknown>;
};

/** Assemble l'archive : en-tête explicatif, puis chaque rubrique dans l'ordre de `RUBRIQUES`. */
export function composerArchive(p: {
  membreId: string;
  origine: OrigineExport;
  genereLe: Date;
  donnees: Record<CleRubrique, unknown>;
}): ArchiveExport {
  const rubriques: Record<string, string> = {};
  const donnees = {} as Record<CleRubrique, unknown>;
  for (const r of RUBRIQUES) {
    rubriques[r.cle] = `${r.titre} — ${r.description}`;
    donnees[r.cle] = p.donnees[r.cle] ?? null;
  }
  return {
    a_propos: {
      titre: 'Vos données personnelles sur Je pâtisse !',
      service: 'Je pâtisse ! — www.jepatisse.com',
      genere_le: p.genereLe.toISOString(),
      version_format: VERSION_EXPORT,
      demande_par: p.origine === 'membre' ? 'le membre' : 'un administrateur, à la demande du membre',
      identifiant_membre: p.membreId,
      explication:
        'Ce fichier contient une copie de toutes les données personnelles que Je pâtisse ! détient sur votre compte ' +
        '(RGPD, articles 15 et 20). Il est au format JSON, lisible par tout éditeur de texte et réutilisable par un ' +
        'autre service. Les dates sont en temps universel (UTC). Chaque rubrique de « donnees » est expliquée ' +
        'ci-dessous ; les champs portent les noms des colonnes de notre base.',
      rubriques,
      non_inclus: NON_INCLUS,
    },
    donnees,
  };
}
