// Route Handler — démarrage de l'essai gratuit (spec §7.2, §9.2).
//
// Côté serveur uniquement : `hashTrialEmail` a besoin de `TRIAL_EMAIL_SALT`
// (secret), et l'e-mail du membre — nécessaire au calcul — ne doit jamais
// transiter depuis le navigateur. `mc_start_trial` revérifie tout côté base
// (plan éligible, essai déjà consommé, abonnement actif) : cette route ne
// fait que fournir l'empreinte, jamais la décision.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { hashTrialEmail } from '@/lib/trial';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!user.email) return NextResponse.json({ erreur: 'Adresse e-mail introuvable sur ce compte.' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const planCode = typeof body?.plan === 'string' ? body.plan.trim().toUpperCase() : '';
  if (!planCode) return NextResponse.json({ erreur: 'Plan manquant.' }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.rpc('mc_start_trial', {
    p_plan_code: planCode,
    p_email_hash: hashTrialEmail(user.email),
  });

  if (error) {
    const messages: Record<string, string> = {
      MC_TRIAL_ALREADY: 'Vous avez déjà utilisé votre essai gratuit — tous plans confondus, une seule fois par membre.',
      MC_TRIAL_ACTIVE_SUB: 'Un abonnement est déjà actif sur ce compte.',
      MC_TRIAL_PLAN: "Ce plan ne propose pas d'essai gratuit.",
      MC_TRIAL_READONLY: 'Session de consultation (lecture seule) : action impossible.',
    };
    const code = error.message.split(':')[0];
    // Code non prévu par cette table : on le journalise pour pouvoir
    // l'ajouter à la liste plutôt que de laisser un message muet sans trace.
    if (!messages[code]) console.error('plans/essayer mc_start_trial:', error.message);
    return NextResponse.json({ erreur: messages[code] ?? "L'essai n'a pas pu démarrer." }, { status: 422 });
  }

  // Certains plans redirigent l'essai vers une version aux quotas propres
  // (`plans.trial_grant_plan_id` — ex. Pro → Essai Pro, mêmes droits sauf les
  // quotas IA, réglables séparément en back-office). Best-effort et non
  // bloquant : sans redirection configurée pour ce plan, ou en cas d'échec,
  // l'essai garde les droits du plan demandé — jamais un essai qui échoue à
  // démarrer pour une raison qui ne regarde pas le membre.
  //
  // `mc_redirect_trial_plan_version` n'est pas encore dans
  // lib/database.types.ts tant que la migration n'a pas été régénérée —
  // appel non typé, même motif que `mc_publish_plan_version` dans
  // PlansManager.
  const { error: erreurRedirection } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>
  )('mc_redirect_trial_plan_version', { p_source_plan_code: planCode });
  if (erreurRedirection) console.error('plans/essayer redirect:', erreurRedirection.message);

  return NextResponse.json({ ok: true });
}
