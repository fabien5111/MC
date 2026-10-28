'use client';

// « Réafficher les aides » (JEP-373) : rétablit tous les blocs d'aide que le
// membre a masqués (bloc, vidéo ou page entière). Passe par
// `POST /api/aide/masquages` (action `activer`, sans page = toutes). Les blocs reviennent à la prochaine
// ouverture des écrans concernés : l'état d'une page déjà ouverte est tenu en
// mémoire par `useHelpBlocks`.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';

export function ReafficherAidesButton({ className }: { className?: string }) {
  const router = useRouter();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);

  async function reafficher() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/aide/masquages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'activer' }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message || 'Réaffichage impossible.');
      router.refresh();
      await dialog.alert('Les aides s’afficheront de nouveau sur les pages où vous les aviez masquées.');
    } catch (e) {
      await dialog.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <LoadingOverlay visible={busy} label="Réaffichage des aides…" />
      <button
        type="button"
        onClick={() => void reafficher()}
        disabled={busy}
        className={
          className ??
          'inline-flex items-center gap-2 rounded-pill border border-primary px-5 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary/5 disabled:opacity-60'
        }
      >
        <span className="material-symbols-outlined text-[18px]">visibility</span>
        Réafficher les aides
      </button>
    </>
  );
}
