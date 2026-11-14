// Stockages en ligne (JEP-408) — garde commune des routes `/api/stockage/en-ligne/*`.
//
// Ces routes ne font que relayer un fournisseur (Notion, médias Google
// Photos) pour le membre, sans rien écrire : elles exigent pourtant la même
// garde qu'une écriture — connecté, compte non bloqué, session qui n'est pas
// une connexion « en tant que » en lecture seule — puisque leur seul usage est
// de préparer un dépôt de photo ou un import. Puis le droit de la formule,
// revérifié ici : le bouton grisé du navigateur n'est qu'un affichage.
import { NextResponse } from 'next/server';
import { verifierAcces } from '@/lib/quota-route';
import { membreEcrivain } from '@/lib/recipe-lists-route';
import { DROIT_STOCKAGE_EN_LIGNE } from '@/lib/stockage-en-ligne';

export async function membreStockage(): Promise<{ userId: string } | { refus: NextResponse }> {
  const membre = await membreEcrivain();
  if ('refus' in membre) return membre;
  const refus = await verifierAcces(membre.userId, DROIT_STOCKAGE_EN_LIGNE);
  if (refus) return { refus };
  return membre;
}

/** Jeton d'accès transmis par le navigateur : jamais journalisé, jamais conservé. */
export function jetonDepuis(requete: Request): string | null {
  const entete = requete.headers.get('authorization') ?? '';
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{10,4096})$/.exec(entete.trim());
  return m ? m[1] : null;
}
