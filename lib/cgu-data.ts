// Acceptation des CGU — écriture serveur (JEP-129).
//
// Séparé de `lib/cgu.ts` (pur, lu par des Client Components) : ce module tire
// la clé service_role, qui ne doit jamais atteindre le bundle navigateur.
//
// Utilisé par `/api/pseudo/choisir`, c'est-à-dire par le chemin des comptes
// qui n'ont PAS vu la case de `LoginForm` — une première connexion Google,
// essentiellement. L'inscription par e-mail, elle, pose la trace dans les
// métadonnées dès `signUp` : il n'y a pas encore de session à ce moment-là.
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { metadonneesAcceptationCgu } from '@/lib/cgu';

export async function enregistrerAcceptationCgu(
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    // GoTrue fusionne `user_metadata` clé à clé : le pseudo et le slug déjà
    // posés ne sont pas écrasés.
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
      user_metadata: metadonneesAcceptationCgu(new Date().toISOString()),
    });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error('enregistrerAcceptationCgu:', (e as Error).message);
    return { ok: false, message: "L'acceptation des conditions n'a pas pu être enregistrée. Réessayez." };
  }
}
