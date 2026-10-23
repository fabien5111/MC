// Lecture de la confirmation d'e-mail dans GoTrue (JEP-262) — serveur seulement.
//
// `auth.users` n'est joignable ni en SQL (pgweb n'a pas accès au schéma
// `auth`, le port 5432 est fermé) ni par PostgREST : seule l'API
// d'administration GoTrue, avec la clé service_role, le dit. `profiles.id` est
// l'`id` du compte `auth.users` (clé partagée, posée par `handle_new_user`).
//
// Best-effort : une panne de GoTrue ou une clé absente rend `null`, c'est-à-dire
// « inconnu » — la liste des membres s'affiche sans badge plutôt que de casser.
import { createAdminClient } from '@/lib/supabase/admin';
import { confirmationDe, confirmationsParId } from '@/lib/email-confirmation';

const PAR_PAGE = 1000;
// Garde-fou : 50 000 comptes. Au-delà, mieux vaut rendre ce qu'on a lu (le
// reste vaut « inconnu ») que boucler indéfiniment sur une API qui dérape.
const PAGES_MAX = 50;

/** `id → confirmé` pour tous les comptes, ou `null` si GoTrue n'a pas répondu. */
export async function lireConfirmationsEmail(): Promise<Map<string, boolean> | null> {
  try {
    const admin = createAdminClient();
    const utilisateurs: { id: string; email_confirmed_at?: string | null }[] = [];
    for (let page = 1; page <= PAGES_MAX; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAR_PAGE });
      if (error) throw error;
      utilisateurs.push(...data.users);
      if (data.users.length < PAR_PAGE) break;
    }
    return confirmationsParId(utilisateurs);
  } catch (e) {
    console.error('lireConfirmationsEmail:', (e as Error).message);
    return null;
  }
}

/** Confirmation d'UN compte (fiche membre) : `null` si inconnu ou GoTrue muet. */
export async function lireConfirmationEmail(userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await createAdminClient().auth.admin.getUserById(userId);
    if (error) throw error;
    return confirmationDe(data.user);
  } catch (e) {
    console.error('lireConfirmationEmail:', (e as Error).message);
    return null;
  }
}
