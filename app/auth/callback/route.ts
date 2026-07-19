// Callback OAuth / confirmation e-mail (flux PKCE de @supabase/ssr).
// Google (et les liens de confirmation e-mail) redirige ici avec un
// paramètre ?code= ; on l'échange contre une session, ce qui pose le cookie
// httpOnly nécessaire à l'auth côté serveur (Server Components, middleware).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/connexion?error=auth`);
}
