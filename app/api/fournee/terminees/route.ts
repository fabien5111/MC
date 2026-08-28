// Route Handler — page suivante de « Fournées terminées » (écran « En
// cuisine »). `getBatches(..., 'terminees')` ne charge que les
// `TERMINEES_PAGE_SIZE` fournées closes les plus récentes (cf. lib/profile.ts) :
// cette route sert les pages suivantes au clic sur « Voir plus »,
// jamais chargées d'office.
//
// Lecture seule, RLS appliquée via la session — `getBatches` ne lit que les
// fournées du membre connecté (`eq('user_id', userId)`).
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getBatches } from '@/lib/profile';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ items: [] }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

  const items = await getBatches(user.id, 'terminees', offset);
  return NextResponse.json({ items });
}
