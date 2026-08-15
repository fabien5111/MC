'use client';

// Remplace window.alert()/confirm() par une modale centrée cohérente avec le
// design du site — la popup native affiche le domaine technique (Vercel) et
// ne peut pas être stylée. Montée une fois à la racine (cf. app/layout.tsx),
// comme LoadingOverlay. `alert`/`confirm` gardent la même sémantique que
// leurs équivalents natifs (dont la Promise résolue par `confirm`), pour un
// remplacement mécanique des appels existants.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type ChoiceOption = { label: string; value: string; variant?: 'primary' | 'default' };

type DialogState =
  | { kind: 'alert'; message: string; resolve: () => void }
  | { kind: 'confirm'; message: string; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; message: string; value: string; required: boolean; resolve: (value: string | null) => void }
  | { kind: 'choice'; message: string; options: ChoiceOption[]; resolve: (value: string | null) => void };

type DialogApi = {
  alert: (message: string) => Promise<void>;
  confirm: (message: string) => Promise<boolean>;
  // Saisie libre (motif de refus, §9 « Rejeter avec motif ») — résout à
  // `null` sur annulation, à la chaîne saisie sinon. `required` bloque la
  // validation tant que le champ est vide (un motif de refus vide n'a pas
  // de sens), sans empêcher l'annulation.
  prompt: (message: string, opts?: { required?: boolean; placeholder?: string }) => Promise<string | null>;
  // Choix parmi plus de deux options (ex. « Enregistrer et quitter » vs
  // « Quitter sans enregistrer » vs annuler) — résout à la `value` de
  // l'option cliquée, ou `null` sur annulation (bouton « Annuler » ou Échap).
  choice: (message: string, options: ChoiceOption[]) => Promise<string | null>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);
  const [placeholder, setPlaceholder] = useState('');

  const alertFn = useCallback(
    (message: string) => new Promise<void>((resolve) => setState({ kind: 'alert', message, resolve })),
    [],
  );
  const confirmFn = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setState({ kind: 'confirm', message, resolve })),
    [],
  );
  const promptFn = useCallback(
    (message: string, opts?: { required?: boolean; placeholder?: string }) =>
      new Promise<string | null>((resolve) => {
        setPlaceholder(opts?.placeholder ?? '');
        setState({ kind: 'prompt', message, value: '', required: opts?.required ?? false, resolve });
      }),
    [],
  );
  const choiceFn = useCallback(
    (message: string, options: ChoiceOption[]) =>
      new Promise<string | null>((resolve) => setState({ kind: 'choice', message, options, resolve })),
    [],
  );

  const respond = useCallback(
    (ok: boolean) => {
      setState((prev) => {
        if (!prev) return prev;
        if (prev.kind === 'alert') prev.resolve();
        else if (prev.kind === 'confirm') prev.resolve(ok);
        else if (prev.kind === 'prompt') prev.resolve(ok ? prev.value : null);
        return null;
      });
    },
    [],
  );
  const respondChoice = useCallback((value: string | null) => {
    setState((prev) => {
      if (!prev || prev.kind !== 'choice') return prev;
      prev.resolve(value);
      return null;
    });
  }, []);

  // Échap : ferme l'alerte (comme un OK) ou annule la confirmation/le choix —
  // au plus près du comportement des popups natives.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (state.kind === 'choice') respondChoice(null);
      else respond(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, respond, respondChoice]);

  return (
    <DialogContext.Provider value={{ alert: alertFn, confirm: confirmFn, prompt: promptFn, choice: choiceFn }}>
      {children}
      {state ? (
        <div
          role={state.kind === 'alert' ? 'alert' : 'alertdialog'}
          aria-modal="true"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-background/40 backdrop-blur-[2px] px-6"
          // Un clic hors de la boîte ferme l'alerte (rien d'autre à décider) ;
          // une confirmation, un choix ou une saisie impose une décision explicite.
          onClick={() => state.kind === 'alert' && respond(true)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-surface-container-low border border-outline-variant rounded-xl p-6 shadow-lg"
          >
            <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">{state.message}</p>
            {state.kind === 'prompt' && (
              <textarea
                autoFocus
                rows={3}
                value={state.value}
                placeholder={placeholder}
                onChange={(e) => setState((prev) => (prev?.kind === 'prompt' ? { ...prev, value: e.target.value } : prev))}
                className="mt-3 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
              />
            )}
            {state.kind === 'choice' ? (
              <div className="flex justify-end flex-wrap gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => respondChoice(null)}
                  className="px-4 py-2 rounded-full font-label-md text-label-md text-on-surface-variant hover:bg-surface-container transition-colors"
                >
                  Annuler
                </button>
                {state.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    autoFocus={opt.variant === 'primary'}
                    onClick={() => respondChoice(opt.value)}
                    className={
                      opt.variant === 'primary'
                        ? 'px-5 py-2 rounded-full font-label-md text-label-md bg-primary text-on-primary hover:opacity-90 transition-opacity'
                        : 'px-4 py-2 rounded-full font-label-md text-label-md border border-outline-variant text-on-surface hover:bg-surface-container transition-colors'
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex justify-end gap-3 mt-6">
                {state.kind !== 'alert' && (
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
                  autoFocus={state.kind !== 'prompt'}
                  disabled={state.kind === 'prompt' && state.required && !state.value.trim()}
                  onClick={() => respond(true)}
                  className="px-5 py-2 rounded-full font-label-md text-label-md bg-primary text-on-primary hover:opacity-90 transition-opacity disabled:opacity-40 disabled:pointer-events-none"
                >
                  {state.kind === 'alert' ? 'OK' : 'Confirmer'}
                </button>
              </div>
            )}
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
