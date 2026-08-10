'use client';

// Listes de courses archivées — toutes cochées, donc barrées : aucune colonne
// « archivée » en base, c'est une lecture pure (cf. app/en-cuisine/archives).
// Pas de fusion ici (elle n'aurait de sens qu'avec une liste encore active,
// et celle-ci n'apparaît pas dans cette page) — seulement la suppression,
// pour faire le ménage une fois les courses faites.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDate } from '@/lib/format';
import type { ShoppingListSummary } from '@/lib/profile';

export function ArchivedShoppingLists({ lists }: { lists: ShoppingListSummary[] }) {
  const { mutate, busy } = useMutation();
  const [list, setList] = useState(lists);
  useEffect(() => setList(lists), [lists]);

  async function delShoppingList(id: number, name: string) {
    const ok = await mutate(() => createClient().from('shopping_lists').delete().eq('id', id), {
      confirm: `Supprimer la liste « ${name} » ?`,
    });
    if (ok) setList((prev) => prev.filter((l) => l.id !== id));
  }

  if (list.length === 0) {
    return <p className="italic text-on-surface-variant">Aucune liste de courses archivée.</p>;
  }

  return (
    <div className="max-w-3xl space-y-4">
      <LoadingOverlay visible={busy} label="Suppression…" />
      {list.map((l) => {
        const items = l.shopping_list_items || [];
        return (
          <div key={l.id} className="rounded-lg border border-outline-variant p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <span className="font-label-md text-[15px] text-primary line-through opacity-50">{l.name}</span>
              <span className="shrink-0 whitespace-nowrap text-[12px] text-on-surface-variant line-through opacity-50">
                {items.length} / {items.length}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-container-highest">
              <span className="block h-full w-full rounded-full bg-primary opacity-50" />
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <p className="text-[12px] text-on-surface-variant opacity-50">
                {l.created_at ? 'Créée le ' + formatDate(l.created_at) : ''}
              </p>
              <button
                type="button"
                title="Supprimer la liste"
                onClick={() => delShoppingList(l.id, l.name)}
                className="shrink-0 rounded p-1.5 text-error transition-colors hover:bg-error/10"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
