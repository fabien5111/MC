'use client';

// Contexte client de l'impersonation : le mode résolu côté serveur (bandeau,
// gardes de page) est mis à disposition des composants interactifs pour qu'ils
// masquent ou désactivent les éléments de modification en lecture seule.
import { createContext, useContext } from 'react';
import type { ImpersonationAction, ImpersonationMode } from '@/lib/impersonation-types';
import { useDialog } from '@/components/Dialog';

export type ImpersonationClientContext = {
  sessionId: string;
  mode: ImpersonationMode;
  targetName: string;
} | null;

const Ctx = createContext<ImpersonationClientContext>(null);

export function ImpersonationProvider({
  value,
  children,
}: {
  value: ImpersonationClientContext;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// Session d'impersonation en cours, ou null (cas normal).
export function useImpersonation(): ImpersonationClientContext {
  return useContext(Ctx);
}

// Vrai quand la session courante est une impersonation en lecture seule :
// à utiliser pour masquer/désactiver un élément de modification.
export function useReadOnly(): boolean {
  return useContext(Ctx)?.mode === 'read_only';
}

// Garde à appeler en tête des écritures qui ne passent pas par `useMutation`
// (formulaires multi-écritures, widgets planning/courses, exécution…).
// Renvoie false — et prévient l'utilisateur — si la session est en lecture
// seule : l'appelant doit alors interrompre son traitement.
export function useWriteGuard(): (label?: string) => boolean {
  const impersonation = useImpersonation();
  const dialog = useDialog();
  return (label?: string) => {
    if (impersonation?.mode !== 'read_only') return true;
    logImpersonationAction('write_blocked', label);
    dialog.alert(
      `Session de consultation : vous êtes connecté en tant que ${impersonation.targetName} ` +
        "en lecture seule. Aucune modification n'est possible.",
    );
    return false;
  };
}

// Trace une action dans le journal d'impersonation. Volontairement « best
// effort » : une trace perdue ne doit jamais faire échouer l'action de
// l'utilisateur (la session côté serveur reste, elle, tracée).
export function logImpersonationAction(action: ImpersonationAction, label?: string): void {
  try {
    void fetch('/api/impersonation/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        label: label ?? null,
        path: typeof location !== 'undefined' ? location.pathname : null,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignoré */
  }
}
