// Callback OAuth / confirmation e-mail (flux PKCE de @supabase/ssr).
// Google (et les liens de confirmation e-mail) redirige ici avec un
// paramètre ?code= ; on l'échange contre une session, ce qui pose le cookie
// httpOnly nécessaire à l'auth côté serveur (Server Components, middleware).
//
// C'est aussi le seul endroit où le PSEUDO peut être finalisé : à
// l'inscription par e-mail il n'y a pas encore de session pour écrire dans
// `profiles`, le pseudo validé voyage donc dans les métadonnées du compte
// jusqu'ici. Un compte arrivé par Google, lui, n'a pas de pseudo du tout —
// on le renvoie vers `/choix-pseudo` avant toute autre destination.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { aChoisiSonPseudo, enregistrerPseudo, pseudoDisponible } from '@/lib/pseudo-data';
import { validerPseudo } from '@/lib/pseudo';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

// Destination réelle après échange du code : `next` si le membre a un pseudo,
// l'écran de choix sinon. Toute erreur d'écriture retombe sur `/choix-pseudo`
// plutôt que sur une page d'erreur : le membre est connecté, il lui manque
// juste un pseudo, et l'écran sait le lui demander.
async function destinationApresConnexion(next: string): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return next;
  if (await aChoisiSonPseudo(user.id)) return next;

  // Inscription par e-mail : le pseudo a déjà été validé (unicité + IA) avant
  // la création du compte. On le revalide sur le format et on revérifie qu'il
  // est toujours libre — plusieurs jours peuvent séparer l'inscription de la
  // confirmation de l'adresse.
  const meta = (user.user_metadata ?? {}) as { pseudo?: string };
  const validation = meta.pseudo ? validerPseudo(meta.pseudo) : null;
  if (validation?.ok && (await pseudoDisponible(validation.pseudo, validation.slug, user.id))) {
    const ecriture = await enregistrerPseudo(
      user.id,
      validation.pseudo,
      validation.slug,
      user.email ?? null,
      user.app_metadata?.provider ?? null,
    );
    if (ecriture.ok) return next;
  }

  return `/choix-pseudo?next=${encodeURIComponent(next)}`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNext(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${await destinationApresConnexion(next)}`);
    }
  }

  return NextResponse.redirect(`${origin}/connexion?error=auth`);
}
