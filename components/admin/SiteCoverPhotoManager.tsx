'use client';

// Photo de couverture de la carte d'aperçu du site (JEP-281) : affichée à droite
// de la carte que montrent Facebook, WhatsApp, Pinterest… quand on partage
// l'URL racine (`app/opengraph-image.tsx`). Même geste que
// RecipeDefaultPhotoManager : dépôt sur le stockage objet, l'URL — jamais la
// data-URL — dans `site_settings.og_site_cover`.
//
// **JPEG, cadrage vertical 500 × 630 px** : le générateur d'images de la carte
// ne lit ni le WebP ni l'AVIF. `ImageSlot` ouvre le recadrage au ratio dès le
// dépôt. Sans photo, la carte s'affiche en texte seul.
//
// Les réseaux sociaux gardent une carte en cache plusieurs jours : pour voir un
// changement, forcer la relecture dans le débogueur de partage de Facebook.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageSlot } from '@/components/ImageSlot';
import { useDialog } from '@/components/Dialog';
import { televerserImage } from '@/lib/storage-client';
import { revalidateReference } from '@/lib/revalidate-reference';

const CLE = 'og_site_cover';
const LARGEUR = 500;
const HAUTEUR = 630;

export function SiteCoverPhotoManager({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const dialog = useDialog();
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [status, setStatus] = useState('');

  async function ecrire(valeur: string | null) {
    const supabase = createClient();
    const { error } = await supabase.from('site_settings').upsert({ key: CLE, value: valeur });
    if (error) throw error;
    await revalidateReference('site_settings');
    setUrl(valeur);
    router.refresh();
  }

  async function save(dataUrl: string) {
    setStatus('Enregistrement…');
    try {
      await ecrire(await televerserImage('banniere', dataUrl));
      setStatus('Photo enregistrée ✓ — pensez à forcer la relecture dans le débogueur de partage Facebook.');
    } catch (e) {
      setStatus('');
      dialog.alert('Erreur lors de l’enregistrement : ' + (e as Error).message);
    }
  }

  async function clear() {
    const ok = await dialog.confirm('Retirer la photo ? La carte de partage du site s’affichera sans photo.');
    if (!ok) return;
    setStatus('Suppression…');
    try {
      await ecrire(null);
      setStatus('');
    } catch (e) {
      setStatus('');
      dialog.alert('Erreur lors de la suppression : ' + (e as Error).message);
    }
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-8 ambient-shadow">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-headline-md text-xl text-primary">Couverture de la carte du site</h3>
        <span className="text-xs font-label-md text-on-surface-variant">
          {LARGEUR} × {HAUTEUR} px
        </span>
      </div>
      <ImageSlot
        src={url}
        onChange={save}
        onClear={url ? clear : undefined}
        aspectRatio={LARGEUR / HAUTEUR}
        maxWidth={LARGEUR}
        mime="image/jpeg"
        shape="rounded"
        placeholder="Déposez une photo"
        alt="Couverture de la carte de partage du site"
        className="aspect-[500/630] w-48 mb-4"
      />
      <span className="text-sm text-on-surface-variant">{status}</span>
    </div>
  );
}
