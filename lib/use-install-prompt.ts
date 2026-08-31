'use client';

// Logique d'installation de la PWA : capture l'invite native de Chrome/Edge,
// détecte une app déjà installée, mémorise un rejet temporaire.
//
// Séparé du markup (components/InstallPwaBanner.tsx) parce que rien ici ne
// dépend du rendu — motif déjà en place pour le sommaire de recette
// (lib/use-toc.ts) et les mutations (lib/use-mutation.ts).
import { useCallback, useEffect, useState } from 'react';

// Clé de rejet temporaire, namespace `maryse.*` (cf. lib/use-toc.ts).
const DISMISS_KEY = 'maryse.pwa.install-dismissed-at';
// Un rejet n'est pas définitif : au bout d'un mois, la bannière redevient
// éligible — un visiteur qui a fermé la bannière par réflexe la première fois
// n'a pas dit qu'il ne voulait jamais installer l'application.
const DISMISS_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

// L'événement n'est pas encore dans le typage standard de `WindowEventMap`.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // `display-mode: standalone` couvre Chrome/Edge/Samsung Internet ;
  // `navigator.standalone` est la seule piste sur iOS Safari, qui ne connaît
  // pas cette media query.
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isRecentlyDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const dismissedAt = Number(raw);
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [dismissed, setDismissed] = useState(isRecentlyDismissed);

  useEffect(() => {
    function onBeforeInstallPrompt(event: Event) {
      // Empêche la mini-infobar par défaut du navigateur : c'est notre
      // bannière, cohérente avec le reste du site, qui décide du moment.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }, []);

  // Ne renvoie l'issue que pour l'appelant qui voudrait l'utiliser ; l'invite
  // ne peut de toute façon être proposée qu'une seule fois par événement
  // capturé (contrainte du navigateur, pas de ce hook).
  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return null;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome;
  }, [deferredPrompt]);

  return {
    // Invite native disponible (Chrome, Edge, Samsung Internet < 27) :
    // `promptInstall()` déclenche directement la boîte de dialogue du
    // navigateur.
    canPromptNatively: deferredPrompt !== null,
    installed,
    dismissed,
    promptInstall,
    dismiss,
  };
}
