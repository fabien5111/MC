// Type de la table `email_suppressions`, déclaré à la main — sur le motif de
// `lib/impersonation-types.ts` : au moment où ce code est écrit, la table
// n'existe pas encore dans la base (migration SQL affichée dans la
// conversation, à exécuter par un administrateur). `lib/database.types.ts`
// ne doit jamais être édité à la main, seulement régénéré
// (`npm run gen:types`) une fois la migration passée. En attendant, cette
// déclaration garde les accès typés au lieu de tomber en `any`. Une fois les
// types régénérés, ce module devient redondant avec la définition générée,
// sans conflit — il peut alors être supprimé.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

// `bounce_permanent` : la boîte du destinataire n'existe plus / refuse
// définitivement (SES `bounceType: 'Permanent'`). `complaint` : le
// destinataire a signalé l'e-mail comme indésirable. Les bounces
// transitoires (boîte pleine, serveur temporairement indisponible) ne sont
// jamais enregistrés ici : ce ne sont pas des échecs définitifs.
export type SuppressionReason = 'bounce_permanent' | 'complaint';

export type EmailSuppressionRow = {
  email: string;
  reason: SuppressionReason;
  last_event_at: string;
  created_at: string;
};

type EmailSuppressionInsert = {
  email: string;
  reason: SuppressionReason;
  last_event_at?: string;
  created_at?: string;
};

type SesDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & {
    Tables: Database['public']['Tables'] & {
      email_suppressions: {
        Row: EmailSuppressionRow;
        Insert: EmailSuppressionInsert;
        Update: Partial<EmailSuppressionInsert>;
        Relationships: [];
      };
    };
  };
};

export type SesClient = SupabaseClient<SesDatabase>;
