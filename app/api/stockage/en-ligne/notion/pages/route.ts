// Notion (JEP-408, lot 3) — pages partagées avec Je pâtisse !, filtrées par
// une recherche facultative. Le jeton arrive dans `Authorization`, n'est ni
// journalisé ni conservé (cf. lib/notion-data.ts).
import { NextResponse } from 'next/server';
import { ErreurNotion, chercherPagesNotion } from '@/lib/notion-data';
import { jetonDepuis, membreStockage } from '@/lib/stockage-en-ligne-route';

export const runtime = 'nodejs';

export async function GET(requete: Request) {
  const membre = await membreStockage();
  if ('refus' in membre) return membre.refus;
  const jeton = jetonDepuis(requete);
  if (!jeton) return NextResponse.json({ erreur: 'Connexion à Notion manquante.' }, { status: 401 });

  const recherche = new URL(requete.url).searchParams.get('q') ?? '';
  try {
    const pages = await chercherPagesNotion(jeton, recherche);
    return NextResponse.json({ pages }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const err = e instanceof ErreurNotion ? e : new ErreurNotion('Notion ne répond pas.', 502);
    return NextResponse.json({ erreur: err.message }, { status: err.statut });
  }
}
