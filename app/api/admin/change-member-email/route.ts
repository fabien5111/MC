// Route Handler — changement d'adresse e-mail d'un membre par un admin.
//
// Contourne délibérément la double confirmation du self-service
// (`EmailChangeCard`, `SECURE_EMAIL_CHANGE_ENABLED`) : c'est justement le cas
// qu'elle ne peut jamais couvrir — un membre qui a perdu l'accès à son
// ancienne adresse ne pourra jamais confirmer ce côté-là depuis l'écran
// normal, quel que soit qui pilote le navigateur. `email_confirm: true` marque
// la nouvelle adresse confirmée sans envoyer aucun e-mail : c'est un geste de
// dépannage assumé, pas un flux de vérification.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const profileId = typeof body?.profileId === 'string' ? body.profileId : null;
  const newEmail = typeof body?.newEmail === 'string' ? body.newEmail.trim() : '';
  if (!profileId) return NextResponse.json({ erreur: 'Membre manquant.' }, { status: 400 });
  if (!EMAIL_RE.test(newEmail)) return NextResponse.json({ erreur: 'Adresse e-mail invalide.' }, { status: 400 });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (e instanceof MissingServiceKeyError) {
      return NextResponse.json({ erreur: e.message }, { status: 503 });
    }
    throw e;
  }

  const { error: authError } = await admin.auth.admin.updateUserById(profileId, {
    email: newEmail,
    email_confirm: true,
  });
  if (authError) {
    // `authError.message` est parfois vide (erreur GoTrue à la forme
    // inattendue) — journalisé et renvoyé en détail plutôt que de laisser un
    // message muet.
    console.error('change-member-email:', authError);
    const detail = authError.message || `code ${authError.status ?? '?'} — ${authError.name ?? 'erreur sans détail'}`;
    return NextResponse.json({ erreur: `Changement d'adresse impossible : ${detail}` }, { status: 502 });
  }

  // Copie manuelle (Admin → Membres, lien d'impersonation) — cf. lib/auth.ts.
  const { error: profileError } = await admin.from('profiles').update({ email: newEmail }).eq('id', profileId);
  if (profileError) {
    return NextResponse.json(
      { erreur: `Adresse changée, mais la synchronisation du profil a échoué : ${profileError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
