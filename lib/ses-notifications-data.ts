// Accès à la table `email_suppressions` — écrite uniquement par le webhook
// SNS (`app/api/ses/webhook`), avec la clé service_role, même doctrine que le
// module contact (CLAUDE.md) : aucune policy RLS d'écriture, aucun accès
// direct par le navigateur. Lue par `lib/email.ts` avant chaque envoi.
import { createAdminClient } from '@/lib/supabase/admin';
import type { SesClient, SuppressionReason } from '@/lib/ses-types';

function client(): SesClient {
  return createAdminClient() as unknown as SesClient;
}

// Les bounces/complaints SES portent l'adresse telle que fournie à l'envoi ;
// la comparaison à la lecture doit ignorer casse et espaces superflus, sinon
// une suppression sur « Nom@Exemple.com » n'empêcherait pas un envoi
// ultérieur vers « nom@exemple.com ».
function normaliser(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Enregistre une adresse en échec définitif (bounce permanent ou plainte).
 * Best-effort — ne lève jamais : un enregistrement manqué dégrade la
 * protection de la réputation d'envoi, il ne doit jamais faire échouer le
 * traitement du webhook SNS (SNS réessaierait indéfiniment un webhook en
 * erreur).
 */
export async function enregistrerSuppression(email: string, reason: SuppressionReason): Promise<void> {
  try {
    const { error } = await client()
      .from('email_suppressions')
      .upsert({ email: normaliser(email), reason, last_event_at: new Date().toISOString() });
    if (error) throw error;
  } catch (e) {
    console.error(`ses-notifications: enregistrement de la suppression pour ${email} échoué :`, (e as Error).message);
  }
}

/**
 * `true` si l'adresse ne doit plus recevoir d'e-mail. Best-effort — une
 * panne de lecture laisse toujours passer l'envoi : cette table protège la
 * réputation d'envoi, elle ne doit jamais devenir un point de panne pour
 * l'envoi d'e-mails lui-même.
 */
export async function estSupprimee(email: string): Promise<boolean> {
  try {
    const { data, error } = await client()
      .from('email_suppressions')
      .select('email')
      .eq('email', normaliser(email))
      .maybeSingle();
    if (error) throw error;
    return !!data;
  } catch (e) {
    console.error(`ses-notifications: vérification de suppression pour ${email} échouée :`, (e as Error).message);
    return false;
  }
}
