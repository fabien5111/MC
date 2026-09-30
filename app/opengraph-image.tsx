// Carte d'aperçu du site (JEP-21, partage global) : ce qu'affichent Facebook,
// WhatsApp, Pinterest… quand on partage l'URL racine. Vaut aussi pour toute
// page qui ne déclare pas la sienne — mieux qu'aucune image.
//
// Aucune dépendance réseau à part la photo de couverture, facultative : la
// carte doit s'afficher même si la base ou le stockage ne répondent pas.
// Rendue à la demande (le repli de `getRecipeDefaultPhoto` lit les cookies) ;
// les réseaux sociaux la mettent de toute façon en cache de leur côté.
import { ImageResponse } from 'next/og';
import { getRecipeDefaultPhoto } from '@/lib/site';
import { chargerImageOg, OG_COULEURS as C, OG_TAILLE } from '@/lib/og-image';

export const alt = 'Je pâtisse ! — la haute pâtisserie à la maison';
export const size = OG_TAILLE;
export const contentType = 'image/png';

const FONCTIONNALITES = ['Carnet de recettes', 'Fournées guidées pas à pas', 'Ajustement au moule', 'Liste de courses'];

export default async function Image() {
  let couverture: string | null = null;
  try {
    const url = await getRecipeDefaultPhoto();
    couverture = url && /^https?:\/\//.test(url) ? await chargerImageOg(url) : null;
  } catch {
    couverture = null;
  }

  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: C.fond }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 64px', width: couverture ? 700 : 1200 }}>
          <div style={{ display: 'flex', fontSize: 84, fontWeight: 700, color: C.primaire }}>Je pâtisse !</div>
          <div style={{ display: 'flex', fontSize: 34, color: C.texteDoux, marginTop: 12 }}>La haute pâtisserie à la maison</div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 44 }}>
            {FONCTIONNALITES.map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', fontSize: 28, color: C.primaire, marginTop: 12 }}>
                <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: C.primaire, marginRight: 18 }} />
                {f}
              </div>
            ))}
          </div>
        </div>
        {couverture && (
          // eslint-disable-next-line @next/next/no-img-element -- rendu Satori, pas le DOM
          <img src={couverture} alt="" width={500} height={630} style={{ objectFit: 'cover', width: 500, height: 630 }} />
        )}
      </div>
    ),
    size,
  );
}
