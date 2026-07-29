// Types des tables d'impersonation, déclarés à la main — volontairement.
//
// `lib/database.types.ts` est généré depuis la base live (`npm run gen:types`)
// et ne doit jamais être édité à la main : les colonnes/tables ajoutées par la
// migration d'impersonation y apparaîtront à la prochaine régénération. En
// attendant, ce module étend le type `Database` pour que les accès à
// `impersonation_sessions`, `impersonation_events` et à la colonne
// `profiles.impersonation_access` restent typés au lieu d'être des `any`.
//
// À la régénération des types, ce module reste valide (les définitions locales
// sont alors redondantes avec celles générées, sans conflit) et peut être
// réduit aux seuls alias exportés.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

// Niveau de droit d'un admin lorsqu'il se connecte en tant qu'un membre.
export type ImpersonationMode = 'read_only' | 'write';

export const IMPERSONATION_MODES: ImpersonationMode[] = ['read_only', 'write'];

export function isImpersonationMode(v: unknown): v is ImpersonationMode {
  return v === 'read_only' || v === 'write';
}

// Libellé affiché (bandeau, back-office).
export function modeLabel(mode: ImpersonationMode): string {
  return mode === 'write' ? 'Modification' : 'Lecture seule';
}

// Actions tracées. `session_start` / `session_end` bornent la connexion ;
// `write` et `write_blocked` tracent les écritures (abouties ou refusées).
export type ImpersonationAction =
  | 'link_created'
  | 'session_start'
  | 'session_end'
  | 'write'
  | 'write_blocked';

export type ImpersonationSessionRow = {
  id: string;
  admin_id: string;
  admin_email: string | null;
  target_user_id: string;
  target_email: string | null;
  target_name: string | null;
  mode: ImpersonationMode;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  ended_reason: string | null;
  expires_at: string;
};

type ImpersonationSessionInsert = {
  id?: string;
  admin_id: string;
  admin_email?: string | null;
  target_user_id: string;
  target_email?: string | null;
  target_name?: string | null;
  mode: ImpersonationMode;
  created_at?: string;
  started_at?: string | null;
  ended_at?: string | null;
  ended_reason?: string | null;
  expires_at: string;
};

type ImpersonationSessionUpdate = Partial<ImpersonationSessionInsert>;

export type ImpersonationEventRow = {
  id: number;
  session_id: string;
  created_at: string;
  action: ImpersonationAction;
  path: string | null;
  label: string | null;
};

type ImpersonationEventInsert = {
  id?: number;
  session_id: string;
  created_at?: string;
  action: ImpersonationAction;
  path?: string | null;
  label?: string | null;
};

type Table<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

type PublicSchema = Database['public'];
type Profiles = PublicSchema['Tables']['profiles'];

// `Database` augmenté des objets créés par la migration d'impersonation.
export type ImpersonationDatabase = Omit<Database, 'public'> & {
  public: Omit<PublicSchema, 'Tables'> & {
    Tables: Omit<PublicSchema['Tables'], 'profiles'> & {
      profiles: {
        Row: Profiles['Row'] & { impersonation_access: ImpersonationMode };
        Insert: Profiles['Insert'] & { impersonation_access?: ImpersonationMode };
        Update: Profiles['Update'] & { impersonation_access?: ImpersonationMode };
        Relationships: Profiles['Relationships'];
      };
      impersonation_sessions: Table<
        ImpersonationSessionRow,
        ImpersonationSessionInsert,
        ImpersonationSessionUpdate
      >;
      impersonation_events: Table<
        ImpersonationEventRow,
        ImpersonationEventInsert,
        Partial<ImpersonationEventInsert>
      >;
    };
  };
};

export type ImpersonationClient = SupabaseClient<ImpersonationDatabase>;

// Relit un client Supabase existant (navigateur ou serveur) avec le schéma
// étendu. Aucune conversion à l'exécution : uniquement du typage.
export function withImpersonationSchema(client: unknown): ImpersonationClient {
  return client as ImpersonationClient;
}
