// Route Handler — traite un lot du B3 (reprise des images encore en
// data-URL vers le stockage objet) ou vérifie a posteriori une cible déjà
// reprise (B4, § 7.5/§ 8). Réservée à l'administration — contrairement aux
// bascules du B2, ces écritures/lectures touchent des lignes appartenant à
// n'importe quel membre, jamais seulement à l'appelant.
import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { CIBLES_BACKFILL, CLE_COMMENTAIRES, estCleCible } from '@/lib/backfill';
import { traiterLotCommentairesPhotos, traiterLotScalaire, verifierCible, verifierCommentairesPhotos } from '@/lib/backfill-data';

export const maxDuration = 60;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { cible, action } = (body ?? {}) as { cible?: unknown; action?: unknown };

  if (action === 'verifier') {
    if (cible === CLE_COMMENTAIRES) return NextResponse.json(await verifierCommentairesPhotos());
    if (!estCleCible(cible)) return NextResponse.json({ erreur: 'Cible inconnue.' }, { status: 400 });
    return NextResponse.json(await verifierCible(CIBLES_BACKFILL[cible]));
  }

  if (cible === CLE_COMMENTAIRES) {
    return NextResponse.json(await traiterLotCommentairesPhotos());
  }
  if (!estCleCible(cible)) return NextResponse.json({ erreur: 'Cible inconnue.' }, { status: 400 });

  return NextResponse.json(await traiterLotScalaire(CIBLES_BACKFILL[cible]));
}
