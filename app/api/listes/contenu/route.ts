// Route Handler — ranger une recette dans une liste, ou l'en retirer
// (JEP-376). Corps : { recipeId, liste: <id> | 'cap', dans: boolean }.
//
// Seule porte d'écriture de `recipe_list_items` (clé service_role, aucune
// policy d'écriture : la RLS ne connaît pas les formules). Contrôles :
//  - la liste appartient au membre (`lireListe`) ; « cap » désigne sa liste
//    CAP, créée au premier ajout ;
//  - AJOUTER exige le droit de la liste (`carnet_cap` pour la liste CAP,
//    `listes_recettes` pour une liste personnelle) et une recette que la
//    session peut lire (RLS), qui ne soit pas un projet en cours ;
//  - RETIRER reste toujours possible : après une rétrogradation, la liste se
//    vide sans le droit.
// « Favoris » n'est pas une liste réelle : le navigateur écrit `favorites`
// directement, comme le cœur.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isProjectDraft } from '@/lib/projects';
import { verifierAcces } from '@/lib/quota-route';
import { membreEcrivain } from '@/lib/recipe-lists-route';
import { basculerContenu, idListeCap, lireListe } from '@/lib/recipe-lists-data';
import { LISTE_KIND_CAP, droitDeListe, type ListeKind } from '@/lib/recipe-lists';

export async function POST(req: Request) {
  const membre = await membreEcrivain();
  if ('refus' in membre) return membre.refus;

  const body = await req.json().catch(() => ({}));
  const recipeId = typeof body?.recipeId === 'string' ? body.recipeId : '';
  const cible = typeof body?.liste === 'string' ? body.liste : '';
  const dans = body?.dans === true;
  if (!recipeId || !cible) return NextResponse.json({ erreur: 'Recette ou liste manquante.' }, { status: 400 });

  const admin = createAdminClient();
  let liste: { id: string; kind: ListeKind } | null = null;
  if (cible === LISTE_KIND_CAP) {
    if (dans) {
      const refus = await verifierAcces(membre.userId, droitDeListe(LISTE_KIND_CAP));
      if (refus) return refus;
    }
    const id = await idListeCap(admin, membre.userId, dans);
    if (!id) {
      if (!dans) return NextResponse.json({ ok: true, dans });
      return NextResponse.json({ erreur: 'Liste CAP indisponible pour le moment.' }, { status: 500 });
    }
    liste = { id, kind: LISTE_KIND_CAP };
  } else {
    liste = await lireListe(admin, membre.userId, cible);
    if (!liste) return NextResponse.json({ erreur: 'Liste introuvable.' }, { status: 404 });
    if (dans) {
      const refus = await verifierAcces(membre.userId, droitDeListe(liste.kind));
      if (refus) return refus;
    }
  }

  if (dans) {
    const supabase = await createClient();
    const { data: recette } = await supabase.from('recipes').select('id, kind, project_stage').eq('id', recipeId).maybeSingle();
    if (!recette || isProjectDraft(recette)) {
      return NextResponse.json({ erreur: 'Recette introuvable ou inaccessible.' }, { status: 404 });
    }
  }

  const res = await basculerContenu(admin, liste.id, recipeId, dans);
  if (!res.ok) return NextResponse.json({ erreur: res.message }, { status: res.status });
  return NextResponse.json({ ok: true, dans });
}
