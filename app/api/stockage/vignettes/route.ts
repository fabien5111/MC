// Route Handler — fabrique les vignettes (~96 px et ~480 px) d'une photo de
// recette déjà déposée sur `jp-photos`, et les dépose. Cf. lib/vignettes-data.ts
// pour le pourquoi (plus de relecture CORS dans un canvas du navigateur).
//
// Ne touche jamais la base : elle rend deux URL, que l'appelant écrit lui-même
// sous la session du membre (RLS). L'objet déposé reste, au pire, orphelin —
// balayé par la réconciliation du stockage.
import { NextResponse } from 'next/server';

import { getCurrentUser } from '@/lib/auth';
import { isReadOnlySession } from '@/lib/impersonation';
import { VignetteError, cleSourceRecette, fabriquerVignettes } from '@/lib/vignettes-data';

function refus(message: string, code: number, etape?: string) {
  return NextResponse.json({ error: message, etape }, { status: code });
}

export async function POST(req: Request) {
  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return refus('Corps de requête illisible.', 400);
  }

  const user = await getCurrentUser();
  if (!user) return refus('Connexion requise.', 401);
  // Comme /api/stockage/televersement : une session « en tant que » en lecture
  // seule ne dépose rien.
  if (await isReadOnlySession()) return refus('Session en lecture seule.', 403);

  const cle = cleSourceRecette((corps as { url?: unknown } | null)?.url);
  if (!cle) return refus('Photo source invalide (attendu : une photo de recette du stockage).', 400, 'source');

  try {
    return NextResponse.json(await fabriquerVignettes(cle));
  } catch (e) {
    if (e instanceof VignetteError) {
      console.error('[vignettes]', e.etape, e.message, cle);
      return refus(e.message, e.etape === 'decodage' ? 422 : 502, e.etape);
    }
    console.error('[vignettes] inattendu', e);
    return refus('Erreur inattendue.', 500);
  }
}
