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
  resume,
  lienVerrou,
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
  // Rappel de ce qui a été saisi, visible SEULEMENT quand le volet est replié
  // (`group-open:hidden`, purement CSS : aucun état) et accompagné d'un picto
  // « modifier » qui ouvre le volet. Sans effet sur un bloc non repliable.
  resume?: ReactNode;
  // Lien sous la phrase de verrouillage : mène à ce qui débloque le bloc.
  // Sans effet quand le bloc est ouvert.
  lienVerrou?: { texte: string; onClick: () => void };
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
        {lienVerrou && (
          <button
            type="button"
            onClick={lienVerrou.onClick}
            className="ml-1 font-semibold not-italic text-primary underline underline-offset-2 hover:text-secondary"
          >
            {lienVerrou.texte}
          </button>
        )}
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-headline-md text-[22px] text-primary">{titre}</h2>
            {aide}
          </div>
          {corps}
        </>
      ) : (
        <details open={!replie} className="group">
          {/* Le rappel (`resume`) vit DANS le <summary> : un <details> fermé
              n'affiche que son <summary>, tout autre enfant est masqué. */}
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-3">
                <h2 className="font-headline-md text-[22px] text-primary">{titre}</h2>
                {aide}
              </span>
              <span className="material-symbols-outlined transition-transform group-open:rotate-180">expand_more</span>
            </div>
            {resume && (
              <div className="mt-3 flex items-start gap-3 group-open:hidden">
                <div className="min-w-0 flex-1">{resume}</div>
                <button
                  type="button"
                  title="Modifier"
                  aria-label={`Modifier : ${titre}`}
                  // Un bouton dans un <summary> ne le fait pas basculer : on
                  // ouvre le <details> à la main (la valeur `open` côté React ne
                  // change pas, rien ne se referme au re-rendu).
                  onClick={(e) => {
                    e.preventDefault();
                    const d = e.currentTarget.closest('details');
                    if (d) d.open = true;
                  }}
                  className="shrink-0 rounded p-1 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
                >
                  <span className="material-symbols-outlined text-[20px]">edit</span>
                </button>
              </div>
            )}
          </summary>
          <div className="mt-4">{corps}</div>
        </details>
      )}
    </section>
  );
}
