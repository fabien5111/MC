// Journalisation des actions réalisées pendant une impersonation.
//
// Appelée par `useMutation` (écriture aboutie ou refusée en lecture seule).
// La session visée n'est pas fournie par le client : elle est résolue côté
// serveur depuis la session Supabase courante, pour qu'un appel forgé ne
// puisse pas écrire dans le journal d'une autre session.
import { NextResponse } from 'next/server';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { getImpersonationContext } from '@/lib/impersonation';
import type { ImpersonationAction } from '@/lib/impersonation-types';

const ACTIONS_AUTORISEES: ImpersonationAction[] = ['write', 'write_blocked'];

function coupe(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

export async function POST(req: Request) {
  const ctx = await getImpersonationContext();
  if (!ctx) return NextResponse.json({ ok: true }); // hors impersonation : rien à tracer

  const body = await req.json().catch(() => ({}));
  const action = body?.action as ImpersonationAction;
  if (!ACTIONS_AUTORISEES.includes(action)) {
    return NextResponse.json({ erreur: 'Action inconnue.' }, { status: 400 });
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

  await admin.from('impersonation_events').insert({
    session_id: ctx.sessionId,
    action,
    path: coupe(body?.path, 300),
    label: coupe(body?.label, 300),
  });

  return NextResponse.json({ ok: true });
}
