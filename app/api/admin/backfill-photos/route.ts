// Route Handler — traite un lot du B3 : reprise des images encore en
// data-URL vers le stockage objet (§ 7.5). Réservée à l'administration —
// contrairement aux bascules du B2, ces écritures touchent des lignes
// appartenant à n'importe quel membre, jamais seulement à l'appelant.
import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { CIBLES_BACKFILL, CLE_COMMENTAIRES, estCleCible } from '@/lib/backfill';
import { traiterLotCommentairesPhotos, traiterLotScalaire } from '@/lib/backfill-data';

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { cible } = (body ?? {}) as { cible?: unknown };

  if (cible === CLE_COMMENTAIRES) {
    return NextResponse.json(await traiterLotCommentairesPhotos());
  }
  if (!estCleCible(cible)) return NextResponse.json({ erreur: 'Cible inconnue.' }, { status: 400 });

  return NextResponse.json(await traiterLotScalaire(CIBLES_BACKFILL[cible]));
}
