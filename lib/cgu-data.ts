// Acceptation des CGU (JEP-129) et attestation d'âge (JEP-34) — écriture
// serveur.
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
import { AGE_ATTESTATION_VERSION, metadonneesAttestationAge } from '@/lib/attestation-age';

/**
 * Trace l'acceptation des CGU ET l'attestation d'âge, en une seule écriture :
 * les deux cases sont cochées au même geste, deux appels pourraient laisser un
 * compte avec l'une sans l'autre si le second échouait.
 */
export async function enregistrerAcceptationsInscription(
  userId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    // GoTrue fusionne `user_metadata` clé à clé : le pseudo et le slug déjà
    // posés ne sont pas écrasés.
    const maintenant = new Date().toISOString();
    const { error } = await createAdminClient().auth.admin.updateUserById(userId, {
      user_metadata: { ...metadonneesAcceptationCgu(maintenant), ...metadonneesAttestationAge(maintenant) },
    });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.error('enregistrerAcceptationsInscription:', (e as Error).message);
    return { ok: false, message: "L'acceptation des conditions n'a pas pu être enregistrée. Réessayez." };
  }
}

/**
 * Inscrit la déclaration d'âge sur le profil (JEP-270) : `age_attested_at` et
 * `age_attestation_version`. On ne conserve JAMAIS l'âge ni la date de
 * naissance — seulement la date à laquelle le membre a certifié la condition,
 * et la version du texte certifié. Clé service_role : un membre ne l'écrit pas
 * lui-même (garde en base, `profiles_guard_age_attestation`).
 *
 * Best-effort : colonne pas encore créée (migration pas jouée) ou échec → on
 * journalise sans bloquer l'inscription ; la trace des métadonnées du compte
 * demeure. Appelée APRÈS l'écriture du pseudo, qui crée/complète la ligne.
 */
export async function enregistrerAttestationAgeProfil(userId: string, quand: string): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from('profiles')
      .update({ age_attested_at: quand, age_attestation_version: AGE_ATTESTATION_VERSION } as never)
      .eq('id', userId);
    if (error) console.warn('[age] profiles.age_attested_at non écrite :', error.message);
  } catch (e) {
    console.warn('[age] profiles.age_attested_at non écrite :', (e as Error).message);
  }
}
