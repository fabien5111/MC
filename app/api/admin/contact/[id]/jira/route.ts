// Route Handler — reprise de la création du ticket Jira après un échec
// (bouton « Créer le ticket », spec §11.3). Réservé à l'admin complet.
import { NextResponse } from 'next/server';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { relancerCreationTicket } from '@/lib/contact-admin-data';
import { MissingServiceKeyError } from '@/lib/supabase/admin';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });

  const { id } = await params;
  try {
    const resultat = await relancerCreationTicket(id);
    if (!resultat.ok) return NextResponse.json({ erreur: resultat.error }, { status: 400 });
    return NextResponse.json({ ok: true, issueKey: resultat.issueKey });
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }
}
