// Route Handler — suppression complète d'un membre depuis le back-office.
//
// La suppression ne peut pas se faire entièrement depuis le navigateur : effacer
// la ligne `profiles` laissait le compte `auth.users` intact, donc toujours
// capable de se connecter — et le profil était alors recréé au vol par
// /profil. On supprime donc ici le compte d'authentification (clé service_role),
// puis les lignes applicatives restantes.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { supprimerCompteMembre } from '@/lib/member-delete-data';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  // Rôle via l'accesseur unique (mémoïsé), cf. lib/auth.ts.
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const profileId = typeof body?.profileId === 'string' ? body.profileId : null;
  const allowlistId = typeof body?.allowlistId === 'number' ? body.allowlistId : null;
  if (!profileId && allowlistId === null) {
    return NextResponse.json({ erreur: 'Membre à supprimer manquant.' }, { status: 400 });
  }
  if (profileId === user.id) {
    return NextResponse.json({ erreur: 'Vous ne pouvez pas supprimer votre propre compte.' }, { status: 400 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (e instanceof MissingServiceKeyError) {
      return NextResponse.json({ erreur: e.message }, { status: 503 });
    }
    throw e;
  }

  if (profileId) {
    // Chemin partagé avec la purge des comptes non confirmés (JEP-262).
    const suppression = await supprimerCompteMembre(admin, profileId);
    if (!suppression.ok) {
      return NextResponse.json({ erreur: suppression.erreur }, { status: suppression.status });
    }
  }

  if (allowlistId !== null) {
    const { error } = await admin.from('allowlist').delete().eq('id', allowlistId);
    if (error) {
      return NextResponse.json(
        { erreur: `Suppression de l'invitation impossible : ${error.message}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}
