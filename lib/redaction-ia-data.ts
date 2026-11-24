// Rédaction des textes par IA (JEP-414) — ce que l'éditeur doit savoir avant
// d'afficher ses boutons : le droit de la formule et le solde de crédits.
// Lecture d'affichage seule : la garde réelle est dans la route
// (`reserverCredits`, droit `redaction_ia` puis débit).
import 'server-only';
import { canAccess } from '@/lib/entitlements';
import { checkQuota, getEntitlements } from '@/lib/entitlements-data';
import { CLE_CREDITS_IA } from '@/lib/credits-ia';
import { DROIT_REDACTION, type EtatRedaction } from '@/lib/redaction-ia';

export type { EtatRedaction };

export async function etatRedaction(userId: string): Promise<EtatRedaction> {
  const droits = await getEntitlements(userId);
  const acces = canAccess(droits, DROIT_REDACTION);
  if (!acces) return { acces, credits: null };
  const q = await checkQuota(userId, CLE_CREDITS_IA);
  return { acces, credits: { limite: q.limit ?? null, utilises: q.usage ?? null } };
}
