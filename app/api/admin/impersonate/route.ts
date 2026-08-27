// Route Handler — génération d'un lien de connexion « en tant que » un membre.
//
// L'admin ne choisit pas le niveau d'accès : il est hérité de
// `profiles.impersonation_access` de son propre profil (défaut : lecture seule).
//
// Le lien produit est à usage unique et de courte durée ; il est destiné à être
// ouvert dans une fenêtre de navigation privée pour ne pas écraser la session
// admin de la fenêtre courante.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { IMPERSONATION_TTL_MINUTES, getAdminImpersonationAccess } from '@/lib/impersonation';
import { modeLabel } from '@/lib/impersonation-types';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  // Profil via l'accesseur unique (mémoïsé) : il porte `role` ET `email`, les
  // deux dont cette route a besoin. Cf. lib/auth.ts — plus de lecture directe
  // de `profiles` dispersée dans le code.
  const me = await getProfile(user.id);
  if (me?.role !== 'admin') {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const targetId = typeof body?.targetId === 'string' ? body.targetId : '';
  if (!targetId) return NextResponse.json({ erreur: 'Membre cible manquant.' }, { status: 400 });
  if (targetId === user.id) {
    return NextResponse.json({ erreur: 'Vous êtes déjà connecté sur ce compte.' }, { status: 400 });
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

  const { data: target } = await admin
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', targetId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json(
      { erreur: "Profil introuvable pour ce membre : impossible d'ouvrir une session." },
      { status: 404 },
    );
  }

  // `profiles.email` peut être vide sur les comptes créés avant que le trigger
  // `handle_new_user` ne le renseigne : on retombe alors sur l'adresse d'auth,
  // seule donnée réellement exigée par `generateLink`.
  let targetEmail = target.email;
  if (!targetEmail) {
    const { data: authUser } = await admin.auth.admin.getUserById(targetId);
    targetEmail = authUser?.user?.email ?? null;
  }
  if (!targetEmail) {
    return NextResponse.json(
      { erreur: "Ce membre n'a pas d'adresse e-mail exploitable : impossible d'ouvrir une session." },
      { status: 400 },
    );
  }

  const mode = await getAdminImpersonationAccess(user.id);
  const expiresAt = new Date(Date.now() + IMPERSONATION_TTL_MINUTES * 60_000).toISOString();
  const targetName = target.full_name || targetEmail;

  // Ligne d'audit créée AVANT le lien : une génération de lien laisse une trace
  // même si le lien n'est jamais ouvert (started_at reste null).
  const { data: session, error: sessionError } = await admin
    .from('impersonation_sessions')
    .insert({
      admin_id: user.id,
      admin_email: me.email ?? user.email ?? null,
      target_user_id: target.id,
      target_email: targetEmail,
      target_name: target.full_name,
      mode,
      expires_at: expiresAt,
    })
    .select('id')
    .single();

  if (sessionError || !session) {
    return NextResponse.json(
      { erreur: `Impossible d'enregistrer la session d'impersonation : ${sessionError?.message ?? 'erreur inconnue'}` },
      { status: 500 },
    );
  }

  // Lien de connexion à usage unique. On n'utilise pas `action_link` (qui
  // repasse par le domaine Supabase en flux implicite) mais le `hashed_token`,
  // échangé côté serveur par /auth/impersonation : la session est alors posée
  // en cookies httpOnly, exploitable par les Server Components.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
  });

  if (linkError || !link?.properties?.hashed_token) {
    await admin
      .from('impersonation_sessions')
      .update({ ended_at: new Date().toISOString(), ended_reason: 'link_failed' })
      .eq('id', session.id);
    return NextResponse.json(
      { erreur: `Génération du lien impossible : ${linkError?.message ?? 'jeton absent'}` },
      { status: 502 },
    );
  }

  await admin.from('impersonation_events').insert({
    session_id: session.id,
    action: 'link_created',
    label: `Lien généré par ${me.email ?? user.email} — mode ${modeLabel(mode)}`,
  });

  const origin = new URL(req.url).origin;
  const url = `${origin}/auth/impersonation?token_hash=${encodeURIComponent(
    link.properties.hashed_token,
  )}&session=${session.id}`;

  return NextResponse.json({ url, mode, expiresAt, targetName, sessionId: session.id });
}
