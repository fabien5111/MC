'use client';

// Bannière d'installation de la PWA, montée sur toutes les pages (visiteur
// compris : installer l'application n'est pas une action de compte).
//
// Deux ressorts, selon ce que le navigateur propose :
//  - Chrome/Edge/Samsung Internet < 27 émettent `beforeinstallprompt` : le
//    bouton déclenche directement la boîte de dialogue native
//    (`lib/use-install-prompt.ts`).
//  - Samsung Internet ≥ 27 et Safari iOS ne l'émettent jamais — Samsung a
//    choisi de piloter l'installation depuis son propre menu plutôt que par
//    cet événement Chrome. Après un court délai sans événement, la bannière
//    bascule sur une fiche d'instructions plutôt que de rester muette.
import { useEffect, useState } from 'react';
import { useInstallPrompt } from '@/lib/use-install-prompt';

// Délai avant de basculer en mode instructions : `beforeinstallprompt` arrive
// presque toujours dans la première seconde quand le navigateur le supporte —
// au-delà, ce n'est plus la peine d'attendre.
const NATIVE_EVENT_TIMEOUT_MS = 2500;

function detectManualInstructions(): string | null {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
  if (isIOS) {
    return 'Appuyez sur l’icône Partager, puis « Sur l’écran d’accueil ».';
  }
  if (/SamsungBrowser/.test(ua)) {
    return 'Ouvrez le menu ⋮ de Samsung Internet, puis « Ajouter une page à » → « Écran d’accueil ».';
  }
  // Autre navigateur mobile sans invite native connue (Firefox Android…).
  if (/Android/.test(ua)) {
    return 'Ouvrez le menu de votre navigateur, puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».';
  }
  // Desktop hors Chrome/Edge (Firefox, Safari…) : pas d'installation PWA
  // fiable, la bannière n'a rien à proposer.
  return null;
}

export function InstallPwaBanner() {
  const { canPromptNatively, installed, dismissed, promptInstall, dismiss } = useInstallPrompt();
  const [manualInstructions, setManualInstructions] = useState<string | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  // Mobile et tablette seulement : Chrome/Edge desktop émettent aussi
  // `beforeinstallprompt` (une PWA s'installe en fenêtre sur ordinateur), mais
  // ce n'est pas l'usage visé ici. Même seuil que la colonne/tiroir de
  // `/recherche` (cf. `SearchFiltersPanel`, `HeaderSearch`).
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    setManualInstructions(detectManualInstructions());
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Ne bascule en mode instructions qu'après avoir laissé sa chance à
  // l'invite native — sans quoi Chrome afficherait un bref instant les deux à
  // la suite.
  useEffect(() => {
    if (canPromptNatively) return;
    const timer = window.setTimeout(() => setShowInstructions(true), NATIVE_EVENT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [canPromptNatively]);

  if (isDesktop || installed || dismissed) return null;
  if (!canPromptNatively && !(showInstructions && manualInstructions)) return null;

  return (
    <div
      role="complementary"
      aria-label="Installer l'application"
      className="pwa-install-banner rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined mt-0.5 shrink-0 text-[22px] text-primary">install_mobile</span>
        <div className="min-w-0 flex-1">
          <p className="font-label-md text-sm font-semibold text-on-surface">Installer Je pâtisse !</p>
          <p className="mt-1 font-body-md text-xs leading-relaxed text-on-surface-variant">
            {canPromptNatively
              ? 'Accédez au site en un geste depuis votre écran d’accueil, comme une application.'
              : manualInstructions}
          </p>
          {canPromptNatively && (
            <button
              type="button"
              onClick={async () => {
                await promptInstall();
                dismiss();
              }}
              className="mt-3 rounded-pill bg-primary px-4 py-2 font-label-md text-xs font-semibold text-on-primary transition-all hover:shadow-lg active:scale-95"
            >
              Installer
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
          className="shrink-0 rounded-pill p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
}
