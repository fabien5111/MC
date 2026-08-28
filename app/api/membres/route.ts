// Route Handler — recherche de membres pour les deux dialogs de partage
// interne (carnet entier et recette précise). Motif `app/api/ingredients` :
// route mince, la logique vit dans `lib/shares.ts` (`searchMembers`).
//
// Connecté uniquement : un visiteur non connecté n'a de toute façon aucun
// écran de partage à ouvrir.
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { searchMembers } from '@/lib/shares-data';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const term = searchParams.get('q') ?? '';

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ items: [] });

  const items = await searchMembers(term, user.id);
  return NextResponse.json({ items });
}
