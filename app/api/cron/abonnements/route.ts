// Route Handler — tâche planifiée quotidienne (spec §7.5, §10).
//
// Trois passes, dans cet ordre :
//  1. Transition ACTIF → EXPIRE des abonnements dont la date de fin est
//     dépassée. Le calcul des droits n'en dépend PAS — `mc_effective_rights`
//     teste `ends_at > now()` en direct — cette passe ne fait que
//     matérialiser un état déjà vrai, pour l'affichage (back-office,
//     historique) et pour déclencher la notification J+1.
//  2. Notification d'expiration (J+1).
//  3. Avertissements avant échéance (J-3 / J-1), essai comme abonnement payant.
//
// **Idempotence** : chaque envoi passe par `claimNotification`, qui réserve
// et marque en une seule opération sous la garantie d'unicité
// `(subscription_id, notification_type)`. Exécuter cette route deux fois de
// suite ne relance aucune passe côté base (les lignes déjà EXPIRE ne sont
// plus sélectionnées par la passe 1) et ne renvoie aucun e-mail ni
// notification en double (passes 2 et 3, bloquées par la réservation).
//
// **Fenêtres bornées** : les passes 2 et 3 ne relisent pas la table entière,
// seulement les sept derniers jours (expiration) ou les trois prochains
// jours (échéance). Une notification qui aurait dû partir mais n'est jamais
// réclamée dans cette fenêtre (plusieurs jours de cron manqués) ne sera plus
// jamais envoyée — un compromis assumé : le job reste rapide et borné plutôt
// que de récupérer indéfiniment un retard, qui serait de toute façon un
// symptôme à traiter à la main, pas à automatiser.
//
// Aucun cache à invalider (contrairement au §7.5 de la spécification) :
// les droits d'un membre ne sont jamais mis en cache entre deux requêtes
// (`cache()` React, par requête uniquement — cf. docs/abonnements.md §4).
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGrid, getRightsForVersion } from '@/lib/entitlements-data';
import { claimNotification, createNotification, getNotifyEmailPreference } from '@/lib/notifications-data';
import { lostFeatureLabels } from '@/lib/entitlements';
import { composeNotification, type NotificationType } from '@/lib/notification-content';
import { envoyerEmail } from '@/lib/mail';

export const maxDuration = 60;

type LigneAbonnement = {
  id: number;
  user_id: string;
  type: string;
  starts_at: string;
  ends_at: string | null;
  plan_version_id: number;
  plan_versions: { plans: { code: string; label: string } };
};
type Profil = { email: string | null; full_name: string | null };
type SubscriptionsSelect = {
  select: (cols: string) => {
    eq: (col: string, value: string) => {
      neq: (col: string, value: string) => {
        not: (col: string, op: string, value: unknown) => {
          gt: (col: string, value: string) => {
            lte: (col: string, value: string) => PromiseLike<{ data: LigneAbonnement[] | null; error: { message: string } | null }>;
          };
        };
        gte: (col: string, value: string) => PromiseLike<{ data: LigneAbonnement[] | null; error: { message: string } | null }>;
      };
    };
  };
};
type ProfilesSelect = {
  select: (cols: string) => { eq: (col: string, value: string) => { maybeSingle: () => PromiseLike<{ data: Profil | null }> } };
};

