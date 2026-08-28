'use client';

// Traduction, côté client, d'un refus de quota en message éducatif.
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

export async function translateQuotaError(rawMessage: string): Promise<string | null> {
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
