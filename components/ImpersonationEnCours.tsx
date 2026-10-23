'use client';

// Encadré de /connexion quand la connexion courante est une session « en tant
// que » encore ouverte (JEP-27). Fermer l'onglet ne déconnecte pas : les
// cookies de session survivent, et /connexion renvoyait aussitôt vers le site,
// toujours sous l'identité du membre et avec le bandeau. On propose donc de
// terminer la session ici, par le même chemin que « Quitter » du bandeau, puis
// on reste sur la page : le rendu suivant, déconnecté, affiche le formulaire.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LoadingOverlay } from '@/components/LoadingOverlay';

export function ImpersonationEnCours({ targetName }: { targetName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function terminer() {
    setBusy(true);
    try {
      // Clôture la ligne d'audit, déconnecte côté serveur, retire le cookie témoin.
      await fetch('/api/impersonation/end', { method: 'POST' });
    } catch {
      /* on se déconnecte quand même */
    }
    await createClient().auth.signOut();
    // Même adresse (et même `?next=`) : sans session, la page rend le formulaire.
    router.refresh();
  }

  return (
    <div className="w-full rounded-lg border border-error/40 bg-error-container px-4 py-4 text-sm text-on-error-container text-center space-y-3">
      <p>
        Une session administrateur « en tant que » <strong className="font-semibold">{targetName}</strong> est
        encore ouverte sur ce navigateur. Terminez-la pour vous connecter avec votre propre compte.
      </p>
      <button
        type="button"
        onClick={terminer}
        disabled={busy}
        className="inline-flex items-center gap-1 px-4 py-2 rounded-full bg-error text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden>
          logout
        </span>
        Terminer cette session et me connecter
      </button>
      <LoadingOverlay visible={busy} />
    </div>
  );
}
