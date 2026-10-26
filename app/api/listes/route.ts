// Route Handler — listes de recettes du membre (JEP-376).
//
// GET  ?recette=<id> : ce qu'affiche la fenêtre « Ajouter à une liste » —
//      listes du membre (CAP et personnelles), celles qui contiennent la
//      recette, favori ou non, et les droits. Lecture sous la session (RLS).
// POST { nom }       : crée une liste personnelle (droit `listes_recettes`,
//      plafond de la grille). Écriture avec la clé service_role : les tables
//      de listes n'ont aucune policy d'écriture (cf. `lib/recipe-lists.ts`).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { canAccess, getLimit } from '@/lib/entitlements';
import { getEntitlements } from '@/lib/entitlements-data';
import { verifierAcces } from '@/lib/quota-route';
import { membreEcrivain } from '@/lib/recipe-lists-route';
import { compterListesPerso, creerListe, getListesContenant, getListesDuMembre } from '@/lib/recipe-lists-data';
import { DROIT_LISTE_CAP, DROIT_LISTES_PERSO, NOM_LISTE_MAX, nomListeValide, plafondListesAtteint } from '@/lib/recipe-lists';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  const recipeId = new URL(req.url).searchParams.get('recette') || '';

  const supabase = await createClient();
  const [listes, contenant, droits, favori] = await Promise.all([
    getListesDuMembre(user.id),
    recipeId ? getListesContenant(user.id, recipeId) : Promise.resolve(new Set<string>()),
    getEntitlements(user.id),
    recipeId
      ? supabase.from('favorites').select('recipe_id').eq('user_id', user.id).eq('recipe_id', recipeId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return NextResponse.json({
    listes: listes.map((l) => ({ ...l, contient: contenant.has(l.id) })),
    favori: !!favori.data,
    droits: {
      cap: canAccess(droits, DROIT_LISTE_CAP),
      perso: canAccess(droits, DROIT_LISTES_PERSO),
      max: getLimit(droits, DROIT_LISTES_PERSO),
    },
  });
}

export async function POST(req: Request) {
  const membre = await membreEcrivain();
  if ('refus' in membre) return membre.refus;
  const refus = await verifierAcces(membre.userId, DROIT_LISTES_PERSO);
  if (refus) return refus;

  const body = await req.json().catch(() => ({}));
  const nom = nomListeValide(body?.nom);
  if (!nom) return NextResponse.json({ erreur: `Donnez un nom de 1 à ${NOM_LISTE_MAX} caractères.` }, { status: 400 });

  const admin = createAdminClient();
  const limite = getLimit(await getEntitlements(membre.userId), DROIT_LISTES_PERSO);
  if (plafondListesAtteint(await compterListesPerso(admin, membre.userId), limite)) {
    return NextResponse.json(
      { erreur: `Votre formule permet ${limite} listes. Supprimez-en une pour en créer une autre.`, code: 'QUOTA_EPUISE' },
      { status: 429 },
    );
  }
  const res = await creerListe(admin, membre.userId, nom);
  if (!res.ok) return NextResponse.json({ erreur: res.message }, { status: res.status });
  return NextResponse.json({ ok: true, liste: res.liste });
}
