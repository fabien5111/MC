'use client';

// Déconnexion : efface la session Supabase (client) puis renvoie vers /connexion.
// Remplace authSignOut() du db.js vanilla.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/connexion');
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className={
        className ||
        'font-label-md bg-primary text-on-primary px-4 py-2 rounded-full text-sm hover:opacity-90 transition-all active:scale-95 disabled:opacity-60'
      }
    >
      {busy ? '…' : 'Déconnexion'}
    </button>
  );
}
