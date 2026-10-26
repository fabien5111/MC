// Route Handler — ajouter une recette à la liste CAP du membre, ou l'en
// retirer (JEP-376, lot 1, droit `carnet_cap`).
//
// Seule porte d'écriture de `recipe_lists` / `recipe_list_items` : la RLS ne
// connaît pas les formules, elle ne pourrait donc pas réserver la liste CAP au
// droit `carnet_cap`. Ces tables n'ont qu'une policy de lecture (propriétaire) ;
// l'écriture se fait ici, avec la clé service_role, une fois vérifiés le
// membre, son compte, sa session et son droit.
//
// La recette est relue SOUS LA SESSION (RLS) : on ne range que ce qu'on peut
// lire — jamais le brouillon d'un autre, jamais un projet en cours. Le retrait,
// lui, reste toujours possible avec le droit, même si la recette est devenue
// illisible entre-temps.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { isProjectDraft } from '@/lib/projects';
import { isReadOnlySession } from '@/lib/impersonation';
import { refusSiCompteBloque } from '@/lib/moderation-route';
import { verifierAcces } from '@/lib/quota-route';
import { basculerListeCap } from '@/lib/recipe-lists-data';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ erreur: 'Connexion requise.' }, { status: 401 });
  const compteBloque = await refusSiCompteBloque(user.id);
  if (compteBloque) return compteBloque;
  if (await isReadOnlySession()) {
    return NextResponse.json({ erreur: 'Session de consultation (lecture seule).' }, { status: 403 });
  }
  const refus = await verifierAcces(user.id, 'carnet_cap');
  if (refus) return refus;

  const body = await req.json().catch(() => ({}));
  const recipeId = typeof body?.recipeId === 'string' ? body.recipeId : '';
  const dans = body?.dans === true;
  if (!recipeId) return NextResponse.json({ erreur: 'Recette manquante.' }, { status: 400 });

  if (dans) {
    const supabase = await createClient();
    const { data: recette } = await supabase
      .from('recipes')
      .select('id, kind, project_stage')
      .eq('id', recipeId)
      .maybeSingle();
    if (!recette || isProjectDraft(recette)) {
      return NextResponse.json({ erreur: 'Recette introuvable ou inaccessible.' }, { status: 404 });
    }
  }

  const res = await basculerListeCap(createAdminClient(), user.id, recipeId, dans);
  if (!res.ok) return NextResponse.json({ erreur: res.message }, { status: res.status });
  return NextResponse.json({ ok: true, dans });
}
