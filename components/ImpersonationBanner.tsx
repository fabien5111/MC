'use client';

// Bandeau persistant affiché en haut de l'écran pendant une impersonation.
// Fixe (et non `sticky`) pour rester visible sur toutes les pages, y compris
// celles dont l'en-tête est lui-même collant : `globals.css` décale d'autant
// le contenu et les en-têtes collants (`body[data-impersonation]`).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { modeLabel, type ImpersonationMode } from '@/lib/impersonation-types';

export function ImpersonationBanner({ targetName, mode }: { targetName: string; mode: ImpersonationMode }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function quitter() {
    if (!confirm('Quitter la session « connecté en tant que » ? Vous serez déconnecté de ce compte.')) return;
    setBusy(true);
    try {
      // Clôture la ligne d'audit et invalide la session côté serveur…
      await fetch('/api/impersonation/end', { method: 'POST' });
    } catch {
      /* on se déconnecte quand même */
    }
    // …puis purge la session du navigateur (cette fenêtre est en principe une
    // fenêtre de navigation privée, mais on ne laisse rien traîner).
    await createClient().auth.signOut();
    router.replace('/connexion');
    router.refresh();
  }

  const readOnly = mode === 'read_only';

  return (
    <>
      <div
        role="status"
        className={`fixed top-0 inset-x-0 z-[100] h-11 flex items-center gap-3 px-3 md:px-6 text-white ${
          readOnly ? 'bg-[#8a5a00]' : 'bg-error'
        }`}
      >
        <span className="material-symbols-outlined text-[20px] shrink-0" aria-hidden>
          {readOnly ? 'visibility' : 'edit' }
        </span>
        <p className="font-label-md text-xs md:text-sm truncate">
          Connecté en tant que <strong className="font-semibold">{targetName}</strong>
          <span className="hidden sm:inline"> — </span>
          <span className="block sm:inline">Mode : {modeLabel(mode)}</span>
        </p>
        <button
          type="button"
          onClick={quitter}
          disabled={busy}
          className="ml-auto shrink-0 flex items-center gap-1 px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden>
            logout
          </span>
          Quitter
        </button>
      </div>
      <LoadingOverlay visible={busy} />
    </>
  );
}
