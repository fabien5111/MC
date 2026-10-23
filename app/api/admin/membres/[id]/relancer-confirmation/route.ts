// Route Handler — renvoi du mail de confirmation d'adresse à un membre
// (JEP-262, lot 2). Réservée à l'admin complet, comme toute la fiche membre.
//
// **Le mail est composé et envoyé par l'application** (Brevo, `lib/email.ts`),
// pas par GoTrue. Première version : `auth.resend` — le mail partait, mais son
// lien repassait par GoTrue (`/verify`) puis revenait sur `/auth/callback` avec
// la session dans la partie `#…` de l'adresse, que le callback ne sait pas
// lire : le compte était bien confirmé, le membre atterrissait sur « La
// connexion a échoué » sans session ni pseudo, et un second clic donnait
// `otp_expired`. Désormais le jeton vient de `admin.generateLink` (comme
// « Connexion en tant que ») et le lien pointe directement vers
// `/auth/callback?token_hash=…&type=…`, que le callback échange par
// `verifyOtp` : un seul clic confirme, connecte et finalise le pseudo. Plus de
// dépendance au SMTP de GoTrue ni à `GOTRUE_URI_ALLOW_LIST`.
//
// **Le lien n'est JAMAIS rendu à l'admin** : il connecte celui qui le suit au
// compte du membre. Il ne sort que par le mail, à l'adresse du membre.
//
// Anti-abus : une relance par membre et par 5 minutes, comptée dans le journal
// (`member_moderation_events`, action `relance_confirmation`) — pas de table de
// plus, et la relance laisse sa trace comme le forçage manuel. La ligne est
// écrite AVANT l'envoi (réserver plutôt que constater : un second clic
// immédiat la trouve) et retirée si la génération ou l'envoi échoue, pour
// qu'une demande échouée ne coûte pas le délai. Chaque relance annule le lien
// du mail précédent. L'envoi ne passe pas par `notifier()` (pas de préférences
// ni de cloche pour un geste d'admin) : il ne réserve donc pas le quota Brevo
// (300/jour), sans conséquence à la cadence d'une relance manuelle.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { isReadOnlySession } from '@/lib/impersonation';
import { siteUrl } from '@/lib/site-url';
import { sendEmail } from '@/lib/email';
import {
  ACTION_RELANCE_CONFIRMATION,
  MOTIF_RELANCE_CONFIRMATION,
  composerEmailConfirmation,
  confirmationDe,
  libelleAttente,
  lienConfirmation,
  origineValide,
  relanceAutorisee,
} from '@/lib/email-confirmation';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Vérification forte (serveur d'authentification) : un droit d'admin retiré
  // ne doit pas survivre à son jeton.
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }
  // Une session « en tant que » en lecture seule n'écrit rien, ce geste compris.
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session en lecture seule : action refusée.' }, { status: 403 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }

  const { id: cibleId } = await params;
  const { data: cible } = await admin.from('profiles').select('id, email').eq('id', cibleId).maybeSingle();
  if (!cible) return NextResponse.json({ erreur: 'Membre introuvable.' }, { status: 404 });

  // État relu chez GoTrue, jamais sur la parole du navigateur.
  const { data: lu, error: erreurLecture } = await admin.auth.admin.getUserById(cibleId);
  if (erreurLecture || !lu?.user) {
    return NextResponse.json(
      { erreur: `Lecture du compte impossible${erreurLecture ? ` : ${erreurLecture.message}` : ''}.` },
      { status: 502 },
    );
  }
  if (confirmationDe(lu.user)) {
    return NextResponse.json({ erreur: 'Cette adresse est déjà confirmée.' }, { status: 409 });
  }
  const email = lu.user.email || cible.email;
  if (!email) return NextResponse.json({ erreur: 'Ce compte n\'a pas d\'adresse e-mail.' }, { status: 422 });

  // Délai minimum depuis la dernière relance de ce membre. Journal non typé :
  // table et colonnes absentes de `database.types.ts`.
  const db = admin as unknown as SupabaseClient;
  const { data: derniere, error: erreurJournal } = await db
    .from('member_moderation_events')
    .select('created_at')
    .eq('member_id', cibleId)
    .eq('action', ACTION_RELANCE_CONFIRMATION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (erreurJournal) {
    // Sans lecture du journal, le délai ne peut pas être tenu : on refuse
    // plutôt que de laisser partir des envois sans frein.
    console.error('relancer-confirmation: journal illisible :', erreurJournal.message);
    return NextResponse.json({ erreur: `Journal illisible, relance refusée (${erreurJournal.message}).` }, { status: 500 });
  }
  const verdict = relanceAutorisee((derniere as { created_at: string } | null)?.created_at ?? null);
  if (!verdict.ok) {
    return NextResponse.json(
      { erreur: `Une relance vient d'être envoyée. Prochaine possible dans ${libelleAttente(verdict.attenteSecondes)}.` },
      { status: 429 },
    );
  }

  // Réservation : la ligne de journal est posée avant l'envoi.
  const { data: ligne, error: journal } = await db
    .from('member_moderation_events')
    .insert({
      member_id: cibleId,
      admin_id: user.id,
      action: ACTION_RELANCE_CONFIRMATION,
      reason: MOTIF_RELANCE_CONFIRMATION,
    })
    .select('id')
    .single();
  if (journal || !ligne) {
    console.error('relancer-confirmation: journal non écrit :', journal?.message);
    return NextResponse.json(
      {
        erreur:
          `Relance refusée : la trace n'a pas pu être écrite au journal (${journal?.message ?? 'aucune ligne'}). ` +
          "Si la contrainte de la colonne « action » n'accepte pas encore « relance_confirmation », voir la migration de JEP-262.",
      },
      { status: 500 },
    );
  }

  // La ligne de journal est retirée si la suite échoue : une demande qui n'a
  // rien envoyé ne doit pas coûter le délai.
  const annuler = async () => {
    const { error: retrait } = await db.from('member_moderation_events').delete().eq('id', ligne.id);
    if (retrait) console.error('relancer-confirmation: ligne de journal non retirée :', retrait.message);
  };

  // Jeton à usage unique (le précédent est invalidé), jamais rendu à l'admin.
  const { data: genere, error: erreurLien } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const jeton = genere?.properties?.hashed_token;
  const typeJeton = genere?.properties?.verification_type;
  if (erreurLien || !jeton || !typeJeton) {
    console.error('relancer-confirmation: génération du lien impossible :', erreurLien?.message);
    await annuler();
    return NextResponse.json(
      { erreur: `Génération du lien impossible : ${erreurLien?.message ?? 'jeton absent'}` },
      { status: 502 },
    );
  }

  // Le lien ramène sur le domaine d'où l'admin agit (aperçu, dev, www), sinon
  // sur l'adresse du site.
  const origine = origineValide(req.headers.get('origin')) ?? siteUrl();
  const meta = (lu.user.user_metadata ?? {}) as { pseudo?: string; full_name?: string };
  const mail = composerEmailConfirmation({
    lien: lienConfirmation(origine, jeton, typeJeton),
    pseudo: meta.pseudo ?? meta.full_name ?? null,
  });
  try {
    await sendEmail({
      to: email,
      subject: mail.sujet,
      text: mail.texte,
      html: mail.html,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });
  } catch (e) {
    console.error('relancer-confirmation: envoi impossible :', (e as Error).message);
    await annuler();
    return NextResponse.json({ erreur: `Envoi du mail impossible : ${(e as Error).message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, email });
}
