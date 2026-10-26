'use client';

// Bouton « Carnet CAP » de la fiche recette (JEP-376, lot 1) : range la
// recette dans la liste CAP du membre, ou l'en retire. Écriture par la route
// `/api/listes/cap` (droit `carnet_cap` vérifié côté serveur), jamais par le
// client Supabase : les tables de listes n'ont aucune policy d'écriture.
//
// Sans le droit, le bouton reste visible et grisé (`LockedAction`) : une
// fonction qui n'apparaît pas ne s'explique pas.
import { useState } from 'react';
import { useMutation } from '@/lib/use-mutation';
import { LockedAction } from '@/components/LockedAction';

export function CapListButton({ recipeId, initial, autorise }: { recipeId: string; initial: boolean; autorise: boolean }) {
  const { busy, mutate } = useMutation();
  const [dans, setDans] = useState(initial);

  if (!autorise) {
    return (
      <LockedAction message="Le carnet CAP n’est pas inclus dans votre formule." label="Ajouter au carnet CAP">
        <span className="text-[11px] font-semibold">CAP</span>
      </LockedAction>
    );
  }

  async function basculer() {
    if (busy) return;
    const next = !dans;
    setDans(next); // optimiste
    const ok = await mutate(
      async () => {
        const res = await fetch('/api/listes/cap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipeId, dans: next }),
        });
        if (res.ok) return { error: null };
        const corps = await res.json().catch(() => ({}));
        return { error: { message: corps?.erreur || 'Enregistrement impossible.' } };
      },
      { errorLabel: 'Carnet CAP non mis à jour' },
    );
    if (!ok) setDans(!next);
  }

  const titre = dans ? 'Retirer du carnet CAP' : 'Ajouter au carnet CAP';
  return (
    <button
      type="button"
      onClick={basculer}
      disabled={busy}
      aria-pressed={dans}
      aria-label={titre}
      title={titre}
      className={`flex h-7 items-center gap-1 rounded-full border border-secondary px-2 transition-colors hover:bg-secondary-container disabled:opacity-60 ${
        dans ? 'bg-secondary-container text-primary' : 'text-secondary'
      }`}
    >
      <span className="material-symbols-outlined text-[16px]" aria-hidden>
        {dans ? 'playlist_add_check' : 'playlist_add'}
      </span>
      <span className="text-[11px] font-semibold">CAP</span>
    </button>
  );
}
