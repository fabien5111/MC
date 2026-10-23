// Route Handler — suspension, désactivation et levée d'un membre (JEP-272,
// lots 1 et 2). Réservée à l'admin complet, comme toute la fiche membre.
//
// GET : ce que la fenêtre de confirmation doit montrer avant l'action
// (abonnement en cours et son état chez Stripe).
//
// Trois gestes, dans cet ordre :
// 1. `profiles` (statut, motif, date de fin) — c'est ce que lisent la garde
//    de `requireUser()`, celle des routes API et la RLS
//    (`public.is_blocked_user()`) : le blocage est effectif dès cette
//    écriture, sessions déjà ouvertes comprises ;
// 2. le journal (`member_moderation_events`) — écrit tout de suite, pour que la
//    trace d'une décision déjà effective ne dépende d'aucun geste suivant ;
// 3. plus de bannissement GoTrue : le membre se connecte, et le middleware ne
//    lui ouvre que `/compte-suspendu` (liste blanche, `lib/moderation-garde.ts`).
//    La route lève au passage un bannissement hérité de la première version et
//    vide le cache du middleware pour que l'effet soit immédiat.
//
// Les sessions (`auth.sessions`) ne sont pas supprimées : le membre en garde
// une, la RLS lui refuse toute écriture, les routes API le refusent, et le
// middleware ne lui montre que l'écran de blocage. La déconnexion forcée sans
// sanction, prévue au lot 3, en aura besoin.
//
// Puis, lot 2, sans bloquer l'action si l'un d'eux échoue (chaque résultat
// est rendu à l'admin, et tracé dans le journal) :
// 4. le geste sur l'abonnement Stripe choisi par l'admin (`moderation-actions`) ;
// 5. le recalcul des notes des recettes que le membre a notées, quand ses
//    avis disparaissent (désactivation) ou réapparaissent (levée) ;
// 6. l'e-mail au membre, sauf si l'admin a décoché « Prévenir le membre »
//    — impossible pour une résiliation, qui se notifie toujours.
//
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import {
  ACTION_JOURNAL,
  colonnesProfil,
  composerEmailModeration,
  urlConnexionPortail,
  emailObligatoire,
  etatModeration,
  validerActionAbonnement,
  validerDemandeModeration,
  type ActionAbonnement,
} from '@/lib/moderation';
import { lireLigneModeration } from '@/lib/moderation-data';
import { invaliderBlocage } from '@/lib/moderation-garde';
import { appliquerActionAbonnement, lireAbonnementModere, recalculerNotesDuMembre } from '@/lib/moderation-actions';
import { notifier } from '@/lib/notifier';
import { siteUrl } from '@/lib/site-url';

type Contexte = { userId: string; admin: ReturnType<typeof createAdminClient> };

