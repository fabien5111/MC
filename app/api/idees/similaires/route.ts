// Route Handler — suggestions anti-doublons pendant la frappe du titre (vue
// création de la boîte à idées). Interroge `ideas` via la RPC
// `suggest_similar_ideas` (FTS français + repli trigramme).
//
// Lecture seule, RLS appliquée via la session.
import { NextResponse } from 'next/server';
import { suggestSimilarIdeas } from '@/lib/ideas-data';

const MAX_SUGGESTIONS = 5;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const term = (searchParams.get('q') ?? '').trim();
  const items = await suggestSimilarIdeas(term, MAX_SUGGESTIONS);
  return NextResponse.json({ items });
}
