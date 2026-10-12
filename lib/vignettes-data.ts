// Vignettes d'une photo de recette, fabriquées CÔTÉ SERVEUR. Server-only
// (`sharp`, clés de signature).
//
// Pourquoi pas dans le navigateur : relire dans un `<canvas>` une photo déjà
// sur Swift exige un en-tête CORS que le conteneur ne renvoie qu'à certaines
// requêtes (cf. CLAUDE.md « Images ») — la vignette échouait en silence et la
// carte retombait sur l'illustration par défaut. Entre le serveur et Swift,
// il n'y a ni CORS ni cache de navigateur : la cause disparaît au lieu d'être
// contournée.
import sharp from 'sharp';

import { CACHE_CONTROL_PUBLIC, nouvelleCleObjet } from '@/lib/storage';
import { cleDepuisUrlCanonique, urlCanonique, urlDeTeleversement } from '@/lib/storage-data';

// Mêmes dimensions et qualités que CreerForm (`hero_thumb_url` ~96 px des
// listes de fournées, `hero_card_url` ~480 px des cartes recette).
export const VIGNETTES = {
  thumb: { largeur: 96, qualite: 75 },
  card: { largeur: 480, qualite: 70 },
} as const;

// Plafond de lecture : une photo de recette fait quelques centaines de Kio ;
// au-delà de 12 Mo, ce n'est pas une photo de recette.
const OCTETS_MAX = 12 * 1024 * 1024;

export class VignetteError extends Error {
  constructor(
    message: string,
    readonly etape: 'source' | 'lecture' | 'decodage' | 'depot',
  ) {
    super(message);
  }
}

/** La source doit être un objet de `jp-photos` : jamais une URL quelconque
 * (le serveur la téléchargerait — SSRF). */
export function cleSourceRecette(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const cle = cleDepuisUrlCanonique('photos', url);
  return cle && cle.startsWith('recettes/') && !cle.includes('..') ? cle : null;
}

async function lireSource(cle: string): Promise<Buffer> {
  let rep: Response;
  try {
    rep = await fetch(urlCanonique('photos', cle), { cache: 'no-store' });
  } catch (e) {
    throw new VignetteError(`Lecture de la photo impossible (${(e as Error).message}).`, 'lecture');
  }
  if (!rep.ok) throw new VignetteError(`Lecture de la photo refusée par le stockage (HTTP ${rep.status}).`, 'lecture');
  const octets = Buffer.from(await rep.arrayBuffer());
  if (octets.length > OCTETS_MAX) throw new VignetteError('Photo trop volumineuse.', 'lecture');
  return octets;
}

async function deposer(cle: string, corps: Buffer): Promise<void> {
  const rep = await fetch(urlDeTeleversement('photos', cle), {
    method: 'PUT',
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': CACHE_CONTROL_PUBLIC },
    body: new Uint8Array(corps),
  });
  if (!rep.ok) throw new VignetteError(`Dépôt de la vignette refusé par le stockage (HTTP ${rep.status}).`, 'depot');
}

/**
 * Lit la photo `cleSource`, fabrique les deux vignettes JPEG et les dépose.
 * Rend leurs URL publiques. Jamais d'écriture en base ici : l'appelant (qui
 * agit sous la session du membre, donc sous la RLS) la fait.
 */
export async function fabriquerVignettes(cleSource: string): Promise<{ thumb: string; card: string }> {
  const source = await lireSource(cleSource);
  const sorties = {} as Record<keyof typeof VIGNETTES, string>;
  for (const nom of Object.keys(VIGNETTES) as (keyof typeof VIGNETTES)[]) {
    const { largeur, qualite } = VIGNETTES[nom];
    let jpeg: Buffer;
    try {
      jpeg = await sharp(source)
        .rotate() // respecte l'orientation EXIF, comme le canvas du navigateur
        .resize({ width: largeur, withoutEnlargement: true })
        .jpeg({ quality: qualite })
        .toBuffer();
    } catch (e) {
      throw new VignetteError(`Image illisible (${(e as Error).message}).`, 'decodage');
    }
    const cle = nouvelleCleObjet('recettes', 'image/jpeg');
    await deposer(cle, jpeg);
    sorties[nom] = urlCanonique('photos', cle);
  }
  return sorties;
}
