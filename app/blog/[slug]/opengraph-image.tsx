// Carte d'aperçu d'un article du blog (JEP-281). Les couvertures sont en
// 2,4:1 (1600×667), imposé par la mise en page de l'article, alors que les
// réseaux sociaux attendent du 1,91:1 : Facebook rognait les bords. Cette
// route recadre la couverture existante en JPEG 1200×630, CÔTÉ SERVEUR
// (`sharp`) : rien à changer en base ni dans l'éditeur, et les articles déjà
// publiés sont couverts d'office.
//
// La source est restreinte aux objets `articles/` de `jp-photos` (jamais une
// URL libre : le serveur la téléchargerait — SSRF). Couverture absente,
// externe ou illisible : carte de repli avec le titre en Playfair Display,
// jamais d'erreur. Rendue à la demande, jamais pendant la construction
// (incident mémoire du 30/09).
import sharp from 'sharp';
import { ImageResponse } from 'next/og';
import { getArticle } from '@/lib/blog';
import { carteEnJpeg, FAMILLE_TITRE, OG_COULEURS as C, OG_TAILLE, optionsPolice } from '@/lib/og-image';
import { cleDepuisUrlCanonique, urlCanonique } from '@/lib/storage-data';

export const alt = 'Article du blog Je pâtisse !';
export const size = OG_TAILLE;
export const contentType = 'image/jpeg';
export const dynamic = 'force-dynamic';

const OCTETS_MAX = 12 * 1024 * 1024;
// Les réseaux sociaux gardent la carte plusieurs jours de leur côté.
const CACHE = 'public, max-age=3600, s-maxage=3600';

/** Clé d'une couverture d'article sur notre stockage, ou `null`. */
function cleCouvertureArticle(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const cle = cleDepuisUrlCanonique('photos', url);
  return cle && cle.startsWith('articles/') && !cle.includes('..') ? cle : null;
}

async function recadrer(url: string | null | undefined): Promise<Buffer | null> {
  const cle = cleCouvertureArticle(url);
  if (!cle) return null;
  try {
    const rep = await fetch(urlCanonique('photos', cle), { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!rep.ok) return null;
    const source = Buffer.from(await rep.arrayBuffer());
    if (source.length > OCTETS_MAX) return null;
    return await sharp(source)
      .rotate()
      .resize({ width: OG_TAILLE.width, height: OG_TAILLE.height, fit: 'cover', position: 'attention' })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticle(slug).catch(() => null);

  const jpeg = await recadrer(article?.cover_image_url);
  if (jpeg) {
    return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': CACHE } });
  }

  // Repli : carte de marque avec le titre de l'article.
  const police = await optionsPolice();
  const titre = article?.title ?? 'Je pâtisse !';
  const carte = new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: C.fond,
          padding: '0 80px',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, color: C.texteDoux }}>Le blog de Je pâtisse !</div>
        <div
          style={{
            display: 'flex',
            fontFamily: FAMILLE_TITRE,
            fontSize: titre.length > 70 ? 54 : 70,
            fontWeight: 700,
            lineHeight: 1.15,
            color: C.primaire,
            marginTop: 24,
          }}
        >
          {titre}
        </div>
      </div>
    ),
    { ...OG_TAILLE, ...police },
  );
  return carteEnJpeg(carte, CACHE);
}
