// Carte d'aperçu d'un carnet partagé par lien (JEP-21) : message imposé
// « Je te partage mes recettes sur Je pâtisse ! », nom du propriétaire,
// nombre de recettes, et une mosaïque des photos PUBLIQUES du carnet — jamais
// celle d'une recette privée (cf. `getApercuCarnet`). Pas de flou ici : Satori
// ne sait pas le rendre, et ces photos sont de toute façon déjà publiques.
import { ImageResponse } from 'next/og';
import { proprietaireDuJeton } from '@/lib/book-link';
import { getApercuCarnet } from '@/lib/book-link-data';
import { chargerImagesOg, OG_COULEURS as C, OG_TAILLE } from '@/lib/og-image';
import { MESSAGE_PARTAGE_CARNET } from '@/lib/social-share';

export const alt = MESSAGE_PARTAGE_CARNET;
export const size = OG_TAILLE;
export const contentType = 'image/png';
export const dynamic = 'force-dynamic';

export default async function Image({ params }: { params: Promise<{ jeton: string }> }) {
  const { jeton } = await params;
  const ownerId = proprietaireDuJeton(jeton);
  const apercu = ownerId ? await getApercuCarnet(ownerId).catch(() => null) : null;
  const photos = apercu ? await chargerImagesOg(apercu.photos) : [];
  // Six cases, toujours : les photos manquantes sont des tuiles unies, pour
  // que la carte garde la même composition quel que soit le carnet.
  const tuiles = Array.from({ length: 6 }, (_, i) => photos[i] ?? null);
  const n = apercu?.nbRecettes ?? 0;

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: C.fond }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', width: 630, height: 630, padding: 12 }}>
          {tuiles.map((src, i) =>
            src ? (
              // eslint-disable-next-line @next/next/no-img-element -- rendu Satori, pas le DOM
              <img key={i} src={src} alt="" width={190} height={291} style={{ objectFit: 'cover', width: 190, height: 291, margin: 6, borderRadius: 14 }} />
            ) : (
              <div key={i} style={{ display: 'flex', width: 190, height: 291, margin: 6, borderRadius: 14, background: C.accent }} />
            ),
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 570, padding: '0 48px 0 32px' }}>
          <div style={{ display: 'flex', fontSize: 50, fontWeight: 700, lineHeight: 1.15, color: C.primaire }}>{MESSAGE_PARTAGE_CARNET}</div>
          {apercu && (
            <div style={{ display: 'flex', fontSize: 30, color: C.texteDoux, marginTop: 28 }}>
              {`Carnet de ${apercu.nom} · ${n} recette${n > 1 ? 's' : ''}`}
            </div>
          )}
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              marginTop: 40,
              padding: '14px 28px',
              borderRadius: 40,
              background: C.primaire,
              color: C.fond,
              fontSize: 26,
            }}
          >
            Déverrouiller le carnet
          </div>
        </div>
      </div>
    ),
    size,
  );
}
