// Route Handler — édition du `price_id` Stripe mensuel d'un plan (lot F,
// §14 de docs/abonnements.md : « billing_prices » n'avait aucun écran, une
// requête SQL directe était nécessaire pour changer un tarif).
//
// Écriture par la route uniquement, comme les autres tables `billing_*` :
// `billing_prices` n'a qu'une policy de lecture administrateur, aucune
// d'écriture — même doctrine que `enregistrerClientStripe`.
//
// Périmètre volontairement réduit (portée « option A » retenue) : modifie
// UNIQUEMENT le `price_id` déjà rattaché (ou en pose un premier) pour la
// périodicité MENSUELLE, dans le mode Stripe (test/live) de la clé en
// vigueur sur CE serveur — jamais l'autre mode, jamais l'annuel (aucune ligne
// YEARLY n'existe encore, §14). Un champ vidé supprime la ligne plutôt que
// d'y écrire une chaîne vide, pour rendre un plan de nouveau invendable
// exactement comme `PRO_ESSAI` (résolu par `resoudrePrixStripe` → `null` →
// 422, jamais une panne).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getProfile } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { configStripe, MissingStripeConfigError } from '@/lib/billing-data';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });

  const me = await getProfile(user.id);
  if (me?.role !== 'admin') {
    return NextResponse.json({ erreur: 'Réservé aux administrateurs.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const planCode = typeof body?.planCode === 'string' ? body.planCode.trim().toUpperCase() : '';
  const priceId = typeof body?.priceId === 'string' ? body.priceId.trim() : '';
  if (!planCode) return NextResponse.json({ erreur: 'Plan manquant.' }, { status: 400 });

  let mode: string;
  try {
    mode = configStripe().mode;
  } catch (e) {
    if (e instanceof MissingStripeConfigError) {
      return NextResponse.json({ erreur: e.message }, { status: 503 });
    }
    throw e;
  }

  const admin = createAdminClient();
  const { data: plan } = await admin.from('plans').select('id').eq('code', planCode).maybeSingle();
  if (!plan) return NextResponse.json({ erreur: 'Formule inconnue.' }, { status: 422 });

  const filtre = { plan_id: plan.id, mode, periodicity: 'MONTHLY', provider: 'stripe' };

  if (!priceId) {
    const { error } = await admin.from('billing_prices').delete().match(filtre);
    if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, priceId: null });
  }

  const { data: existant } = await admin.from('billing_prices').select('id').match(filtre).maybeSingle();
  const { error } = existant
    ? await admin.from('billing_prices').update({ external_price_id: priceId }).eq('id', existant.id)
    : await admin.from('billing_prices').insert({ ...filtre, external_price_id: priceId });
  if (error) return NextResponse.json({ erreur: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, priceId });
}
