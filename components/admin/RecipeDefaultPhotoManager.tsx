'use client';

// Photo par défaut des cartes recette, utilisée quand l'auteur n'a fourni
// aucune photo (RecipeCardLayout, SuggestionCard, CarnetContent, accueil).
// Même geste que BannerManager : upload → compression data-URL (aperçu) →
// dépôt sur le stockage objet → l'URL finale, jamais la data-URL, dans
// site_settings.
//
// Oubliée par le lot B jusqu'au 30/09/2026 : la data-URL (~100 Ko) partait
// en base, et chaque carte sans photo l'embarquait EN ENTIER dans le HTML et
// dans les données React de la page — 16 copies, 1,6 Mo sur une page
// d'accueil de 1,8 Mo, plusieurs secondes de premier affichage en 4G lente
// (audit PageSpeed mobile de l'aperçu de la PR #306). Une URL de stockage,
// elle, pèse une centaine d'octets et l'image n'est téléchargée qu'une fois.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageSlot } from '@/components/ImageSlot';
import { useDialog } from '@/components/Dialog';
import { revalidateReference } from '@/lib/revalidate-reference';
import { televerserImage } from '@/lib/storage-client';

const KEY = 'recipe_default_photo';

export function RecipeDefaultPhotoManager({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const dialog = useDialog();
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [status, setStatus] = useState('');

  async function save(dataUrl: string) {
    setStatus('Enregistrement…');
    try {
      // Même usage que les bannières (`site_settings`, conteneur public) : c'est
      // aussi celui qu'emploie la reprise des photos pour cette table.
      const urlFinale = await televerserImage('banniere', dataUrl);
      const supabase = createClient();
      const { error } = await supabase.from('site_settings').upsert({ key: KEY, value: urlFinale });
      if (error) throw error;
      setUrl(urlFinale);
      // Lue côté serveur par les cartes recette, et désormais servie depuis le
      // cache de `lib/data/reference.ts` : `router.refresh()` seul relirait la
      // valeur en cache. Invalider l'étiquette d'abord, re-rendre ensuite.
      await revalidateReference('site_settings');
      router.refresh();
      setStatus('Photo enregistrée ✓');
    } catch (e) {
      setStatus('');
      dialog.alert('Erreur lors de l’enregistrement : ' + (e as Error).message);
    }
  }

  async function clear() {
    const ok = await dialog.confirm(
      'Retirer la photo par défaut ? Les cartes sans photo réafficheront le pictogramme.',
    );
    if (!ok) return;
    setStatus('Suppression…');
    try {
      const supabase = createClient();
      const { error } = await supabase.from('site_settings').upsert({ key: KEY, value: null });
      if (error) throw error;
      setUrl(null);
      await revalidateReference('site_settings');
      router.refresh();
      setStatus('');
    } catch (e) {
      setStatus('');
      dialog.alert('Erreur lors de la suppression : ' + (e as Error).message);
    }
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-8 ambient-shadow">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-headline-md text-xl text-primary">Photo par défaut des cartes recette</h3>
        <span className="text-xs font-label-md text-on-surface-variant">Ratio 4:3</span>
      </div>
      <ImageSlot
        src={url}
        onChange={save}
        onClear={url ? clear : undefined}
        aspectRatio={4 / 3}
        // Une carte recette ne dépasse pas ~400 px de large : 800 couvre les
        // écrans à double densité. WebP, comme les bannières.
        maxWidth={800}
        mime="image/webp"
        shape="rounded"
        placeholder="Déposez une photo"
        alt="Photo par défaut des cartes recette"
        className="aspect-[4/3] max-w-xl mb-4"
      />
      <span className="text-sm text-on-surface-variant">{status}</span>
    </div>
  );
}
