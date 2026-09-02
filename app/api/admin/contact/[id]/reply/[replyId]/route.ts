// Route Handler — renvoi d'une réponse en échec (bouton « Renvoyer »,
// spec §10.2). Reprend le corps déjà enregistré tel quel, sans repasser par
// la validation de longueur (déjà faite à l'envoi initial).
import { NextResponse } from 'next/server';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { renvoyerReponse } from '@/lib/contact-admin-data';
import { MissingServiceKeyError } from '@/lib/supabase/admin';

export async function POST(_req: Request, { params }: { params: Promise<{ replyId: string }> }) {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });

  const { replyId } = await params;
  try {
    const resultat = await renvoyerReponse(replyId);
    if (!resultat.ok) return NextResponse.json({ erreur: resultat.error }, { status: 400 });
    return NextResponse.json({ ok: true, delivered: resultat.delivered });
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }
}
