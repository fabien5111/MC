'use client';

// Balayage IA de la boîte à idées : repère des paires de doublons parmi les
// idées ouvertes (sémantique, pas seulement lexicale — cf. lib/ai/idea-duplicates.ts),
// et propose une fusion en un clic (RPC `merge_ideas`).
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { StatusBadge } from '@/components/ideas/StatusBadge';
import type { IdeaSummary } from '@/lib/ideas';

type Pair = { a: IdeaSummary; b: IdeaSummary; raison: string };

function MiniIdea({ idea }: { idea: IdeaSummary }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm text-on-surface truncate">{idea.title}</p>
      <div className="flex items-center gap-2 mt-1">
        <StatusBadge status={idea.status} />
        <span className="text-[11px] text-on-surface-variant">
          {idea.votes_count} vote{idea.votes_count > 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

export function IdeaDuplicateScanner({ onMerged }: { onMerged: (id: string, targetTitle: string) => void }) {
  const { mutate, busy } = useMutation();
  const dialog = useDialog();
  const [scanning, setScanning] = useState(false);
  const [pairs, setPairs] = useState<Pair[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function scan() {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/idees/detecter-doublons', { method: 'POST' });
      const data = (await res.json()) as { paires?: Pair[]; erreur?: string };
      if (!res.ok) {
        setError(data.erreur || 'La détection a échoué.');
        setPairs(null);
        return;
      }
      setPairs(data.paires ?? []);
    } catch {
      setError('La détection a échoué, réessayez.');
      setPairs(null);
    } finally {
      setScanning(false);
    }
  }

  async function merge(source: IdeaSummary, target: IdeaSummary) {
    const ok = await mutate(
      () => createClient().rpc('merge_ideas' as never, { source_id: source.id, target_id: target.id } as never),
      {
        confirm: `Fusionner « ${source.title} » dans « ${target.title} » ? Ses votes rejoindront la cible. Irréversible.`,
        errorLabel: 'Fusion impossible',
        refresh: false,
      },
    );
    if (ok) {
      onMerged(source.id, target.title);
      setPairs((prev) => (prev ? prev.filter((p) => p.a.id !== source.id && p.b.id !== source.id) : prev));
    }
  }

  return (
    <section className="border border-outline-variant rounded-xl p-5 bg-surface-container-low">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-headline-md text-base text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
            Détection de doublons par IA
          </h2>
          <p className="text-[12.5px] text-on-surface-variant mt-1">
            Repère des idées qui décrivent le même besoin sans partager de mots communs.
          </p>
        </div>
        <button
          type="button"
          onClick={scan}
          disabled={scanning}
          className="border-2 border-primary text-primary px-6 py-2.5 rounded-full font-label-md text-[12.5px] uppercase tracking-widest hover:bg-primary hover:text-on-primary transition-all active:scale-95 disabled:opacity-60"
        >
          {scanning ? 'Analyse en cours…' : 'Rechercher des doublons'}
        </button>
      </div>

      {error && <p className="text-error text-sm mt-4">{error}</p>}

      {pairs !== null && !error && (
        <div className="mt-5">
          {pairs.length === 0 ? (
            <p className="text-on-surface-variant italic text-sm">Aucun doublon net repéré.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pairs.map((p) => (
                <div key={`${p.a.id}:${p.b.id}`} className="border border-outline-variant rounded-lg p-4 bg-surface-container-lowest">
                  <div className="flex items-start gap-4">
                    <MiniIdea idea={p.a} />
                    <span className="material-symbols-outlined text-[18px] text-outline mt-1">compare_arrows</span>
                    <MiniIdea idea={p.b} />
                  </div>
                  <p className="text-[12px] text-on-surface-variant italic mt-3">{p.raison}</p>
                  <div className="flex justify-end mt-3">
                    <button
                      type="button"
                      onClick={() => merge(p.b, p.a)}
                      disabled={busy}
                      className="px-4 py-2 rounded border border-primary text-primary text-xs font-label-md hover:bg-primary hover:text-on-primary transition-colors disabled:opacity-50"
                    >
                      Fusionner « {p.b.title.length > 24 ? `${p.b.title.slice(0, 24)}…` : p.b.title} » →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
