'use client';

// « La dernière fois » (JEP-381) : constats de la fournée de référence,
// en lecture seule. Logique : `lib/batch-lecons.ts`.
//
// Trois présentations :
//   • `DerniereFoisLancement` — encadré du panneau « Lancer une fournée » ;
//   • `DerniereFoisEnTete` — en tête de la fournée (leçon, commentaire
//     global, constats dont l'étape n'a pas été retrouvée) ;
//   • `DerniereFoisEtape` — sous chaque étape, en Préparer comme en Pâtisser.
// Les deux dernières lisent les leçons par contexte, pour ne pas faire
// traverser une prop à tout l'arbre de `BatchView`.
import { createContext, useContext } from 'react';
import {
  dateCourte,
  nombreEtapesAnnotees,
  type ConstatEtape,
  type FourneeReference,
  type Lecons,
} from '@/lib/batch-lecons';

type Valeur = { reference: FourneeReference; lecons: Lecons } | null;

const LeconsContext = createContext<Valeur>(null);

export function LeconsProvider({ value, children }: { value: Valeur; children: React.ReactNode }) {
  return <LeconsContext.Provider value={value}>{children}</LeconsContext.Provider>;
}

function titreDerniereFois(reference: FourneeReference): string {
  const d = dateCourte(reference.date);
  return d ? `La dernière fois (${d})` : 'La dernière fois';
}

function Bloc({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-label-md text-[11px] uppercase tracking-widest text-on-surface-variant mb-0.5">{label}</p>
      <div className="font-body-md text-sm whitespace-pre-line">{children}</div>
    </div>
  );
}

// Détail d'un constat d'étape (commentaire, sous-étapes, ingrédients).
function DetailConstat({ c }: { c: ConstatEtape }) {
  return (
    <ul className="flex flex-col gap-0.5">
      {c.commentaire && <li className="whitespace-pre-line">{c.commentaire}</li>}
      {c.sousEtapes.map((su, k) => (
        <li key={'s' + k}>
          <span className="not-italic text-on-surface">{su.texte}</span> — {su.commentaire}
        </li>
      ))}
      {c.ingredients.map((it, k) => (
        <li key={'i' + k}>
          <span className="not-italic text-on-surface">{it.nom}</span>
          {it.ecart && <> : {it.ecart}</>}
          {it.commentaire && <> — {it.commentaire}</>}
        </li>
      ))}
    </ul>
  );
}

// Encadré du lancement : leçon en tête, commentaire global, puis l'annonce
// des remarques d'étapes qui attendent dans la fournée.
export function DerniereFoisLancement({ reference }: { reference: FourneeReference }) {
  const n = nombreEtapesAnnotees(reference);
  return (
    <div className="p-4 bg-surface-container-low border-l-4 border-secondary rounded flex flex-col gap-2">
      <p className="flex items-center gap-1.5 font-label-md text-label-md text-secondary">
        <span className="material-symbols-outlined text-[18px]">history</span>
        {titreDerniereFois(reference)}
      </p>
      {reference.lecon && <Bloc label="À retenir pour la prochaine fois">{reference.lecon}</Bloc>}
      {reference.commentaire_global && <Bloc label="Commentaire global">{reference.commentaire_global}</Bloc>}
      {n > 0 && (
        <p className="text-xs italic text-on-surface-variant">
          {n === 1 ? '1 étape porte une remarque' : `${n} étapes portent une remarque`} : vous la retrouverez sous l&apos;étape, dans la fournée.
        </p>
      )}
    </div>
  );
}

// En tête de la fournée : leçon, commentaire global, et « Autres remarques de
// la dernière fois » (constats dont l'étape n'a pas été retrouvée — jamais
// perdus en silence). Rien si la référence n'a rien à dire à ce niveau.
export function DerniereFoisEnTete() {
  const v = useContext(LeconsContext);
  if (!v) return null;
  const { reference, lecons } = v;
  if (!reference.lecon && !reference.commentaire_global && !lecons.autres.length) return null;
  return (
    <div className="no-print mb-6 p-3 bg-surface-container-low border-l-4 border-secondary rounded flex flex-col gap-2">
      <p className="flex items-center gap-1.5 font-label-md text-[12px] uppercase tracking-widest text-secondary">
        <span className="material-symbols-outlined text-[18px]">history</span>
        {titreDerniereFois(reference)}
      </p>
      {reference.lecon && <Bloc label="À retenir pour la prochaine fois">{reference.lecon}</Bloc>}
      {reference.commentaire_global && <Bloc label="Commentaire global">{reference.commentaire_global}</Bloc>}
      {lecons.autres.length > 0 && (
        <details>
          <summary className="cursor-pointer font-label-md text-[11px] uppercase tracking-widest text-on-surface-variant">
            Autres remarques de la dernière fois ({lecons.autres.length})
          </summary>
          <div className="mt-2 flex flex-col gap-2 text-sm italic text-on-surface-variant">
            {lecons.autres.map((c, k) => (
              <div key={k}>
                <p className="not-italic font-bold text-on-surface">{c.titre}</p>
                <DetailConstat c={c} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// Sous une étape : discret, repliable (ouvert par défaut), lecture seule.
export function DerniereFoisEtape({ stepId }: { stepId: number }) {
  const v = useContext(LeconsContext);
  const c = v?.lecons.parEtape[stepId];
  if (!c) return null;
  return (
    <details open className="no-print text-sm italic text-on-surface-variant border-l-2 border-outline-variant pl-3">
      <summary className="cursor-pointer not-italic flex items-center gap-1 text-[12px] font-label-md text-on-surface-variant list-none [&::-webkit-details-marker]:hidden">
        <span className="material-symbols-outlined text-[16px]">history</span>
        La dernière fois
        {v?.reference.date && dateCourte(v.reference.date) ? ` (${dateCourte(v.reference.date)})` : ''}
      </summary>
      <div className="mt-1">
        <DetailConstat c={c} />
      </div>
    </details>
  );
}
