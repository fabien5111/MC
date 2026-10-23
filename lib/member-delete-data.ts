// Suppression complète d'un membre inscrit — serveur seulement, clé service_role.
//
// Chemin UNIQUE : la route `POST /api/admin/delete-member` (geste d'un admin) et
// la purge automatique des comptes non confirmés (JEP-262, lot 4) passent ici,
// pour qu'aucune des deux n'ait sa propre variante de suppression.
//
// Le compte d'authentification d'abord : s'il subsiste, le membre peut encore se
// reconnecter, et le profil serait recréé au vol par /profil. Un 404 signale un
// compte déjà absent (suppression partielle antérieure) — ce n'est pas une
// erreur, on poursuit le ménage. Puis la ligne `profiles`, sans effet si la clé
// étrangère l'a déjà supprimée en cascade.
import type { createAdminClient } from '@/lib/supabase/admin';

export type ResultatSuppression = { ok: true } | { ok: false; erreur: string; status: number };

export async function supprimerCompteMembre(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
): Promise<ResultatSuppression> {
  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error && error.status !== 404) {
    return { ok: false, erreur: `Suppression du compte de connexion impossible : ${error.message}`, status: 502 };
  }

  const { error: profileError } = await admin.from('profiles').delete().eq('id', profileId);
  if (profileError) {
    return { ok: false, erreur: `Suppression du profil impossible : ${profileError.message}`, status: 500 };
  }
  return { ok: true };
}
