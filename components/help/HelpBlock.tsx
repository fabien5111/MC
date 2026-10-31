'use client';

// Rendu d'un bloc d'aide contextuelle : texte et vidéo indépendants (un bloc
// peut n'avoir que l'un des deux). Repliable — l'en-tête (titre, croix,
// chevron) reste seule visible une fois replié. La mutation de masquage est
// portée par le parent (useHelpBlocks).
//
// **Replié par défaut sous 701 px** (`rail`, le seuil du rendu tablette) : sur
// un téléphone, un bloc déplié occupait la moitié de l'écran de chaque page.
// Tant que la personne n'y a pas touché (`choix === null`), c'est le style qui
// décide (`hidden rail:flex`) et non un test de largeur lu au rendu : lu en
// JavaScript, le bloc s'afficherait déplié dans le HTML serveur, puis se
// refermerait à l'hydratation (saut de page). Dès qu'elle déplie ou replie,
// son choix prime, à toute largeur ; il n'est pas mémorisé d'une page à l'autre.
//
// Croix de fermeture logée dans une barre d'en-tête dédiée (plutôt qu'en
// position absolue par-dessus le contenu) : posée sur la vidéo, elle perdait
// tout contraste face à la miniature YouTube/Vimeo et devenait invisible.
import { useState } from 'react';
import { StepVideoPlayer } from '@/components/recipe/StepVideoPlayer';
import type { VisibleHelpBlock } from '@/lib/help';

export function HelpBlock({
  block,
  onDismiss,
  defaultExpanded,
}: {
  block: VisibleHelpBlock;
  onDismiss: () => void;
  defaultExpanded: boolean;
}) {
  // `null` : pas touché — déplié seulement à partir de 701 px (si la page le demande).
  const [choix, setChoix] = useState<boolean | null>(null);
  function basculer() {
    setChoix((c) => {
      if (c !== null) return !c;
      const large = window.matchMedia('(min-width: 701px)').matches;
      return !(defaultExpanded && large);
    });
  }
  if (!block.showText && !block.showVideo) return null;

  return (
    <div className="no-print bg-secondary-container/30 border border-secondary-container rounded-xl p-4 sm:p-6">
      {/* Toute la ligne (pas seulement le titre) replie/déplie — la croix de
          masquage arrête la propagation pour rester une action distincte. */}
      <div
        role="button"
        tabIndex={0}
        onClick={basculer}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          basculer();
        }}
        className="flex items-center justify-between gap-3 cursor-pointer"
      >
        <div className="flex items-center gap-2 text-primary min-w-0">
          <span className="material-symbols-outlined text-[20px] shrink-0">help_center</span>
          <span className="font-label-md text-label-md uppercase tracking-wide">Aides et Conseils</span>
          {/* Chevron : selon le choix, ou selon la largeur tant qu'il n'y en a pas
              (enveloppes plutôt que `hidden` sur l'icône, dont la feuille impose
              `display: inline-block`). */}
          {choix === null ? (
            <>
              <span className={defaultExpanded ? 'rail:hidden' : 'hidden'}>
                <span className="material-symbols-outlined text-[20px] shrink-0">expand_more</span>
              </span>
              <span className={defaultExpanded ? 'hidden rail:block' : 'block'}>
                <span className="material-symbols-outlined text-[20px] shrink-0">
                  {defaultExpanded ? 'expand_less' : 'expand_more'}
                </span>
              </span>
            </>
          ) : (
            <span className="material-symbols-outlined text-[20px] shrink-0">{choix ? 'expand_less' : 'expand_more'}</span>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          title="Ne plus afficher cette aide"
          aria-label="Ne plus afficher cette aide"
          className="-m-2 p-2 text-on-surface-variant hover:text-on-surface transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>
      {(choix === true || (choix === null && defaultExpanded)) && (
        <div
          className={`${choix === null ? 'hidden rail:flex' : 'flex'} flex-col md:flex-row gap-6 items-start mt-4`}
        >
          {block.showText && block.text && (
            <p className="flex-1 min-w-0 font-body-md text-body-md text-on-surface whitespace-pre-line">{block.text}</p>
          )}
          {block.showVideo && block.videoUrl && (
            <div className="w-full md:w-64 shrink-0">
              <StepVideoPlayer url={block.videoUrl} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
