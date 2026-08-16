'use client';

// Édition du contenu des blocs d'aide d'une page (porté du motif
// `BannerManager`) : un formulaire par bloc, upsert dans `help_blocks`. Les
// blocs eux-mêmes (nombre, emplacement) sont fixés dans lib/help-blocks.ts —
// rien ici ne permet d'en ajouter ou d'en retirer.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';

type BlockInput = { key: string; adminLabel: string; text: string; videoUrl: string };

export function HelpBlocksManager({ blocks }: { blocks: BlockInput[] }) {
  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      {blocks.map((b) => (
        <HelpBlockCard key={b.key} block={b} />
      ))}
    </div>
  );
}

function HelpBlockCard({ block }: { block: BlockInput }) {
  const router = useRouter();
  const dialog = useDialog();
  const [text, setText] = useState(block.text);
  const [videoUrl, setVideoUrl] = useState(block.videoUrl);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('help_blocks')
        .upsert({ key: block.key, text: text.trim() || null, video_url: videoUrl.trim() || null });
      if (error) throw error;
      // Lu côté serveur par les pages qui affichent l'aide : sans
      // invalidation, le changement n'y apparaît qu'après un rechargement.
      router.refresh();
      dialog.alert('Bloc enregistré ✓');
    } catch (e) {
      dialog.alert('Erreur lors de l’enregistrement : ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant rounded-xl p-6 ambient-shadow flex flex-col gap-4">
      <h3 className="font-headline-md text-lg text-primary">{block.adminLabel}</h3>
      <div>
        <label className="font-label-md text-label-md text-outline mb-1 block">Texte</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
          placeholder="Texte affiché aux membres…"
        />
      </div>
      <div>
        <label className="font-label-md text-label-md text-outline mb-1 block">Lien vidéo (YouTube / Vimeo)</label>
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
          placeholder="https://www.youtube.com/watch?v=…"
        />
      </div>
      {videoUrl.trim() && (
        <div className="w-48">
          <StepVideoPlayer url={videoUrl.trim()} />
        </div>
      )}
      <div>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="px-5 py-2 rounded-full font-label-md text-label-md bg-primary text-on-primary hover:opacity-90 transition-opacity disabled:opacity-40 disabled:pointer-events-none"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}
