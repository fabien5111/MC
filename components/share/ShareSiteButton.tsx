'use client';

// Bouton « Partager Je pâtisse ! » (JEP-21, partage global du site). Partage
// l'URL racine : sa carte d'aperçu est `app/opengraph-image.tsx`, et le clic
// ramène sur l'accueil, navigation libre comme n'importe quel visiteur.
import { useState } from 'react';
import { SocialSharePanel } from '@/components/share/SocialSharePanel';
import { MESSAGE_PARTAGE_SITE } from '@/lib/social-share';

export function ShareSiteButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Partager Je pâtisse !
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Partager Je pâtisse !"
          className="fixed inset-0 z-[95] flex items-start justify-center bg-background/60 backdrop-blur-[2px] p-4 overflow-y-auto"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg my-8 bg-surface-container-low border border-outline-variant rounded-xl shadow-lg flex flex-col"
          >
            <div className="flex items-start justify-between gap-4 p-6 border-b border-outline-variant">
              <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-3">
                <span className="material-symbols-outlined">share</span> Partager Je pâtisse !
              </h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="text-on-surface-variant hover:text-primary">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6">
              <SocialSharePanel chemin="/" titre="Je pâtisse !" texte={MESSAGE_PARTAGE_SITE} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
