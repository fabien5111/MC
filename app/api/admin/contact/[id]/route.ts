// Route Handler — modification d'une demande depuis le back-office
// (statut, notes internes, interrupteur d'e-mail de déploiement) et
// suppression. Réservé à l'admin complet (spec §11.1, décision retenue pour
// ce chantier : pas d'accès gestionnaire pour le moment).
import { NextResponse } from 'next/server';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { isContactStatus } from '@/lib/contact';
import {
  basculerDeployNotify,
  changerStatutManuel,
  enregistrerNotesInternes,
  supprimerDemande,
} from '@/lib/contact-admin-data';
import { MissingServiceKeyError } from '@/lib/supabase/admin';

async function garde(): Promise<{ id: string } | NextResponse> {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  return { id: user.id };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const verif = await garde();
  if (verif instanceof NextResponse) return verif;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    if (typeof body.status === 'string') {
      if (!isContactStatus(body.status)) return NextResponse.json({ erreur: 'Statut invalide.' }, { status: 400 });
      const r = await changerStatutManuel(id, body.status, verif.id);
      if (!r.ok) return NextResponse.json({ erreur: r.error }, { status: 500 });
    }
    if (typeof body.adminNotes === 'string') {
      const r = await enregistrerNotesInternes(id, body.adminNotes);
      if (!r.ok) return NextResponse.json({ erreur: r.error }, { status: 500 });
    }
    if (typeof body.deployNotify === 'boolean') {
      const r = await basculerDeployNotify(id, body.deployNotify);
      if (!r.ok) return NextResponse.json({ erreur: r.error }, { status: 500 });
    }
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const verif = await garde();
  if (verif instanceof NextResponse) return verif;

  const { id } = await params;
  try {
    const r = await supprimerDemande(id);
    if (!r.ok) return NextResponse.json({ erreur: r.error }, { status: 500 });
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }

  return NextResponse.json({ ok: true });
}
