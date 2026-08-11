// Route Handler — compte seul des résultats de la recherche avancée.
//
// Sert uniquement au tiroir mobile : les critères n'y sont appliqués qu'à la
// validation, mais le bouton de pied annonce le nombre de recettes en direct
// (« Voir les 18 recettes »). Il faut donc un comptage dissocié de la requête
// de résultats — la RPC est appelée en mode `count_only`, aucune carte n'est
// construite.
//
// Lecture seule, RLS appliquée via la session (mêmes policies que la page).
import { NextResponse } from 'next/server';
import { parseSearchCriteria } from '@/lib/search-params';
import { countAdvancedAll } from '@/lib/search';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = Object.fromEntries(searchParams.entries());
  const { total, authorTotal } = await countAdvancedAll(parseSearchCriteria(raw));
  return NextResponse.json({ total, authorTotal });
}
