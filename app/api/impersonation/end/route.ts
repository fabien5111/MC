// Fin d'une session d'impersonation, déclenchée par le bandeau (« Quitter »).
// Clôture la ligne d'audit puis laisse le client se déconnecter.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { getImpersonationContext } from '@/lib/impersonation';

export async function POST() {
  const ctx = await getImpersonationContext();
  if (!ctx) return NextResponse.json({ ok: true });

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (e instanceof MissingServiceKeyError) {
      return NextResponse.json({ erreur: e.message }, { status: 503 });
    }
    throw e;
  }

  await admin.from('impersonation_events').insert({
    session_id: ctx.sessionId,
    action: 'session_end',
    label: 'Fin de session demandée depuis le bandeau',
  });
  await admin
    .from('impersonation_sessions')
    .update({ ended_at: new Date().toISOString(), ended_reason: 'manual' })
    .eq('id', ctx.sessionId);

  // Déconnexion côté serveur : le cookie de session du membre ne doit pas
  // survivre à la fermeture de la fenêtre privée.
  const supabase = await createClient();
  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
