// Cadre d'un bloc de la page v2 du mode projet. Deux familles, deux fonds :
// - la RECETTE (ce que deviendra le projet) : fond rosé du thème, celui des
//   encarts de l'éditeur de recette ;
// - l'ATELIER PROJET (intention, structure, quantités, validation) : fond
//   plus clair, bordure en pointillés et étiquette — ce sont les étapes de
//   construction, qui disparaîtront une fois le projet validé.
// Un bloc verrouillé reste visible, grisé, avec ce qui le débloque : on voit
// d'emblée toute la recette à venir. Rendu pur, sans état.
import type { ReactNode } from 'react';
import type { ProjectV2BlockState } from '@/lib/projects';

export function ProjectV2Block({
  id,
  atelier = false,
  titre,
  apercu,
  state,
  children,
}: {
  id: string;
  atelier?: boolean;
  titre: string;
  // Ce que contiendra le bloc, affiché tant qu'il est verrouillé.
  apercu: string;
  state: ProjectV2BlockState;
  children?: ReactNode;
}) {
  const cadre = atelier
    ? 'border border-dashed border-secondary/40 bg-surface-container-lowest'
    : 'border border-outline-variant bg-surface-container-low';
  return (
    <section
      id={id}
      aria-disabled={!state.unlocked || undefined}
      className={`scroll-mt-28 rounded-xl p-5 md:p-8 ${cadre} ${state.unlocked ? '' : 'opacity-60'}`}
    >
      {atelier && (
        <p className="mb-2 flex items-center gap-1.5 font-label-md text-[11px] uppercase tracking-widest text-secondary">
          <span className="material-symbols-outlined text-[16px]" aria-hidden>
            construction
          </span>
          Atelier projet
        </p>
      )}
      <h2 className="mb-4 font-headline-md text-[22px] text-primary">{titre}</h2>
      {state.unlocked ? (
        children
      ) : (
        <div className="space-y-1">
          <p className="text-sm text-on-surface-variant">{apercu}</p>
          <p className="flex items-center gap-1.5 text-sm italic text-outline">
            <span className="material-symbols-outlined text-[16px]" aria-hidden>
              lock
            </span>
            {state.lockedReason}
          </p>
        </div>
      )}
    </section>
  );
}
