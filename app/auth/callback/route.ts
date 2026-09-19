// Callback OAuth / confirmation e-mail.
// Google redirige ici avec un paramètre ?code= (flux PKCE de @supabase/ssr) ;
// on l'échange contre une session, ce qui pose le cookie httpOnly nécessaire
// à l'auth côté serveur (Server Components, middleware).
//
// Un lien de confirmation reçu PAR E-MAIL (changement d'adresse, et plus
// généralement toute confirmation par jeton) arrive lui avec ?token_hash= et
// ?type=, vérifiés via `verifyOtp` — jamais avec ?code=. La différence
// compte : ?code= (PKCE) suppose que le navigateur qui clique est celui qui a
// lancé la demande (un jeton posé en local doit encore être là), ce qui est
// vrai pour une redirection Google dans le même onglet mais presque jamais
// pour un lien ouvert depuis un client mail. `verifyOtp` n'a besoin de rien
// de local : le jeton lui-même, à usage unique, suffit — même doctrine que le
// `hashed_token` de `/auth/impersonation`, pour la même raison (lien ouvert
// hors du contexte de navigation qui l'a créé).
//
// C'est aussi le seul endroit où le PSEUDO peut être finalisé : à
// l'inscription par e-mail il n'y a pas encore de session pour écrire dans
// `profiles`, le pseudo validé voyage donc dans les métadonnées du compte
// jusqu'ici. Un compte arrivé par Google, lui, n'a pas de pseudo du tout —
// on le renvoie vers `/choix-pseudo` avant toute autre destination.
import type { EmailOtpType } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { redirigerVers } from '@/lib/redirection';
import { aChoisiSonPseudo, enregistrerPseudo, pseudoDisponible } from '@/lib/pseudo-data';
import { validerPseudo } from '@/lib/pseudo';
import { syncProfileEmail } from '@/lib/auth';

function safeNext(next: string | null): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

// Whitelist explicite plutôt qu'un cast : `type` vient de l'URL, donc de
// l'extérieur — jamais passé tel quel à `verifyOtp`.
function commeTypeOtp(valeur: string | null): EmailOtpType | null {
  return (OTP_TYPES as readonly string[]).includes(valeur ?? '') ? (valeur as EmailOtpType) : null;
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

  await syncProfileEmail(user.id, user.email);

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
  // `origin` n'est volontairement PAS déduit de `request.url` : derrière
  // l'équilibreur, il vaut `localhost:3000` (cf. `lib/redirection.ts`).
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = commeTypeOtp(searchParams.get('type'));
  const next = safeNext(searchParams.get('next'));

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirigerVers(await destinationApresConnexion(next));
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return redirigerVers(await destinationApresConnexion(next));
    }
  }

  return redirigerVers('/connexion?error=auth');
}
