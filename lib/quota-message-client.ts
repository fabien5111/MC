'use client';

// Traduction, côté client, d'un refus de quota — ou d'un refus d'un compte
// bloqué (JEP-272) — en message éducatif.
//
// Extrait de `lib/use-mutation.ts` pour être réutilisable par les écritures
// qui ne passent pas par `useMutation` — celles qui enchaînent plusieurs
// requêtes avec une gestion d'erreur spécifique (l'éditeur de recette, la
// création d'une fournée) et sont donc explicitement hors périmètre du hook.
// Composer le message exige la grille et le plan courant, tous deux
// server-only : d'où l'aller-retour vers /api/quota-message plutôt qu'un
// calcul ici.
//
// Best-effort : si la traduction échoue, `null` laisse l'appelant retomber
// sur son message d'erreur habituel — dégradé, jamais silencieux.
import { quotaFailure } from '@/lib/entitlements';
import { estRefusCompteBloque, MESSAGE_COMPTE_BLOQUE } from '@/lib/moderation';

export async function translateQuotaError(rawMessage: string): Promise<string | null> {
  // Pas un quota, mais le même besoin et les mêmes appelants : un compte
  // suspendu ou désactivé (JEP-272) dont l'écriture est refusée par la RLS
  // reçoit le nom d'une policy PostgreSQL. Calcul pur, aucun appel réseau.
  if (estRefusCompteBloque(rawMessage)) return MESSAGE_COMPTE_BLOQUE;
  if (!quotaFailure({ message: rawMessage })) return null;
  try {
    const r = await fetch('/api/quota-message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ raw: rawMessage }),
    });
    const data = await r.json();
    return typeof data?.message === 'string' ? data.message : null;
  } catch {
    return null;
  }
}
