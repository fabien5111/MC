'use client';

// Photo par défaut des cartes recette, utilisée quand l'auteur n'a fourni
// aucune photo (RecipeCardLayout, SuggestionCard, CarnetContent, accueil).
// Même geste que BannerManager : upload → compression data-URL → site_settings.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ImageSlot } from '@/components/ImageSlot';
import { useDialog } from '@/components/Dialog';

const KEY = 'recipe_default_photo';

export function RecipeDefaultPhotoManager({ initialUrl }: { initialUrl: string | null }) {
  const router = useRouter();
  const dialog = useDialog();
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [status, setStatus] = useState('');

  async function save(dataUrl: string) {
    setStatus('Enregistrement…');
    try {
      const supabase = createClient();
      const { error } = await supabase.from('site_settings').upsert({ key: KEY, value: dataUrl });
      if (error) throw error;
      setUrl(dataUrl);
      // Lue côté serveur par les cartes recette : sans invalidation, elle n'y
      // apparaît qu'après un rechargement complet (même motif que BannerManager).
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
        maxWidth={1200}
        shape="rounded"
        placeholder="Déposez une photo"
        alt="Photo par défaut des cartes recette"
        className="aspect-[4/3] max-w-xl mb-4"
      />
      <span className="text-sm text-on-surface-variant">{status}</span>
    </div>
  );
}
