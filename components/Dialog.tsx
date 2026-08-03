'use client';

// Remplace window.alert()/confirm() par une modale centrée cohérente avec le
// design du site — la popup native affiche le domaine technique (Vercel) et
// ne peut pas être stylée. Montée une fois à la racine (cf. app/layout.tsx),
// comme LoadingOverlay. `alert`/`confirm` gardent la même sémantique que
// leurs équivalents natifs (dont la Promise résolue par `confirm`), pour un
// remplacement mécanique des appels existants.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type DialogState =
  | { kind: 'alert'; message: string; resolve: () => void }
  | { kind: 'confirm'; message: string; resolve: (ok: boolean) => void };

type DialogApi = {
  alert: (message: string) => Promise<void>;
  confirm: (message: string) => Promise<boolean>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);

  const alertFn = useCallback(
    (message: string) => new Promise<void>((resolve) => setState({ kind: 'alert', message, resolve })),
    [],
  );
  const confirmFn = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setState({ kind: 'confirm', message, resolve })),
    [],
  );

  const respond = useCallback(
    (ok: boolean) => {
      setState((prev) => {
        if (!prev) return prev;
        if (prev.kind === 'alert') prev.resolve();
        else prev.resolve(ok);
        return null;
      });
    },
    [],
  );

  // Échap : ferme l'alerte (comme un OK) ou annule la confirmation — au plus
  // près du comportement des popups natives.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') respond(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, respond]);

  return (
    <DialogContext.Provider value={{ alert: alertFn, confirm: confirmFn }}>
      {children}
      {state ? (
        <div
          role={state.kind === 'confirm' ? 'alertdialog' : 'alert'}
          aria-modal="true"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-background/40 backdrop-blur-[2px] px-6"
          // Un clic hors de la boîte ferme l'alerte (rien d'autre à décider) ;
          // une confirmation impose un choix explicite.
          onClick={() => state.kind === 'alert' && respond(true)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-surface-container-low border border-outline-variant rounded-xl p-6 shadow-lg"
          >
            <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">{state.message}</p>
            <div className="flex justify-end gap-3 mt-6">
              {state.kind === 'confirm' && (
                <button
                  type="button"
                  onClick={() => respond(false)}
                  className="px-4 py-2 rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Annuler
                </button>
              )}
              <button
                type="button"
                autoFocus
                onClick={() => respond(true)}
                className="px-5 py-2 rounded-full font-label-md text-label-md bg-primary text-on-primary hover:opacity-90 transition-opacity"
              >
                {state.kind === 'confirm' ? 'Confirmer' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog doit être utilisé sous DialogProvider.');
  return ctx;
}
