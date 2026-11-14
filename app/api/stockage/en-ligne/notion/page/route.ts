// Notion (JEP-408, lot 3) — texte d'une page, pour l'import par texte.
//
// L'identifiant est contrôlé (UUID) avant d'entrer dans le chemin de l'API :
// c'est l'hôte Notion qui est appelé, jamais une adresse libre, mais un
// identifiant arbitraire pourrait sinon viser une autre ressource de l'API.
import { NextResponse } from 'next/server';
import { ErreurNotion, lirePageNotion } from '@/lib/notion-data';
import { idNotionValide } from '@/lib/stockage-en-ligne';
import { jetonDepuis, membreStockage } from '@/lib/stockage-en-ligne-route';

export const runtime = 'nodejs';

export async function GET(requete: Request) {
  const membre = await membreStockage();
  if ('refus' in membre) return membre.refus;
  const jeton = jetonDepuis(requete);
  if (!jeton) return NextResponse.json({ erreur: 'Connexion à Notion manquante.' }, { status: 401 });

  const id = new URL(requete.url).searchParams.get('id');
  if (!idNotionValide(id)) return NextResponse.json({ erreur: 'Page inconnue.' }, { status: 400 });

  try {
    const page = await lirePageNotion(jeton, id);
    return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const err = e instanceof ErreurNotion ? e : new ErreurNotion('Notion ne répond pas.', 502);
    return NextResponse.json({ erreur: err.message }, { status: err.statut });
  }
}
