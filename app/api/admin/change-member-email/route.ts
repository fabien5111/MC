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

  // Adresse déjà prise : contrôle AVANT l'appel, parce que GoTrue ne sait pas
  // le dire. Une adresse déjà rattachée à un autre compte viole l'index
  // `users_email_partial_key` d'`auth.users`, et GoTrue laisse remonter
  // l'erreur PostgreSQL brute en 500 **au corps vide** — l'appelant ne reçoit
  // donc aucun motif exploitable (mesuré : `AuthRetryableFetchError` avec un
  // message réduit à `{}`, la cause n'étant lisible que dans le journal du
  // nœud). Ce contrôle est un confort d'affichage, jamais la garantie : elle
  // reste l'index unique en base, et `profiles.email` n'est qu'une copie, vide
  // sur les comptes antérieurs au trigger `handle_new_user`.
  const { data: dejaPris } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', newEmail)
    .neq('id', profileId)
    .maybeSingle();
  if (dejaPris) {
    return NextResponse.json({ erreur: 'Cette adresse est déjà utilisée par un autre compte.' }, { status: 409 });
  }

  const { error: authError } = await admin.auth.admin.updateUserById(profileId, {
    email: newEmail,
    email_confirm: true,
  });
  if (authError) {
    // Le CODE HTTP est toujours remonté, jamais seulement le message : un
    // corps d'erreur vide donne `message === '{}'` (supabase-js retombe sur
    // `JSON.stringify` quand le corps ne porte ni `msg` ni `message`), et le
    // message seul ne dit alors rien. Le code, lui, distingue un refus de
    // l'équilibreur (401/403/405) d'un chemin non routé (404) ou d'une panne
    // GoTrue (500) — ce dernier étant le plus souvent l'adresse déjà prise
    // que le contrôle ci-dessus n'a pas vue (copie `profiles.email` absente).
    console.error('change-member-email:', authError);
    const piste =
      authError.status === 500
        ? " — cause la plus fréquente : l'adresse est déjà rattachée à un autre compte"
        : '';
    return NextResponse.json(
      {
        erreur:
          `Changement d'adresse impossible — code ${authError.status ?? '?'} ` +
          `(${authError.name ?? 'erreur'})${piste}.`,
      },
      { status: 502 },
    );
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
