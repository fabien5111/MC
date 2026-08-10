// Consommation d'un lien d'impersonation.
//
// Échange le jeton à usage unique contre une session Supabase posée en cookies
// (comme /auth/callback), puis « arme » la ligne d'audit : c'est le passage de
// `started_at` à une valeur non nulle qui rend la session d'impersonation
// active — et donc le bandeau visible et le bridage lecture seule effectif.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { modeLabel } from '@/lib/impersonation-types';

function fail(origin: string, motif: string) {
  return NextResponse.redirect(`${origin}/connexion?error=${motif}`);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get('token_hash');
  const sessionId = searchParams.get('session');
  if (!tokenHash || !sessionId) return fail(origin, 'impersonation');

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return fail(origin, 'impersonation');
    throw e;
  }

  // La session doit exister, ne pas avoir déjà servi, ni être expirée.
  const { data: session } = await admin
    .from('impersonation_sessions')
    .select('id, target_user_id, target_name, target_email, mode, started_at, ended_at, expires_at, admin_email')
    .eq('id', sessionId)
    .maybeSingle();

  if (
    !session ||
    session.started_at ||
    session.ended_at ||
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    return fail(origin, 'impersonation_expiree');
  }

  const supabase = await createClient();
  const { data: verified, error } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: tokenHash,
  });

  if (error || verified.user?.id !== session.target_user_id) {
    // Jeton invalide, périmé, ou ne correspondant pas au membre visé : on ne
    // laisse surtout pas une session ouverte derrière soi.
    await supabase.auth.signOut();
    return fail(origin, 'impersonation_expiree');
  }

  const now = new Date().toISOString();

  // Une seule session d'impersonation active par membre : les précédentes sont
  // clôturées, sinon un ancien lien en mode « modification » resterait valable
  // en parallèle d'une session « lecture seule ».
  await admin
    .from('impersonation_sessions')
    .update({ ended_at: now, ended_reason: 'superseded' })
    .eq('target_user_id', session.target_user_id)
    .not('started_at', 'is', null)
    .is('ended_at', null);

  await admin.from('impersonation_sessions').update({ started_at: now, ended_at: null }).eq('id', session.id);

  await admin.from('impersonation_events').insert({
    session_id: session.id,
    action: 'session_start',
    path: '/auth/impersonation',
    label: `Ouverture de session sur ${session.target_name || session.target_email} — mode ${modeLabel(
      session.mode,
    )}`,
  });

  // Atterrissage sur le carnet du membre : c'est de là que l'on voit ce
  // qu'il a, ce pour quoi une session « en tant que » est ouverte.
  return NextResponse.redirect(`${origin}/carnet`);
}
