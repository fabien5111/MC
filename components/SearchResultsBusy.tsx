'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Spinner } from '@/components/Spinner';

// Voile local sur une zone de résultats pendant une recherche : le fouet,
// sans toucher au champ ni aux cases, qui restent utilisables. Le plein écran
// (`LoadingOverlay`) cacherait le champ en cours de frappe. Délai de 120 ms
// avant affichage — comme `NavigationSpinner` — pour ne pas clignoter sur une
// réponse instantanée.
export function SearchResultsBusy({ busy, children }: { busy: boolean; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!busy) {
      setVisible(false);
      return;
    }
    const t = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(t);
  }, [busy]);

  return (
    <div className="relative" aria-busy={busy}>
      <div className={visible ? 'pointer-events-none opacity-40 transition-opacity' : 'transition-opacity'}>{children}</div>
      {visible && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner size={48} label="Recherche en cours…" />
        </div>
      )}
    </div>
  );
}
