// Listes de recettes (JEP-376) — gardes communes des routes `/api/listes/*`.
//
// Séparé de `lib/recipe-lists-data.ts` parce qu'il importe `NextResponse` —
// même découpage que `lib/moderation-route.ts` / `lib/quota-route.ts`.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { refusSiCompteBloque } from '@/lib/moderation-route';

/**
 * Membre autorisé à écrire dans ses listes : connecté, compte non bloqué,
 * session qui n'est pas une connexion « en tant que » en lecture seule. Rend
 * l'identifiant du membre, ou la réponse de refus.
 */
export async function membreEcrivain(): Promise<{ userId: string } | { refus: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { refus: NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 }) };
  const bloque = await refusSiCompteBloque(user.id);
  if (bloque) return { refus: bloque };
  if (await isReadOnlySession()) {
    return { refus: NextResponse.json({ erreur: 'Session de consultation (lecture seule).' }, { status: 403 }) };
  }
  return { userId: user.id };
}
