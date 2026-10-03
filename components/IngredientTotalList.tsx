// Liste totale des ingrédients — présentation commune à la fiche recette, à la
// fournée, à la relecture d'un import et à l'éditeur de recette. Le calcul
// (lignes par commentaire, total par ingrédient) vit dans `lib/ingredients-recap.ts`
// (`groupWithTotal`) ; ce composant ne fait que le rendu, sans état ni effet,
// pour servir aussi bien un Server qu'un Client Component.
//
// Disposition : un ingrédient seul tient sur une ligne (quantité, nom,
// allergènes, commentaire, liens d'étape). Un ingrédient à plusieurs lignes
// (commentaires différents) s'ouvre sur son TOTAL en gras, suivi du détail en
// retrait, une ligne par commentaire avec sa quantité et ses étapes. Chaque
// écran branche ce qui lui est propre dans `action` (picto de remplacement de
// la fournée) et `links` (renvois vers les étapes).
import { Fragment, type ReactNode } from 'react';

export type IngredientTotalLine = {
  key: string;
  qty: ReactNode;
  comment?: string | null;
  // Renvois vers les étapes (liens, boutons) — hors impression.
  links?: ReactNode;
  // Colonne de gauche : picto propre à l'écran (remplacement d'ingrédient…).
  action?: ReactNode;
  // Ligne ajoutée à la main sur une fournée (« absent de la recette de base »).
  added?: boolean;
};

export type IngredientTotalGroup = {
  key: string;
  name: ReactNode;
  allergen?: string | null;
  // Quantité du total ; ignorée pour un ingrédient à une seule ligne.
  total?: ReactNode;
  lines: IngredientTotalLine[];
};

const ROW_STYLE = { display: 'grid', gridTemplateColumns: 'subgrid', gridColumn: '1/-1', alignItems: 'baseline' } as const;

function Allergen({ value }: { value?: string | null }) {
  if (!value) return null;
  return <span className="print-fs-9 text-[14px] text-on-surface-variant font-normal italic"> (Allergènes : {value})</span>;
}

export function IngredientTotalList({ groups }: { groups: IngredientTotalGroup[] }) {
  const hasActions = groups.some((g) => g.lines.some((l) => l.action));
  // La colonne des pictos n'existe que si un écran en porte : sans elle, les
  // quantités resteraient décalées d'une colonne vide.
  const cols = hasActions ? 'grid-cols-[max-content_max-content_minmax(0,1fr)]' : 'grid-cols-[max-content_minmax(0,1fr)]';
  const actionCell = (node?: ReactNode) => (hasActions ? <span className="no-print flex items-center justify-self-start">{node}</span> : null);

  return (
    <ul className={`grid ${cols} gap-x-4 sm:gap-x-10 print:gap-x-10`}>
      {groups.map((g) => {
        // Un ingrédient seul : une ligne, sans total.
        if (g.lines.length === 1) {
          const l = g.lines[0];
          return (
            <li key={g.key} className="border-b border-outline-variant/30 py-2" style={ROW_STYLE}>
              {actionCell(l.action)}
              <span className={`font-label-md text-label-md ${l.added ? 'text-green-700' : 'text-primary'}`}>{l.qty}</span>
              <span className={`font-body-md text-body-md break-words ${l.added ? 'text-green-700' : ''}`}>
                {g.name}
                <Allergen value={g.allergen} />
                {l.comment && <span className="print-fs-9 text-on-surface-variant text-sm italic"> — {l.comment}</span>}
                {l.links && <span className="block mt-1">{l.links}</span>}
              </span>
            </li>
          );
        }
        return (
          <Fragment key={g.key}>
              <li className="pt-2" style={ROW_STYLE}>
                {actionCell()}
                <span className="font-label-md text-label-md text-primary font-bold">{g.total}</span>
                <span className="font-body-md text-body-md font-semibold break-words">
                  {g.name}
                  <Allergen value={g.allergen} />
                </span>
              </li>
              {g.lines.map((l, i) => (
                <li key={l.key} className={i === g.lines.length - 1 ? 'border-b border-outline-variant/30 pb-2 pt-1' : 'pt-1'} style={ROW_STYLE}>
                  {actionCell(l.action)}
                  <span className={`text-[13px] ${l.added ? 'text-green-700' : 'text-on-surface-variant'}`}>{l.qty}</span>
                  <span className="text-sm flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    {l.comment && <span className="print-fs-9 text-on-surface-variant italic">{l.comment}</span>}
                    {l.links}
                  </span>
                </li>
              ))}
          </Fragment>
        );
      })}
    </ul>
  );
}
