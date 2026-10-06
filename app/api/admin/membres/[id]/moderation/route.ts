// Route Handler — suspension, désactivation et levée d'un membre (JEP-272,
// lot 1). Réservée à l'admin complet, comme toute la fiche membre.
//
// Trois gestes, dans cet ordre :
// 1. `profiles` (statut, motif, date de fin) — c'est ce que lisent la garde
//    de `requireUser()`, celle des routes API et la RLS
//    (`public.is_blocked_user()`) : le blocage est effectif dès cette
//    écriture, sessions déjà ouvertes comprises ;
// 2. le journal (`member_moderation_events`) — avant le bannissement, pour
//    qu'un échec GoTrue ne fasse pas disparaître la trace d'une décision déjà
//    effective ;
// 3. le bannissement GoTrue (`ban_duration`) — empêche de se reconnecter, par
//    e-mail comme par Google, et de renouveler un jeton (GoTrue refuse le
//    `refresh_token` d'un compte banni) : une session ouverte meurt donc au
//    plus tard à l'expiration de son jeton d'accès.
//
// Les sessions (`auth.sessions`) ne sont pas supprimées une à une : le schéma
// `auth` n'est pas exposé par PostgREST, et le bannissement produit déjà
// l'effet recherché (aucun renouvellement possible). La déconnexion forcée
// sans sanction, prévue au lot 3, en aura besoin.
//
// Échec partiel (statut écrit, bannissement refusé par GoTrue) : réponse 502
// explicite. Le compte est alors bloqué par l'application mais peut encore se
// connecter — relancer l'action suffit, elle est idempotente.
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getVerifiedUser, isAdmin } from '@/lib/auth';
import { createAdminClient, MissingServiceKeyError } from '@/lib/supabase/admin';
import {
  ACTION_JOURNAL,
  colonnesProfil,
  dureeBannissement,
  etatModeration,
  validerDemandeModeration,
} from '@/lib/moderation';
import { lireLigneModeration } from '@/lib/moderation-data';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Vérification forte (serveur d'authentification), comme le reste du
  // back-office : un droit d'admin retiré ne doit pas survivre à son jeton.
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }

  const { id: cibleId } = await params;
  const body = await req.json().catch(() => ({}));

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    if (e instanceof MissingServiceKeyError) return NextResponse.json({ erreur: e.message }, { status: 503 });
    throw e;
  }

  const { data: cible } = await admin.from('profiles').select('id, role').eq('id', cibleId).maybeSingle();
  if (!cible) return NextResponse.json({ erreur: 'Membre introuvable.' }, { status: 404 });

  const maintenant = new Date();
  const verdict = validerDemandeModeration(
    body ?? {},
    {
      acteurId: user.id,
      cibleId,
      cibleRole: cible.role ?? null,
      etatActuel: etatModeration(await lireLigneModeration(admin, cibleId), maintenant),
    },
    maintenant,
  );
  if (!verdict.ok) return NextResponse.json({ erreur: verdict.erreur }, { status: 400 });
  const demande = verdict.demande;

  // 1. Statut — non typé : colonnes absentes de `database.types.ts` jusqu'à
  // la régénération.
  const db = admin as unknown as SupabaseClient;
  const { error: ecriture } = await db.from('profiles').update(colonnesProfil(demande)).eq('id', cibleId);
  if (ecriture) {
    return NextResponse.json({ erreur: `Enregistrement du statut impossible : ${ecriture.message}` }, { status: 500 });
  }

  // 2. Journal.
  const { error: journal } = await db.from('member_moderation_events').insert({
    member_id: cibleId,
    admin_id: user.id,
    action: ACTION_JOURNAL[demande.action],
    reason: demande.motif,
    suspended_until: demande.action === 'suspendre' ? demande.jusquAu : null,
  });
  if (journal) console.error('moderation: journal non écrit :', journal.message);

  // 3. Bannissement GoTrue.
  const { error: ban } = await admin.auth.admin.updateUserById(cibleId, {
    ban_duration: dureeBannissement(demande, maintenant),
  });
  if (ban) {
    return NextResponse.json(
      {
        erreur:
          `Statut enregistré, mais le serveur d'authentification a refusé le bannissement (${ban.message}). ` +
          'Le compte est bloqué sur le site mais peut encore se connecter : relancez l’action.',
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, journal: !journal });
}