/** Admin complet, vérifié auprès du serveur d'authentification, et client service_role. */
async function contexteAdmin(): Promise<Contexte | NextResponse> {
  // Vérification forte (serveur d'authentification), comme le reste du
  // back-office : un droit d'admin retiré ne doit pas survivre à son jeton.
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }
  try {
    return { userId: user.id, admin: createAdminClient() };
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexteAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { id: cibleId } = await params;
  const { etat } = await lireAbonnementModere(ctx.admin, cibleId);
  return NextResponse.json({ abonnement: etat });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await contexteAdmin();
  if (ctx instanceof NextResponse) return ctx;
  const { userId, admin } = ctx;

  const { id: cibleId } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: cible } = await admin.from('profiles').select('id, role').eq('id', cibleId).maybeSingle();
  if (!cible) return NextResponse.json({ erreur: 'Membre introuvable.' }, { status: 404 });

  const maintenant = new Date();
  const etatAvant = etatModeration(await lireLigneModeration(admin, cibleId), maintenant);
  const verdict = validerDemandeModeration(
    body ?? {},
    { acteurId: userId, cibleId, cibleRole: cible.role ?? null, etatActuel: etatAvant },
    maintenant,
  );
  if (!verdict.ok) return NextResponse.json({ erreur: verdict.erreur }, { status: 400 });
  const demande = verdict.demande;

  // Geste sur l'abonnement : relu chez Stripe avant d'agir, jamais cru sur la
  // parole du navigateur (la fenêtre a pu rester ouverte longtemps).
  const brutAbonnement = body?.abonnement;
  const avecAbonnement = brutAbonnement != null && brutAbonnement !== '' && brutAbonnement !== 'aucune';
  const abonnementLu = avecAbonnement ? await lireAbonnementModere(admin, cibleId) : { etat: null, subscriptionId: null };
  const choix = validerActionAbonnement(avecAbonnement ? brutAbonnement : 'aucune', demande.action, abonnementLu.etat);
  if (!choix.ok) return NextResponse.json({ erreur: choix.erreur }, { status: 400 });
  const actionAbonnement: ActionAbonnement = choix.valeur;
  const prevenir = body?.prevenir !== false || emailObligatoire(actionAbonnement);

  // 1. Statut — non typé : colonnes absentes de `database.types.ts` jusqu'à
  // la régénération.
  const db = admin as unknown as SupabaseClient;
  const { error: ecriture } = await db.from('profiles').update(colonnesProfil(demande)).eq('id', cibleId);
  if (ecriture) {
    return NextResponse.json({ erreur: `Enregistrement du statut impossible : ${ecriture.message}` }, { status: 500 });
  }

  // 2. Journal — complété à la fin (membre prévenu, geste sur l'abonnement).
  const { data: ligneJournal, error: journal } = await db
    .from('member_moderation_events')
    .insert({
      member_id: cibleId,
      admin_id: userId,
      action: ACTION_JOURNAL[demande.action],
      reason: demande.motif,
      suspended_until: demande.action === 'suspendre' ? demande.jusquAu : null,
    })
    .select('id')
    .single();
  if (journal) console.error('moderation: journal non écrit :', journal.message);

  // 3. Plus de bannissement GoTrue : le membre se connecte et n'a accès qu'à
  // l'écran de blocage (middleware). Un éventuel bannissement hérité de la
  // première version est levé au passage, sans bloquer l'action s'il échoue.
  const { error: debannissement } = await admin.auth.admin.updateUserById(cibleId, { ban_duration: 'none' });
  if (debannissement) console.error('moderation: bannissement hérité non levé :', debannissement.message);
  // Effet immédiat dans le middleware (cache de 60 s par membre).
  invaliderBlocage(cibleId);

  // 4. Abonnement.
  let abonnement: { action: ActionAbonnement; ok: boolean; message?: string } = { action: 'aucune', ok: true };
  let finPeriode = abonnementLu.etat?.finPeriode ?? null;
  if (actionAbonnement !== 'aucune' && abonnementLu.subscriptionId) {
    const r = await appliquerActionAbonnement(abonnementLu.subscriptionId, actionAbonnement, cibleId);
    if (r.ok) {
      abonnement = { action: actionAbonnement, ok: true };
      finPeriode = r.finPeriode ?? finPeriode;
    } else {
      console.error('moderation (abonnement):', r.message);
      abonnement = { action: actionAbonnement, ok: false, message: r.message };
    }
  }

  // 5. Notes moyennes : les avis d'un compte désactivé sont masqués.
  const avisMasquesOuRendus = demande.action === 'desactiver' || (demande.action === 'lever' && etatAvant.etat === 'desactive');
  const notesRecalculees = avisMasquesOuRendus ? await recalculerNotesDuMembre(admin, cibleId) : 0;

  // 6. E-mail au membre. Un geste sur l'abonnement qui a échoué n'est pas
  // annoncé comme fait.
  let email: 'envoye' | 'echec' | 'file' | 'non_demande' = 'non_demande';
  if (prevenir) {
    // Lien du portail Stripe : seulement pour un membre qui a un abonnement
    // Stripe, et si l'URL est configurée (sinon pas de lecture inutile).
    const urlPortail = urlConnexionPortail();
    const etatAbo = demande.action !== 'lever' && urlPortail ? (abonnementLu.etat ?? (await lireAbonnementModere(admin, cibleId)).etat) : null;
    const mail = composerEmailModeration({
      action: demande.action,
      motif: demande.motif,
      jusquAu: demande.jusquAu,
      abonnement: abonnement.ok ? abonnement.action : 'aucune',
      finPeriode,
      urlSite: siteUrl(),
      urlPortail: etatAbo?.stripe ? urlPortail : null,
    });
    const r = await notifier(admin, {
      userId: cibleId,
      acteurId: userId,
      evenement: mail.evenement,
      donnees: { titre: mail.sujet, detail: mail.detail, lien: mail.lien },
      emailPrecompose: {
        sujet: mail.sujet,
        texte: mail.texte,
        replyTo: process.env.EMAIL_REPLY_TO || undefined,
      },
    });
    email = r.email === 'envoye' ? 'envoye' : r.email === 'file' ? 'file' : 'echec';
  }

  // Journal complété. Colonnes absentes (migration non jouée) : on s'en passe.
  if (ligneJournal?.id != null) {
    const { error: complement } = await db
      .from('member_moderation_events')
      .update({
        member_notified: email === 'envoye' || email === 'file',
        subscription_action: abonnement.action === 'aucune' ? null : `${abonnement.action}${abonnement.ok ? '' : ':echec'}`,
      })
      .eq('id', ligneJournal.id);
    if (complement) console.error('moderation: journal non complété :', complement.message);
  }

  return NextResponse.json({ ok: true, journal: !journal, email, abonnement, notesRecalculees });
}
