// Route Handler — autocomplétion des ingrédients (facette « Ingrédients » de
// la recherche avancée). Interroge `ingredient_refs` via la RPC
// `suggest_ingredients`, insensible à la casse et aux accents.
//
// Lecture seule, RLS appliquée via la session.
import { NextResponse } from 'next/server';
import { suggestIngredients } from '@/lib/search';

// Nombre de suggestions affichées sous le champ (maquette : 7 au maximum).
const MAX_SUGGESTIONS = 7;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const term = (searchParams.get('q') ?? '').trim();
  const items = await suggestIngredients(term, MAX_SUGGESTIONS);
  return NextResponse.json({ items });
}
