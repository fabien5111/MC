// Types des trois tables du module « contact », déclarés à la main —
// volontairement, et temporairement.
//
// `lib/database.types.ts` est généré depuis la base live (`npm run gen:types`)
// et ne doit jamais être édité à la main : les tables créées par la migration
// de ce chantier y apparaîtront à la prochaine régénération. En attendant, ce
// module étend le type `Database` pour que les accès restent typés au lieu de
// tomber dans le `from('x' as never) as unknown as …` qu'on trouve encore sur
// `notifications` et `recipe_analysis`.
//
// Motif exact de `lib/impersonation-types.ts`, et pour la même raison : à la
// régénération des types, ce module reste valide (les définitions locales
// deviennent redondantes, sans conflit) et se réduit alors à ses seuls alias.
//
// L'extension part d'`ImpersonationDatabase` et non de `Database` : c'est le
// schéma que `createAdminClient()` rend déjà, et les routes de ce module
// écrivent avec ce client-là. Repartir de `Database` obligerait à choisir
// entre les deux jeux de tables sur un même client.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImpersonationDatabase } from '@/lib/impersonation-types';
import type {
  AuthorKind,
  ContactStatus,
  ContactType,
  EmailStatus,
  JiraSyncStatus,
  SourceStatut,
} from '@/lib/contact';

// ─────────────────────────────────────────────────────────────────────────
// contact_messages
// ─────────────────────────────────────────────────────────────────────────

export type ContactMessageRow = {
  id: string;
  /** `REF-A7F3K2` — index unique, communiquée au demandeur et portée par le ticket Jira. */
  reference: string;
  created_at: string;

  // ── Suivi ──
  status: ContactStatus;
  status_updated_at: string;
  /** `'admin' | 'jira-webhook' | 'jira-sync'` — dernière origine du statut courant. */
  status_source: SourceStatut | null;
  /** Renseigné au passage en `termine`, effacé au retour en arrière. Point de départ de la purge. */
  closed_at: string | null;
  admin_notes: string | null;

  // ── Demandeur ──
  user_id: string | null;
  /**
   * Copié même pour un membre connecté : `user_id` est en `ON DELETE SET NULL`
   * et répondre exige une adresse — sans copie, supprimer un compte rendrait
   * une demande en cours irrépondable.
   */
  email: string | null;
  type: ContactType;
  subject: string;
  message: string;

  // ── Contexte technique ──
  page_url: string | null;
  /** Déjà réduit par `reduireUserAgent` : le user-agent brut n'est jamais stocké. */
  browser_context: string | null;
  app_version: string | null;
  /** Haché avec `IP_HASH_SALT`. Purgé à 30 jours d'après `created_at`. */
  ip_hash: string | null;

  // ── Jira ──
  jira_issue_key: string | null;
  jira_sync_status: JiraSyncStatus;
  /** Nom exact du statut Jira au dernier passage. */
  jira_status: string | null;
  /** Id du statut Jira — survit à un renommage, d'où sa priorité sur le nom. */
  jira_status_id: string | null;
  jira_synced_at: string | null;
  jira_error: string | null;

  // ── Notification administrateur ──
  admin_notified_at: string | null;
  admin_notify_error: string | null;

  // ── E-mail de déploiement au demandeur ──
  /** Interrupteur préventif : seul moyen d'empêcher l'e-mail, l'envoi étant immédiat. */
  deploy_notify: boolean;
  deploy_email_status: EmailStatus;
  deploy_email_sent_at: string | null;
  deploy_email_error: string | null;
};

// Seuls les champs sans valeur par défaut en base sont obligatoires.
export type ContactMessageInsert = {
  id?: string;
  reference: string;
  created_at?: string;

  status?: ContactStatus;
  status_updated_at?: string;
  status_source?: SourceStatut | null;
  closed_at?: string | null;
  admin_notes?: string | null;

  user_id?: string | null;
  email?: string | null;
  type: ContactType;
  subject: string;
  message: string;

  page_url?: string | null;
  browser_context?: string | null;
  app_version?: string | null;
  ip_hash?: string | null;

  jira_issue_key?: string | null;
  jira_sync_status?: JiraSyncStatus;
  jira_status?: string | null;
  jira_status_id?: string | null;
  jira_synced_at?: string | null;
  jira_error?: string | null;

  admin_notified_at?: string | null;
  admin_notify_error?: string | null;

  deploy_notify?: boolean;
  deploy_email_status?: EmailStatus;
  deploy_email_sent_at?: string | null;
  deploy_email_error?: string | null;
};

export type ContactMessageUpdate = Partial<ContactMessageInsert>;

// ─────────────────────────────────────────────────────────────────────────
// contact_replies
// ─────────────────────────────────────────────────────────────────────────

export type ContactReplyRow = {
  id: string;
  message_id: string;
  created_at: string;
  author_id: string | null;
  /** Qui a écrit cette entrée du fil — l'administrateur ou le demandeur lui-même (lot 9). */
  author_kind: AuthorKind;
  /** Texte brut. La conversion en HTML se fait à l'envoi, côté serveur — jamais de HTML libre saisi par l'administrateur. */
  body: string;
  /** Sans objet pour une réponse du demandeur (`'skipped'` — aucun e-mail à lui envoyer pour son propre message). */
  email_status: EmailStatus;
  sent_at: string | null;
  provider_id: string | null;
  error: string | null;
  /** `'not_applicable'` hors signalement de bug ou tant qu'aucun ticket n'existe encore (lot 10). */
  jira_comment_status: JiraSyncStatus;
  jira_comment_error: string | null;
};

