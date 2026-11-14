// Passerelle Google Photos (JEP-408, lot 2).
//
// Une photo choisie dans Google Photos se télécharge par une adresse
// temporaire (`baseUrl`, valable 60 min) qui exige le jeton du membre. Le
// navigateur essaie d'abord seul ; s'il en est empêché (CORS), il passe par
// ici. Ce que fait la route, et rien d'autre :
//  - l'adresse doit être un hôte de médias Google Photos (`hotePhotosAutorise`,
//    liste blanche stricte) — sans ce contrôle, n'importe quel membre ferait
//    interroger le réseau interne par le serveur (SSRF) ;
//  - aucune redirection suivie (une redirection mènerait hors de la liste) ;
//  - réponse plafonnée en taille et limitée aux images ;
//  - le jeton n'est ni journalisé ni conservé, les octets ne sont pas gardés :
//    ils repartent tels quels vers le navigateur, qui les compresse et les
//    dépose sur Swift comme un fichier local.
import { NextResponse } from 'next/server';
import { jetonDepuis, membreStockage } from '@/lib/stockage-en-ligne-route';
import { MAX_OCTETS_SOURCE, TYPES_IMAGE, hotePhotosAutorise } from '@/lib/stockage-en-ligne';

export const runtime = 'nodejs';

const DELAI_MS = 20_000;

function refus(message: string, statut: number) {
  return NextResponse.json({ erreur: message }, { status: statut });
}

export async function POST(requete: Request) {
  const membre = await membreStockage();
  if ('refus' in membre) return membre.refus;

  const jeton = jetonDepuis(requete);
  if (!jeton) return refus('Connexion à Google Photos manquante.', 401);

  let url: unknown;
  try {
    url = ((await requete.json()) as { url?: unknown }).url;
  } catch {
    return refus('Requête illisible.', 400);
  }
  if (typeof url !== 'string' || !hotePhotosAutorise(url)) {
    return refus('Adresse refusée : seuls les médias de Google Photos sont acceptés.', 400);
  }

  let reponse: Response;
  try {
    reponse = await fetch(url, {
      headers: { Authorization: `Bearer ${jeton}` },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(DELAI_MS),
    });
  } catch {
    return refus('Google Photos ne répond pas.', 502);
  }
  if (!reponse.ok) return refus(`Google Photos a refusé la photo (${reponse.status}).`, 502);

  const type = (reponse.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (!TYPES_IMAGE.includes(type)) return refus('Format de photo non pris en charge.', 415);
  const longueur = Number(reponse.headers.get('content-length') ?? '0');
  if (longueur > MAX_OCTETS_SOURCE) return refus('Photo trop volumineuse.', 413);

  const octets = await reponse.arrayBuffer();
  if (octets.byteLength > MAX_OCTETS_SOURCE) return refus('Photo trop volumineuse.', 413);

  return new NextResponse(octets, {
    status: 200,
    headers: { 'Content-Type': type, 'Cache-Control': 'no-store' },
  });
}
