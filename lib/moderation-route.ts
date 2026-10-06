// Garde « compte bloqué » pour les Route Handlers (JEP-272).
//
// Séparé de `lib/moderation-data.ts` parce qu'il importe `NextResponse` et
// `lib/auth` — même découpage que `lib/quota-route.ts`.
//
// **À appeler dans toute route qui agit pour un membre** : la RLS
// (`public.is_blocked_user()`) refuse déjà les écritures faites avec la
// session, mais pas celles faites avec la clé service_role, qui la
// contournent, ni les appels IA facturés qui n'écrivent rien. Restent
// volontairement ouvertes à un compte bloqué : `/api/contact` (c'est le
// recours indiqué par l'écran « Compte suspendu »), la résiliation et le
// portail d'abonnement (droit du consommateur), l'alerte de changement de
// mot de passe.
import { NextResponse } from 'next/server';
import { getProfile } from '@/lib/auth';
import { estBloque } from '@/lib/moderation';
import { getEtatModeration } from '@/lib/moderation-data';

export const MESSAGE_COMPTE_BLOQUE = 'Votre compte est suspendu ou désactivé : cette action est impossible.';

export async function compteBloque(userId: string): Promise<boolean> {
  const profil = await getProfile(userId);
  return estBloque(await getEtatModeration(userId, profil?.status));
}

/**
 * Réponse 403 si le compte est bloqué, `null` sinon. `cle` est le nom du champ
 * d'erreur attendu par l'appelant (`erreur` sur la plupart des routes,
 * `message` sur celles du pseudo).
 */
export async function refusSiCompteBloque(userId: string, cle: 'erreur' | 'message' = 'erreur'): Promise<NextResponse | null> {
  if (!(await compteBloque(userId))) return null;
  const corps = cle === 'message' ? { ok: false, message: MESSAGE_COMPTE_BLOQUE } : { erreur: MESSAGE_COMPTE_BLOQUE };
  return NextResponse.json({ ...corps, code: 'COMPTE_BLOQUE' }, { status: 403 });
}
