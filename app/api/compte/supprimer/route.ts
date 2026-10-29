// Route Handler — « Supprimer mon compte » (JEP-33), depuis `/reglages`.
//
// GET : ce que la fenêtre doit annoncer avant confirmation (abonnement à
// résilier). POST : la suppression elle-même, par le mécanisme unique
// `anonymiserMembre` (`lib/anonymisation-data.ts`).
//
// Gardes :
// - vérification forte de la session (`getVerifiedUser`, serveur
//   d'authentification) : un geste irréversible ne se fie pas à un jeton
//   peut-être révoqué ;
// - refusée en session « en tant que », QUEL QUE SOIT son mode : un admin
//   connecté à la place d'un membre ne supprime pas son compte ;
// - confirmation par saisie du pseudo, revérifiée ici (le navigateur ne prouve
//   rien) ;
// - un administrateur ne supprime pas son compte d'ici (le site perdrait son
//   back-office d'un clic) : il retire d'abord son rôle.
//
// Volontairement SANS `refusSiCompteBloque` : un membre suspendu ou désactivé
// garde son droit à l'effacement (RGPD, art. 17).
import { NextResponse } from 'next/server';
import { getVerifiedUser } from '@/lib/auth';
import { getImpersonationContext } from '@/lib/impersonation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { abonnementAResilier, anonymiserMembre, lireProfilCible } from '@/lib/anonymisation-data';
import { confirmationPseudoValide } from '@/lib/anonymisation';

async function contexte() {
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (await getImpersonationContext()) {
    return NextResponse.json({ erreur: 'Impossible en session « en tant que ».' }, { status: 403 });
  }
  try {
    return { user, admin: createAdminClient() };
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }
}

export async function GET() {
  const ctx = await contexte();
  if (ctx instanceof NextResponse) return ctx;
  return NextResponse.json({ abonnement: await abonnementAResilier(ctx.admin, ctx.user.id) });
}

export async function POST(req: Request) {
  const ctx = await contexte();
  if (ctx instanceof NextResponse) return ctx;
  const { user, admin } = ctx;

  const body = await req.json().catch(() => ({}));
  const profil = await lireProfilCible(admin, user.id);
  if (!profil) return NextResponse.json({ erreur: 'Profil introuvable.' }, { status: 404 });
  if (profil.role === 'admin') {
    return NextResponse.json(
      { erreur: 'Un administrateur ne peut pas supprimer son compte : son rôle doit d’abord être retiré.' },
      { status: 403 },
    );
  }
  if (!confirmationPseudoValide(typeof body?.pseudo === 'string' ? body.pseudo : '', profil.full_name)) {
    return NextResponse.json({ erreur: 'Le pseudo saisi ne correspond pas.' }, { status: 400 });
  }

  const r = await anonymiserMembre(admin, { membreId: user.id, origine: 'membre' });
  if (!r.ok) return NextResponse.json({ erreur: r.erreur }, { status: r.status });

  // Cookies de session effacés : le compte n'existe plus, le jeton resterait
  // sinon lisible jusqu'à son expiration. GoTrue répond « session absente »,
  // ignoré par `signOut` local.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

  return NextResponse.json({ ok: true, abonnementResilie: r.abonnementResilie, emailEnvoye: r.emailEnvoye });
}
