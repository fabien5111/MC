// Route Handler — confirmation manuelle de l'adresse e-mail d'un membre
// (JEP-262, lot 3). Réservée à l'admin complet, comme toute la fiche membre.
//
// C'est un contournement de sécurité assumé : le membre n'a rien confirmé, un
// administrateur l'affirme à sa place (mail jamais reçu, compte de test,
// support). Aucun e-mail n'est envoyé. Le geste doit donc rester traçable :
//
// 1. le journal (`member_moderation_events`, action `confirmation_email`) est
//    écrit AVANT le geste, et **sans trace, pas de geste** — l'inverse de la
//    modération, où le statut précède le journal parce qu'une décision déjà
//    effective ne doit pas dépendre de lui. Ici c'est la trace qui autorise ;
// 2. `auth.admin.updateUserById(… email_confirm: true)` ; s'il échoue, la ligne
//    du journal est retirée (le geste n'a pas eu lieu), au mieux.
//
// Un compte déjà confirmé est refusé (409) : pas de ligne de journal pour un
// geste sans effet. La relecture chez GoTrue se fait ici, jamais sur la parole
// du navigateur.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import { ACTION_CONFIRMATION_FORCEE, MOTIF_CONFIRMATION_FORCEE, confirmationDe } from '@/lib/email-confirmation';
import { isReadOnlySession } from '@/lib/impersonation';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const { data: cible } = await admin.from('profiles').select('id').eq('id', cibleId).maybeSingle();
  if (!cible) return NextResponse.json({ erreur: 'Membre introuvable.' }, { status: 404 });

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

  // 1. Journal d'abord. Non typé : table et colonnes absentes de `database.types.ts`.
  const db = admin as unknown as SupabaseClient;
  const { data: ligne, error: journal } = await db
    .from('member_moderation_events')
    .insert({
      member_id: cibleId,
      admin_id: user.id,
      action: ACTION_CONFIRMATION_FORCEE,
      reason: MOTIF_CONFIRMATION_FORCEE,
    })
    .select('id')
    .single();
  if (journal || !ligne) {
    console.error('confirmer-email: journal non écrit :', journal?.message);
    return NextResponse.json(
      {
        erreur:
          `Geste refusé : la trace n'a pas pu être écrite au journal (${journal?.message ?? 'aucune ligne'}). ` +
          "Si la contrainte de la colonne « action » n'accepte pas encore « confirmation_email », voir la migration de JEP-262.",
      },
      { status: 500 },
    );
  }

  // 2. Le geste.
  const { error } = await admin.auth.admin.updateUserById(cibleId, { email_confirm: true });
  if (error) {
    console.error('confirmer-email: confirmation refusée par GoTrue :', error.message);
    const { error: retrait } = await db.from('member_moderation_events').delete().eq('id', ligne.id);
    if (retrait) console.error('confirmer-email: ligne de journal non retirée :', retrait.message);
    return NextResponse.json({ erreur: `Confirmation impossible : ${error.message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
