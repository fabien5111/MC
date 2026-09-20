// Route Handler — réinitialisation de l'éligibilité à l'essai gratuit d'un
// membre, depuis sa fiche (Admin → Membres → Abonnement).
//
// Détour obligé par une route serveur plutôt qu'un appel RPC direct depuis
// le navigateur (motif de toutes les autres actions de
// `MemberSubscriptionPanel`) : `mc_admin_reset_trial` doit supprimer la
// ligne `trials` qui bloque ce membre, or ce blocage peut porter sur une
// EMPREINTE D'ADRESSE (email_hash) plutôt que sur le user_id — le cas d'un
// ancien compte supprimé (§1.4 de docs/abonnements.md). Calculer cette
// empreinte exige `TRIAL_EMAIL_SALT`, un secret qui ne doit jamais rejoindre
// le bundle client (cf. lib/trial.ts) — d'où ce passage obligé côté serveur.
import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { hashTrialEmail } from '@/lib/trial';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  if (!(await isAdmin(user.id))) {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const motif = typeof body?.motif === 'string' ? body.motif.trim() : '';
  if (!motif) return NextResponse.json({ erreur: 'Motif requis.' }, { status: 400 });

  const supabase = await createClient();

  // L'empreinte est calculée en BEST-EFFORT : un membre sans e-mail connu, ou
  // `TRIAL_EMAIL_SALT` absente, ne doit pas empêcher de réinitialiser au
  // moins par user_id — c'est strictement une amélioration par rapport au
  // comportement d'avant ce correctif, jamais une régression.
  const { data: profil } = await supabase.from('profiles').select('email').eq('id', id).maybeSingle();
  let emailHash: string | null = null;
  if (profil?.email) {
    try {
      emailHash = hashTrialEmail(profil.email);
    } catch (e) {
      console.error('reinitialiser-essai: hashTrialEmail:', (e as Error).message);
    }
  }

  // `mc_admin_reset_trial` (paramètre p_email_hash) n'est pas encore dans
  // lib/database.types.ts tant que la migration n'a pas été régénérée —
  // appel non typé en attendant, même motif que les autres `mc_admin_*`
  // fraîchement modifiées dans ce chantier.
  const { error } = await (
    supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ error: { message: string } | null }>
  )('mc_admin_reset_trial', { p_user_id: id, p_reason: motif, p_email_hash: emailHash });

  if (error) {
    // Message BRUT, pas une traduction : c'est le motif de tout le reste de
    // ce panneau admin (`appeler()`, `MemberSubscriptionPanel.tsx`), pas
    // celui des routes tournées vers un membre (`/api/plans/essayer`). Un
    // administrateur qui clique ce bouton veut le diagnostic Postgres, pas
    // un message aimable qui le lui cache.
    console.error('reinitialiser-essai:', error.message);
    return NextResponse.json({ erreur: 'Erreur : ' + error.message }, { status: 422 });
  }

  return NextResponse.json({ ok: true });
}
