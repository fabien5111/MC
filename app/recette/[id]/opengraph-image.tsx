// Carte d'aperçu d'une recette (JEP-281) : ce qu'affichent Facebook, WhatsApp,
// Pinterest… quand on partage le lien d'une fiche. Avant, une fiche ne
// déclarait rien et retombait sur la carte du site.
//
// La photo de la recette est recadrée en JPEG 1200×630 (1,91:1) CÔTÉ SERVEUR
// (`sharp`), comme la couverture d'un article. Source restreinte aux objets
// `recettes/` de `jp-photos` (jamais une URL libre : SSRF ; `cleSourceRecette`,
// la règle des vignettes). Sans photo exploitable : carte de marque avec le
// titre en Playfair Display.
//
// **Rien d'une recette non indexable n'en sort** (`recetteIndexable`, la règle
// du plan du site et du `noindex` de la fiche) : brouillon, recette privée ou
// projet en cours → carte de marque sans titre ni photo. La lecture se fait au
// rôle de la requête (RLS) : un crawler est anonyme, donc une recette privée
// est de toute façon illisible. Rendue à la demande, jamais au build.
import sharp from 'sharp';
import { ImageResponse } from 'next/og';
import { createClient } from '@/lib/supabase/server';
import { recetteIndexable } from '@/lib/indexation-recettes';
import { carteEnJpeg, FAMILLE_LOGO, FAMILLE_TITRE, OG_COULEURS as C, OG_TAILLE, optionsPolice } from '@/lib/og-image';
import { cleSourceRecette } from '@/lib/vignettes-data';
import { urlCanonique } from '@/lib/storage-data';

export const alt = 'Recette sur Je pâtisse !';
export const size = OG_TAILLE;
export const contentType = 'image/jpeg';
export const dynamic = 'force-dynamic';

const OCTETS_MAX = 12 * 1024 * 1024;
const CACHE = 'public, max-age=3600, s-maxage=3600';

type LigneRecette = {
  title: string | null;
  status: string | null;
  is_public: boolean | null;
  kind: string | null;
  project_stage: string | null;
  hero_image_url: string | null;
};

/** Lecture étroite : le titre, la photo et ce qu'il faut pour `recetteIndexable`. */
async function lireRecette(id: string): Promise<LigneRecette | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('recipes')
      .select('title, status, is_public, kind, project_stage, hero_image_url')
      .eq('id', id)
      .maybeSingle();
    return (data as LigneRecette | null) ?? null;
  } catch {
    return null;
  }
}

async function recadrer(url: string | null | undefined): Promise<Buffer | null> {
  const cle = cleSourceRecette(url);
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

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recette = await lireRecette(id);
  const visible = !!recette && recetteIndexable(recette);

  const jpeg = visible ? await recadrer(recette.hero_image_url) : null;
  if (jpeg) {
    return new Response(new Uint8Array(jpeg), { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': CACHE } });
  }

  // Repli : carte de marque. Le titre n'y figure que pour une recette visible.
  const titre = visible ? (recette.title ?? '') : '';
  const police = await optionsPolice();
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
        <div style={{ display: 'flex', fontFamily: FAMILLE_LOGO, fontSize: titre ? 72 : 120, color: C.primaire }}>
          Je pâtisse !
        </div>
        {titre ? (
          <div
            style={{
              display: 'flex',
              fontFamily: FAMILLE_TITRE,
              fontSize: titre.length > 60 ? 54 : 68,
              fontWeight: 700,
              lineHeight: 1.15,
              color: C.primaire,
              marginTop: 24,
            }}
          >
            {titre}
          </div>
        ) : (
          <div style={{ display: 'flex', fontFamily: FAMILLE_TITRE, fontSize: 34, color: C.texteDoux, marginTop: 12 }}>
            Ton carnet de recettes, de l’idée à la fournée
          </div>
        )}
      </div>
    ),
    { ...OG_TAILLE, ...police },
  );
  return carteEnJpeg(carte, CACHE);
}
