// Notion (JEP-408, lot 3) — échange du code de connexion contre un jeton.
//
// Le jeton est rendu au navigateur, qui le garde en mémoire le temps du choix
// d'une page puis l'oublie : rien n'est enregistré ici. L'adresse de retour
// doit être celle de la page de retour sur l'origine de la requête — Notion la
// compare de toute façon à celle déclarée dans l'intégration.
import { NextResponse } from 'next/server';
import { origineValide } from '@/lib/email-confirmation';
import { ErreurNotion, echangerCodeNotion } from '@/lib/notion-data';
import { CHEMIN_RETOUR_OAUTH } from '@/lib/stockage-en-ligne';
import { membreStockage } from '@/lib/stockage-en-ligne-route';

export const runtime = 'nodejs';

export async function POST(requete: Request) {
  const membre = await membreStockage();
  if ('refus' in membre) return membre.refus;

  const origine = origineValide(requete.headers.get('origin'));
  if (!origine) return NextResponse.json({ erreur: 'Origine inconnue.' }, { status: 400 });

  let code: unknown;
  try {
    code = ((await requete.json()) as { code?: unknown }).code;
  } catch {
    return NextResponse.json({ erreur: 'Requête illisible.' }, { status: 400 });
  }
  if (typeof code !== 'string' || !code || code.length > 512) {
    return NextResponse.json({ erreur: 'Code de connexion manquant.' }, { status: 400 });
  }

  try {
    const jeton = await echangerCodeNotion(code, `${origine}${CHEMIN_RETOUR_OAUTH}`);
    return NextResponse.json({ jeton }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const err = e instanceof ErreurNotion ? e : new ErreurNotion('La connexion à Notion a échoué.', 502);
    return NextResponse.json({ erreur: err.message }, { status: err.statut });
  }
}