export type ContactReplyInsert = {
  id?: string;
  message_id: string;
  created_at?: string;
  author_id?: string | null;
  author_kind?: AuthorKind;
  body: string;
  email_status?: EmailStatus;
  sent_at?: string | null;
  provider_id?: string | null;
  error?: string | null;
  jira_comment_status?: JiraSyncStatus;
  jira_comment_error?: string | null;
};

export type ContactReplyUpdate = Partial<ContactReplyInsert>;

// ─────────────────────────────────────────────────────────────────────────
// contact_reply_photos
// ─────────────────────────────────────────────────────────────────────────

// Même doctrine que `contact_message_photos` (§15) : jamais transmises à
// Jira, visibles uniquement dans les fiches admin et membre. Table séparée
// plutôt qu'une colonne nullable sur `contact_message_photos` — ne mélange
// pas deux parents (message vs réponse) dans la même table.
export type ContactReplyPhotoRow = {
  id: string;
  reply_id: string;
  url: string;
  order_index: number;
  created_at: string;
};

export type ContactReplyPhotoInsert = {
  id?: string;
  reply_id: string;
  url: string;
  order_index?: number;
  created_at?: string;
};

export type ContactReplyPhotoUpdate = Partial<ContactReplyPhotoInsert>;

// ─────────────────────────────────────────────────────────────────────────
// contact_status_history
// ─────────────────────────────────────────────────────────────────────────

// Tout changement de statut y est écrit, quelle qu'en soit l'origine : c'est
// la seule façon de comprendre après coup pourquoi une demande est là où elle
// est — et notamment de distinguer une clôture manuelle d'une clôture venue
// de Jira, dont dépend l'envoi de l'e-mail au membre.
export type ContactStatusHistoryRow = {
  id: string;
  message_id: string;
  changed_at: string;
  from_status: ContactStatus | null;
  to_status: ContactStatus;
  source: SourceStatut;
  /** Nom du statut Jira ayant provoqué le changement, quand il vient de Jira. */
  jira_status: string | null;
  author_id: string | null;
};

export type ContactStatusHistoryInsert = {
  id?: string;
  message_id: string;
  changed_at?: string;
  from_status?: ContactStatus | null;
  to_status: ContactStatus;
  source: SourceStatut;
  jira_status?: string | null;
  author_id?: string | null;
};

export type ContactStatusHistoryUpdate = Partial<ContactStatusHistoryInsert>;

// ─────────────────────────────────────────────────────────────────────────
// contact_message_photos
// ─────────────────────────────────────────────────────────────────────────

// Ne partent JAMAIS vers Jira (docs/contact-jira.md) : une capture d'écran
// peut montrer un pseudo, un e-mail affiché à l'écran, le nom d'un autre
// membre — l'inverse de ce que le ticket garantit. Visibles uniquement dans
// le back-office ; `url` porte une data-URL (lignes antérieures au B2) ou
// l'URL canonique du conteneur PRIVÉ `jp-contact` (§ 7.5, lot B2 étape 4) —
// dans les deux cas, jamais directement affichable telle quelle côté lecture :
// `lib/contact-data.ts` `signerPhotoContact` la re-signe avant tout rendu.
export type ContactMessagePhotoRow = {
  id: string;
  message_id: string;
  url: string;
  order_index: number;
  created_at: string;
};

export type ContactMessagePhotoInsert = {
  id?: string;
  message_id: string;
  url: string;
  order_index?: number;
  created_at?: string;
};

export type ContactMessagePhotoUpdate = Partial<ContactMessagePhotoInsert>;

// ─────────────────────────────────────────────────────────────────────────
// Schéma étendu
// ─────────────────────────────────────────────────────────────────────────

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type ImpersonationPublic = ImpersonationDatabase['public'];

export type ContactDatabase = Omit<ImpersonationDatabase, 'public'> & {
  public: Omit<ImpersonationPublic, 'Tables'> & {
    Tables: ImpersonationPublic['Tables'] & {
      contact_messages: Table<ContactMessageRow, ContactMessageInsert, ContactMessageUpdate>;
      contact_replies: Table<ContactReplyRow, ContactReplyInsert, ContactReplyUpdate>;
      contact_status_history: Table<
        ContactStatusHistoryRow,
        ContactStatusHistoryInsert,
        ContactStatusHistoryUpdate
      >;
      contact_message_photos: Table<
        ContactMessagePhotoRow,
        ContactMessagePhotoInsert,
        ContactMessagePhotoUpdate
      >;
      contact_reply_photos: Table<
        ContactReplyPhotoRow,
        ContactReplyPhotoInsert,
        ContactReplyPhotoUpdate
      >;
    };
  };
};

export type ContactClient = SupabaseClient<ContactDatabase>;

// Relit un client Supabase existant (celui de `createAdminClient()`, ou le
// client serveur d'un rendu de page) avec le schéma étendu. Aucune conversion
// à l'exécution : uniquement du typage — même contrat que
// `withImpersonationSchema`.
export function withContactSchema(client: unknown): ContactClient {
  return client as ContactClient;
}
