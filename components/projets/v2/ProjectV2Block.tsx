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
  replie,
  aide,
  children,
}: {
  id: string;
  atelier?: boolean;
  titre: string;
  // Ce que contiendra le bloc, affiché tant qu'il est verrouillé.
  apercu: string;
  state: ProjectV2BlockState;
  // Bloc repliable : `undefined` = jamais replié (cas général) ; sinon état
  // INITIAL du volet. L'appelant le fixe une fois (ref) : la valeur de `open`
  // ne doit pas changer d'un rendu à l'autre, sans quoi React refermerait un
  // volet que le membre vient d'ouvrir.
  replie?: boolean;
  // Picto d'aide (JEP-391), à côté du titre.
  aide?: ReactNode;
  children?: ReactNode;
}) {
  const cadre = atelier
    ? 'border border-dashed border-secondary/40 bg-surface-container-lowest'
    : 'border border-outline-variant bg-surface-container-low';
  const corps = state.unlocked ? (
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
  );
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
      {replie === undefined || !state.unlocked ? (
        <>
          <div className="mb-4 flex items-center gap-3">
            <h2 className="font-headline-md text-[22px] text-primary">{titre}</h2>
            {aide}
          </div>
          {corps}
        </>
      ) : (
        <details open={!replie} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <h2 className="font-headline-md text-[22px] text-primary">{titre}</h2>
              {aide}
            </span>
            <span className="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
          </summary>
          <div className="mt-4">{corps}</div>
        </details>
      )}
    </section>
  );
}
