'use client';

// Bouton de partage (JEP-21). Par défaut, « Partager Je pâtisse ! » : partage
// de l'URL racine, dont la carte d'aperçu est `app/opengraph-image.tsx` — le
// clic ramène sur l'accueil, navigation libre comme n'importe quel visiteur.
// `chemin` / `titre` / `texte` / `titreFenetre` le réutilisent pour une autre
// page publique (un article du blog), qui porte alors sa propre carte.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { SocialSharePanel } from '@/components/share/SocialSharePanel';
import { MESSAGE_PARTAGE_SITE } from '@/lib/social-share';

// `children` remplace le libellé par défaut (ex. l'icône de la colonne
// « Suivre » du pied de page) ; `ariaLabel` le nomme alors pour un lecteur
// d'écran.
export function ShareSiteButton({
  className,
  children,
  ariaLabel,
  chemin = '/',
  titre = 'Je pâtisse !',
  texte = MESSAGE_PARTAGE_SITE,
  titreFenetre = 'Partager Je pâtisse !',
  image,
}: {
  className?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
  chemin?: string;
  titre?: string;
  texte?: string;
  titreFenetre?: string;
  image?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} aria-label={ariaLabel} title={ariaLabel}>
        {children ?? 'Partager Je pâtisse !'}
      </button>

      {/* Portail vers <body> : l'en-tête porte un `backdrop-blur`, et un
          `backdrop-filter` fait de son élément le repère de tout descendant en
          `position: fixed` — la fenêtre restait prisonnière de la hauteur de
          l'en-tête, sous le contenu de la page. `open` n'est vrai qu'après un
          clic, donc jamais au rendu serveur où `document` n'existe pas. */}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={titreFenetre}
            className="fixed inset-0 z-[95] flex items-start justify-center bg-background/60 backdrop-blur-[2px] p-4 overflow-y-auto"
            onClick={() => setOpen(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg my-8 bg-surface-container-low border border-outline-variant rounded-xl shadow-lg flex flex-col"
            >
              <div className="flex items-start justify-between gap-4 p-6 border-b border-outline-variant">
                <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-3">
                  <span className="material-symbols-outlined">share</span> {titreFenetre}
                </h3>
                <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="text-on-surface-variant hover:text-primary">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6">
                <SocialSharePanel chemin={chemin} titre={titre} texte={texte} image={image} />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
