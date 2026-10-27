// Route Handler — gérer une liste personnelle (JEP-376, lot 3).
//
// PATCH { nom } ou { sens: 'haut' | 'bas' } : renommer ou déplacer — droit
//       `listes_recettes` exigé (après une rétrogradation, la liste se consulte
//       sans se réorganiser).
// DELETE : supprimer la liste et son contenu — toujours permis au propriétaire,
//       droit ou pas : rien ne doit retenir un membre de faire le ménage.
// La liste CAP n'est ni renommable, ni déplaçable, ni supprimable (filtre
// `kind = 'perso'` dans `lib/recipe-lists-data.ts`).
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifierAcces } from '@/lib/quota-route';
import { membreEcrivain } from '@/lib/recipe-lists-route';
import { deplacerListeEnBase, renommerListe, supprimerListe } from '@/lib/recipe-lists-data';
import { DROIT_LISTES_PERSO, NOM_LISTE_MAX, nomListeValide } from '@/lib/recipe-lists';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const membre = await membreEcrivain();
  if ('refus' in membre) return membre.refus;
  const refus = await verifierAcces(membre.userId, DROIT_LISTES_PERSO);
  if (refus) return refus;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  if (body?.sens === 'haut' || body?.sens === 'bas') {
    const res = await deplacerListeEnBase(admin, membre.userId, id, body.sens);
    return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ erreur: res.message }, { status: res.status });
  }
  const nom = nomListeValide(body?.nom);
  if (!nom) return NextResponse.json({ erreur: `Donnez un nom de 1 à ${NOM_LISTE_MAX} caractères.` }, { status: 400 });
  const res = await renommerListe(admin, membre.userId, id, nom);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ erreur: res.message }, { status: res.status });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const membre = await membreEcrivain();
  if ('refus' in membre) return membre.refus;
  const { id } = await params;
  const res = await supprimerListe(createAdminClient(), membre.userId, id);
  return res.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ erreur: res.message }, { status: res.status });
}
