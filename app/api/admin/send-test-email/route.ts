// Route Handler — envoi d'un e-mail de test depuis le back-office, pour
// vérifier la configuration SMTP (AWS SES) sans passer par le flux
// d'inscription Supabase. Fermée au gestionnaire, comme les autres routes
// /api/admin/* (cf. CLAUDE.md, « Rôles du back-office »).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail, MissingSmtpConfigError } from '@/lib/email';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (me?.role !== 'admin') {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const objet = typeof body?.objet === 'string' ? body.objet.trim() : '';
  const corps = typeof body?.corps === 'string' ? body.corps : '';
  if (!email || !objet || !corps) {
    return NextResponse.json({ erreur: 'Destinataire, objet et corps sont requis.' }, { status: 400 });
  }

  try {
    await sendEmail({ to: email, subject: objet, text: corps });
  } catch (e) {
    if (e instanceof MissingSmtpConfigError) {
      return NextResponse.json({ erreur: e.message }, { status: 503 });
    }
    return NextResponse.json({ erreur: `Envoi impossible : ${(e as Error).message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
