// Route Handler — « Anonymiser » un membre depuis sa fiche (JEP-33). Réservée à
// l'admin complet, vérifié auprès du serveur d'authentification, comme le reste
// de la fiche ; refusée en session « en tant que ».
//
// GET : abonnement à annoncer avant confirmation. POST : `anonymiserMembre`,
// le même mécanisme que « Supprimer mon compte », avec motif obligatoire et
// ligne au journal `member_moderation_events` (écrite AVANT tout geste
// destructeur : sans trace, pas de geste). Interdit sur un admin et sur soi.
import { NextResponse } from 'next/server';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { getImpersonationContext } from '@/lib/impersonation';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { abonnementAResilier, anonymiserMembre, lireProfilCible } from '@/lib/anonymisation-data';
import { validerDemandeAdmin } from '@/lib/anonymisation';

async function contexteAdmin() {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  if (await getImpersonationContext()) {
    return NextResponse.json({ erreur: 'Impossible en session « en tant que ».' }, { status: 403 });
  }
  try {
    return { userId: user.id, admin: createAdminClient() };
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexteAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { id } = await params;
  return NextResponse.json({ abonnement: await abonnementAResilier(ctx.admin, id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexteAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, admin } = ctx;
  const { id: cibleId } = await params;

  const cible = await lireProfilCible(admin, cibleId);
  if (!cible) return NextResponse.json({ erreur: 'Membre introuvable.' }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const verdict = validerDemandeAdmin(body ?? {}, {
    acteurId: userId,
    cibleId,
    cibleRole: cible.role,
    cibleStatut: cible.status,
  });
  if (!verdict.ok) return NextResponse.json({ erreur: verdict.erreur }, { status: 400 });

  const r = await anonymiserMembre(admin, {
    membreId: cibleId,
    origine: 'admin',
    adminId: userId,
    motif: verdict.demande.motif,
  });
  if (!r.ok) return NextResponse.json({ erreur: r.erreur }, { status: r.status });
  return NextResponse.json({
    ok: true,
    fantomeId: r.fantomeId,
    abonnementResilie: r.abonnementResilie,
    emailEnvoye: r.emailEnvoye,
    avertissements: r.avertissements,
  });
}