async function envoyer(
  admin: ReturnType<typeof createAdminClient>,
  ligne: LigneAbonnement,
  type: NotificationType,
  lost: string[],
): Promise<void> {
  const claimed = await claimNotification(admin, ligne.user_id, ligne.id, type);
  if (!claimed) return;

  const { data: profil } = await (admin.from('profiles' as never) as unknown as ProfilesSelect)
    .select('email, full_name')
    .eq('id', ligne.user_id)
    .maybeSingle();

  const content = composeNotification(type, {
    fullName: profil?.full_name ?? null,
    planLabel: ligne.plan_versions.plans.label,
    dateIso: ligne.ends_at ?? new Date().toISOString(),
    lostFeatures: lost,
  });

  await createNotification(admin, ligne.user_id, type, content.title, content.body);

  // Notifications in-app d'expiration toujours affichées (spec §10) : la
  // préférence ne conditionne QUE l'e-mail, jamais leur écrite ci-dessus.
  if (profil?.email && (await getNotifyEmailPreference(ligne.user_id))) {
    await envoyerEmail({ to: profil.email, subject: content.emailSubject, html: content.emailHtml, text: content.emailText });
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ erreur: "CRON_SECRET n'est pas configuré côté serveur." }, { status: 503 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ erreur: 'Non autorisé.' }, { status: 401 });
  }

  const admin = createAdminClient();
  const maintenant = new Date();
  const nowIso = maintenant.toISOString();

  // ── Passe 1 : expiration ────────────────────────────────────
  const { data: expirees, error: erreurExpiration } = await admin
    .from('subscriptions')
    .update({ status: 'EXPIRED' })
    .eq('status', 'ACTIVE')
    .neq('type', 'DEFAULT')
    .lt('ends_at', nowIso)
    .select('id');
  if (erreurExpiration) console.error('cron/abonnements: expiration échouée :', erreurExpiration.message);

  const grid = await getGrid();
  const planDefaut = grid.plans.find((p) => p.isDefault);
  const droitsDefaut = planDefaut ? (grid.rights[planDefaut.code] ?? {}) : {};

  let notifiesExpiration = 0;
  let notifiesJ3 = 0;
  let notifiesJ1 = 0;

  // ── Passe 2 : expiration, J+1 ────────────────────────────────
  // Fenêtre de sept jours : cf. commentaire d'en-tête sur les fenêtres bornées.
  const ilSeptJours = new Date(maintenant.getTime() - 7 * 86_400_000).toISOString();
  const { data: expireesRecentes } = await (
    admin.from('subscriptions' as never) as unknown as SubscriptionsSelect
  )
    .select('id, user_id, type, starts_at, ends_at, plan_version_id, plan_versions!inner(plans!inner(code, label))')
    .eq('status', 'EXPIRED')
    .neq('type', 'DEFAULT')
    .gte('ends_at', ilSeptJours);

  for (const ligne of expireesRecentes ?? []) {
    const avant = await getRightsForVersion(ligne.plan_version_id);
    const perdu = lostFeatureLabels(avant, droitsDefaut, grid.features);
    await envoyer(admin, ligne, 'EXPIRED_J1', perdu);
    notifiesExpiration++;
  }

  // ── Passe 3 : avertissements avant échéance ──────────────────
  const dansTroisJours = new Date(maintenant.getTime() + 3 * 86_400_000).toISOString();
  const { data: echeanceProche } = await (
    admin.from('subscriptions' as never) as unknown as SubscriptionsSelect
  )
    .select('id, user_id, type, starts_at, ends_at, plan_version_id, plan_versions!inner(plans!inner(code, label))')
    .eq('status', 'ACTIVE')
    .neq('type', 'DEFAULT')
    .not('ends_at', 'is', null)
    .gt('ends_at', nowIso)
    .lte('ends_at', dansTroisJours);

  for (const ligne of echeanceProche ?? []) {
    if (!ligne.ends_at) continue;
    const finMs = new Date(ligne.ends_at).getTime();
    const debutMs = new Date(ligne.starts_at).getTime();
    const joursRestants = Math.ceil((finMs - maintenant.getTime()) / 86_400_000);
    const dureeTotaleJours = Math.ceil((finMs - debutMs) / 86_400_000);

    const estJ1 = joursRestants <= 1;
    // Un abonnement de moins de 3 jours n'a pas de point J-3 dans sa durée de
    // vie (il tomberait avant même son début) : on ne le déclenche jamais
    // pour lui, seul J-1 s'applique — c'est la règle du §10, portée ici par
    // la comparaison de durée plutôt que par un drapeau séparé.
    const estJ3 = !estJ1 && joursRestants <= 3 && dureeTotaleJours >= 3;
    if (!estJ1 && !estJ3) continue;

    // Droits actuels du plan (grille courante) comparés au plan par défaut :
    // simplification assumée par rapport à EXPIRED_J1, qui lit la version
    // EXACTEMENT souscrite — ici l'abonnement est encore actif, la mise en
    // garde porte sur ce qui se passerait « si rien ne change d'ici là ».
    const avant = grid.rights[ligne.plan_versions.plans.code] ?? {};
    const perdu = lostFeatureLabels(avant, droitsDefaut, grid.features);
    const type: NotificationType = ligne.type === 'TRIAL' ? (estJ1 ? 'TRIAL_J1' : 'TRIAL_J3') : estJ1 ? 'SUB_J1' : 'SUB_J3';
    await envoyer(admin, ligne, type, perdu);
    if (estJ1) notifiesJ1++;
    else notifiesJ3++;
  }

  return NextResponse.json({
    ok: true,
    expirees: expirees?.length ?? 0,
    notifiesExpiration,
    notifiesJ3,
    notifiesJ1,
  });
}
