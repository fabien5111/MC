// Route Handler — ranger un ingrédient dans la liste de courses « À racheter »
// (JEP-379, plans Plus et Pro, droit `liste_a_racheter`).
//
// Côté serveur et non depuis le navigateur : le droit d'abonnement est
// vérifié ici, pas seulement par le masquage du picto, et la liste système
// ne peut naître que par la clé service_role (cf. `lib/a-racheter-data.ts`).
// Le navigateur n'envoie qu'un nom et, le cas échéant, une entrée du
// référentiel — revérifiée ici.
import { NextResponse } from 'next/server';
import { membreEcrivain } from '@/lib/recipe-lists-route';
import { verifierAcces } from '@/lib/quota-route';
import { getIngredientRefsList } from '@/lib/data/reference';
import { resolveIngredientRefId } from '@/lib/ingredient-conversions';
import { fixOeufLigature } from '@/lib/text';
import { A_RACHETER_NOM_MAX, DROIT_A_RACHETER, messageAjout } from '@/lib/a-racheter';
import { ARacheterIndisponible, ajouterARacheter } from '@/lib/a-racheter-data';
import { MissingServiceKeyError } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const membre = await membreEcrivain();
  if ('refus' in membre) return membre.refus;
  const refus = await verifierAcces(membre.userId, DROIT_A_RACHETER);
  if (refus) return refus;

  const body = await req.json().catch(() => ({}));
  const brut = typeof body?.nom === 'string' ? body.nom.replace(/\s+/g, ' ').trim().slice(0, A_RACHETER_NOM_MAX) : '';
  const nom = fixOeufLigature(brut);
  if (!nom) return NextResponse.json({ erreur: 'Ingrédient sans nom.' }, { status: 400 });

  // Rattachement au référentiel : celui de la ligne de fournée s'il existe
  // vraiment, sinon déduit du nom — sans quoi conversions et fusions des
  // courses ne s'appliqueraient pas à cet article.
  const refs = await getIngredientRefsList();
  const refDemande = Number.isInteger(body?.refId) ? (body.refId as number) : null;
  const refId = refDemande != null && refs.some((r) => r.id === refDemande) ? refDemande : resolveIngredientRefId(nom, refs);

  try {
    const action = await ajouterARacheter(membre.userId, nom, refId);
    return NextResponse.json({ action, message: messageAjout(action, nom) });
  } catch (e) {
    if (e instanceof ARacheterIndisponible || e instanceof MissingServiceKeyError) {
      return NextResponse.json({ erreur: e.message }, { status: 503 });
    }
    console.error('a-racheter:', (e as Error).message);
    return NextResponse.json({ erreur: 'Ajout impossible pour le moment.' }, { status: 500 });
  }
}
