// Route Handler — renvoi du mail de confirmation d'adresse à un membre
// (JEP-262, lot 2). Réservée à l'admin complet, comme toute la fiche membre.
//
// Le mail n'est pas envoyé par l'application mais par GoTrue (`auth.resend`,
// type `signup`), avec sa PROPRE configuration SMTP (nœud 216114), distincte de
// `SMTP_*` / Brevo. Un succès de cette route dit que GoTrue a accepté la
// demande, pas que le message est arrivé : sans SMTP valide côté GoTrue, la
// demande peut aboutir sans qu'aucun mail ne parte.
//
// Anti-abus : une relance par membre et par 5 minutes, comptée dans le journal
// (`member_moderation_events`, action `relance_confirmation`) — pas de table de
// plus, et la relance laisse sa trace comme le forçage manuel. La ligne est
// écrite AVANT l'envoi (réserver plutôt que constater : un second clic
// immédiat la trouve) et retirée si GoTrue refuse, pour qu'une demande
// échouée ne coûte pas le délai. GoTrue a de toute façon sa propre limite
// (~1 min par adresse) : son refus est rendu tel quel.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { isReadOnlySession } from '@/lib/impersonation';
import { siteUrl } from '@/lib/site-url';
import {
  ACTION_RELANCE_CONFIRMATION,
  MOTIF_RELANCE_CONFIRMATION,
  confirmationDe,
  libelleAttente,
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

  // Le lien du mail ramène sur le domaine d'où l'admin agit (doit figurer dans
  // `GOTRUE_URI_ALLOW_LIST`, comme pour l'inscription).
  const origine = req.headers.get('origin') || siteUrl();
  const { error } = await admin.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${origine}/auth/callback` },
  });
  if (error) {
    console.error('relancer-confirmation: refus de GoTrue :', error.message);
    const { error: retrait } = await db.from('member_moderation_events').delete().eq('id', ligne.id);
    if (retrait) console.error('relancer-confirmation: ligne de journal non retirée :', retrait.message);
    return NextResponse.json({ erreur: `Envoi impossible : ${error.message}` }, { status: error.status === 429 ? 429 : 502 });
  }

  return NextResponse.json({ ok: true, email });
}
