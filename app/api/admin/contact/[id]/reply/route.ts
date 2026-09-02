// Route Handler — envoi d'une réponse au demandeur depuis le back-office
// (spec §10.2). Réservé à l'admin complet.
import { NextResponse } from 'next/server';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { validerPhotos, validerReponseAdmin } from '@/lib/contact';
import { envoyerReponse } from '@/lib/contact-admin-data';
import { MissingServiceKeyError } from '@/lib/supabase/admin';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const validation = validerReponseAdmin(body?.body);
  if (!validation.ok) return NextResponse.json({ erreur: validation.error }, { status: 400 });
  const photos = validerPhotos(body?.photos);

  try {
    const resultat = await envoyerReponse(id, user.id, validation.body, photos);
    if (!resultat.ok) return NextResponse.json({ erreur: resultat.error }, { status: 400 });
    return NextResponse.json({ ok: true, delivered: resultat.delivered });
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }
}
