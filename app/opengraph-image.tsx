// Carte d'aperçu du site (JEP-21, partage global) : ce qu'affichent Facebook,
// WhatsApp, Pinterest… quand on partage l'URL racine. Vaut aussi pour toute
// page qui ne déclare pas la sienne — mieux qu'aucune image.
//
// Aucune dépendance réseau à part la photo de couverture, facultative : la
// carte doit s'afficher même si la base ou le stockage ne répondent pas.
// La couverture est la photo dédiée `og_site_cover` (Admin → Photos du site,
// JPEG sur Swift) — pas la photo par défaut des recettes, souvent en WebP,
// que le générateur ne lit pas (JEP-281). Rendue à la demande ; les réseaux
// sociaux la mettent de toute façon en cache de leur côté.
import { ImageResponse } from 'next/og';
import { getPublicSiteSettings } from '@/lib/site';
import { chargerImageOg, FAMILLE_LOGO, FAMILLE_TITRE, OG_COULEURS as C, OG_TAILLE, optionsPolice } from '@/lib/og-image';

export const alt = 'Je pâtisse ! — la haute pâtisserie à la maison';
export const size = OG_TAILLE;
export const contentType = 'image/png';
// Jamais pré-générée pendant la construction : avec les vraies variables, le
// build l'exécutait (lecture du référentiel, téléchargement de la couverture,
// moteur de rendu d'image) sur un nœud déjà au plafond de sa mémoire — la
// construction de l'aperçu de la PR #303 y a saturé la RAM. Rendue à la
// demande comme la carte du carnet ; les réseaux sociaux la mettent en cache.
export const dynamic = 'force-dynamic';

const FONCTIONNALITES = ['Recettes ajustables', 'Planification & Pas à pas', 'Import de recettes', 'Mode création de recettes'];

export default async function Image() {
  let couverture: string | null = null;
  try {
    const url = (await getPublicSiteSettings()).og_site_cover;
    couverture = url && /^https?:\/\//.test(url) ? await chargerImageOg(url) : null;
  } catch {
    couverture = null;
  }

  const police = await optionsPolice();

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: C.fond }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 32px 0 64px', width: couverture ? 700 : 1200, fontFamily: FAMILLE_TITRE }}>
          <div style={{ display: 'flex', fontFamily: FAMILLE_LOGO, fontSize: 112, lineHeight: 1.1, color: C.primaire, marginLeft: 20 }}>Je pâtisse !</div>
          {/* Une seule ligne : 28 px tient dans la colonne (≈ 566 px de texte pour 604 disponibles). */}
          <div style={{ display: 'flex', fontSize: 28, lineHeight: 1.25, whiteSpace: 'nowrap', color: C.texteDoux, marginTop: 6 }}>
            Ton carnet de recettes, de l’idée à la fournée
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 32 }}>
            {FONCTIONNALITES.map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: C.primaire, marginTop: 10 }}>
                <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: C.primaire, marginRight: 18 }} />
                {f}
              </div>
            ))}
          </div>
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
            Crée ton carnet gratuitement
          </div>
        </div>
        {couverture && (
          // Photo détourée d'une marge, coins arrondis (JEP-281).
          <div style={{ display: 'flex', width: 500, height: 630, padding: 36 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- rendu Satori, pas le DOM */}
            <img src={couverture} alt="" width={428} height={558} style={{ objectFit: 'cover', width: 428, height: 558, borderRadius: 28 }} />
          </div>
        )}
      </div>
    ),
    { ...size, ...police },
  );
}
