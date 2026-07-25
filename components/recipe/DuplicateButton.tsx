'use client';

// Bouton « Dupliquer » : crée une copie brouillon de la recette (via la
// fonction Postgres `duplicate_recipe`) puis ouvre directement l'éditeur sur
// cette copie. Hors périmètre de `useMutation` (écriture + navigation, cf.
// lib/use-mutation.ts) : gestion d'erreur dédiée ici.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function DuplicateButton({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function duplicate() {
    if (busy) return;
    if (!confirm('Dupliquer cette recette ? Une copie en brouillon sera créée.')) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('duplicate_recipe' as never, {
        p_recipe_id: recipeId,
      } as never);
      if (error) {
        alert(`Duplication impossible : ${error.message}`);
        return;
      }
      router.push(`/creer?id=${data as unknown as string}`);
    } catch (e) {
      alert(`Duplication impossible : ${(e as Error).message || 'erreur inattendue'}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={duplicate}
      disabled={busy}
      className="flex items-center gap-2 px-3 py-1 border border-secondary rounded-full text-label-md font-label-md hover:bg-secondary-container transition-colors disabled:opacity-60"
    >
      <span className={`material-symbols-outlined text-[18px]${busy ? ' animate-spin' : ''}`}>
        {busy ? 'progress_activity' : 'content_copy'}
      </span>{' '}
      {busy ? 'Duplication…' : 'Dupliquer'}
    </button>
  );
}
