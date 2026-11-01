'use client';

// « La dernière fois » (JEP-381) : remarques des fournées précédentes d'une
// recette, et l'épingle qui les garde ou les écarte. Logique : `lib/batch-lecons.ts`.
//
// Un seul fournisseur (`LeconsProvider`) tient les choix du membre en état
// local (écriture optimiste, sans resynchronisation serveur) et calcule ce
// qui s'affiche ; les présentations le lisent par contexte :
//   • `RetoursAuteur` — le bloc « Retours de mes fournées », sur la fiche recette
//     ET dans le panneau « Lancer une fournée » ;
//   • `DerniereFoisEnTete` — en tête de la fournée ;
//   • `DerniereFoisEtape` — sous la date de chaque étape (Préparer, Pâtisser) ;
//   • `ChoixRemarque` — l'épingle, aussi posée dans le résumé.
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useDialog } from '@/components/Dialog';
import { useReadOnly } from '@/components/ImpersonationProvider';
import { enregistrerChoix } from '@/lib/batch-lecons-client';
import {
  cleRemarque,
  dateCourte,
  leconsPrecedentes,
  ligneDecision,
  remarquesAffichees,
  type DecisionRemarque,
  type EtapeCourante,
  type FourneeReference,
  type IngredientCourant,
  type Lecons,
  type Remarque,
  type StatutRemarque,
} from '@/lib/batch-lecons';

type Valeur = {
  reference: FourneeReference | null;
  remarques: Remarque[];
  lecons: Lecons;
  auteur: boolean;
  // Gestes proposés (table présente, recette connue, session modifiable).
  gestion: boolean;
  // La remarque est-elle épinglée (rappelée aux prochaines fournées) ?
  epinglee: (r: Remarque) => boolean;
  // Bascule l'épingle (écrit seulement ce qui diffère du défaut).
  basculer: (r: Remarque) => void;
};

const LeconsContext = createContext<Valeur | null>(null);

export function useLecons() {
  return useContext(LeconsContext);
}

export function LeconsProvider({
  reference,
  decisions: decisionsInitiales,
  choixDisponibles,
  plusRecenteId = null,
  courantes,
  ingredientsCourants = [],
  userId,
  recipeId,
  auteur,
  children,
}: {
  reference: FourneeReference | null;
  decisions: DecisionRemarque[];
  choixDisponibles: boolean;
  // Fournée terminée la plus récente de la recette (remarques épinglées d'office).
  plusRecenteId?: number | null;
  courantes: EtapeCourante[];
  ingredientsCourants?: IngredientCourant[];
  userId: string;
  recipeId: string | null;
  // Le membre est l'auteur de la recette : « écarter » = « corrigé ».
  auteur: boolean;
  children: React.ReactNode;
}) {
  const dialog = useDialog();
  const lectureSeule = useReadOnly();
  const [decisions, setDecisions] = useState(decisionsInitiales);
  useEffect(() => setDecisions(decisionsInitiales), [decisionsInitiales]);

  const remarques = useMemo(() => remarquesAffichees(reference, decisions), [reference, decisions]);
  const lecons = useMemo(() => leconsPrecedentes(remarques, courantes, ingredientsCourants), [remarques, courantes, ingredientsCourants]);
  const parCle = useMemo(() => new Map(decisions.map((d) => [cleRemarque(d.nature, d.ligne_id), d.statut])), [decisions]);
  // Épinglée d'office : remarque de la fournée de référence ou de la plus
  // récente fournée terminée (celle que la prochaine fournée rappellera).
  const parDefaut = useCallback(
    (r: Remarque) => r.batchId != null && (r.batchId === reference?.id || r.batchId === plusRecenteId),
    [reference, plusRecenteId],
  );
  const epinglee = useCallback(
    (r: Remarque) => {
      const s = parCle.get(r.cle);
      return s === 'gardee' ? true : s === 'ecartee' ? false : parDefaut(r);
    },
    [parCle, parDefaut],
  );

  const gestion = choixDisponibles && !!recipeId && !lectureSeule;

  const decider = useCallback(
    async (r: Remarque, statut: StatutRemarque | null) => {
      if (!gestion || !recipeId) return;
      const avant = decisions;
      const sans = decisions.filter((d) => !(d.nature === r.nature && d.ligne_id === r.ligneId));
      setDecisions(statut ? [...sans, ligneDecision(r, statut)] : sans);
      const erreur = await enregistrerChoix(userId, recipeId, r, statut);
      if (erreur) {
        setDecisions(avant);
        dialog.alert('Choix non enregistré : ' + erreur);
      }
    },
    [gestion, recipeId, decisions, userId, dialog],
  );
  // Basculer = viser l'état inverse de l'état effectif ; le choix explicite
  // n'est gardé que s'il s'écarte du défaut (sinon la ligne est supprimée).
  const basculer = useCallback(
    (r: Remarque) => {
      const cible = !epinglee(r);
      const defaut = parDefaut(r);
      decider(r, cible === defaut ? null : cible ? 'gardee' : 'ecartee');
    },
    [epinglee, parDefaut, decider],
  );

  const valeur = useMemo<Valeur>(
    () => ({ reference, remarques, lecons, auteur, gestion, epinglee, basculer }),
    [reference, remarques, lecons, auteur, gestion, epinglee, basculer],
  );
  return <LeconsContext.Provider value={valeur}>{children}</LeconsContext.Provider>;
}

function titreDerniereFois(reference: FourneeReference | null): string {
  const d = dateCourte(reference?.date ?? null);
  return d ? `La dernière fois (${d})` : 'Vos remarques';
}

// Un seul picto, l'épingle : « cette remarque doit-elle réapparaître ? ».
// Épinglée par défaut pour les remarques de la dernière fournée (et de la
// fournée d'origine d'un « Refaire »), non épinglée pour les plus anciennes.
// Un clic bascule ; le choix n'est écrit que s'il diffère du défaut.
export function ChoixRemarque({ r }: { r: Remarque }) {
  const v = useLecons();
  if (!v?.gestion) return null;
  const epinglee = v.epinglee(r);
  const infobulle = epinglee
    ? v.auteur
      ? 'Rappelée aux prochaines fournées — décochez quand c’est corrigé dans votre recette'
      : 'Rappelée aux prochaines fournées — cliquez pour ne plus l’afficher'
    : v.auteur
      ? 'Ne sera plus rappelée — cliquez pour la garder'
      : 'Ne sera plus rappelée — cliquez pour la garder pour vos prochaines fournées';
  return (
    <button
      type="button"
      onClick={() => v.basculer(r)}
      title={infobulle}
      aria-label={infobulle}
      aria-pressed={epinglee}
      className={`no-print not-italic inline-flex align-middle mr-1 p-0.5 rounded hover:bg-surface-container ${epinglee ? 'text-primary' : 'text-outline'}`}
    >
      <span className={`material-symbols-outlined text-[16px]${epinglee ? '' : ' -rotate-45'}`}>push_pin</span>
    </button>
  );
}

// Une remarque, quelle que soit sa nature. La date n'est rappelée que pour
// une remarque gardée d'une fournée plus ancienne que la référence.
function RemarqueLigne({ r }: { r: Remarque }) {
  const v = useLecons();
  const ancienne = v?.reference ? r.batchId !== v.reference.id : true;
  const d = ancienne ? dateCourte(r.date) : null;
  return (
    <li className="flex flex-col">
      {(r.nature === 'sous_etape' || r.nature === 'ingredient') && (
        <span className="not-italic text-on-surface">
          {r.libelle}
          {r.nature === 'ingredient' && r.ecart ? ` : ${r.ecart}` : ''}
        </span>
      )}
      {(r.texte || d || v?.gestion) && (
        <span>
          <ChoixRemarque r={r} />
          {r.nature === 'lecon' && <span className="not-italic text-on-surface-variant">À retenir : </span>}
          {r.nature === 'global' && <span className="not-italic text-on-surface-variant">Commentaire global : </span>}
          {r.texte && (r.nature === 'etape' || r.nature === 'sous_etape' || r.nature === 'ingredient') && (
            <span className="not-italic text-on-surface-variant">Mon commentaire : </span>
          )}
          {r.texte && <span className="whitespace-pre-line">{r.texte}</span>}
          {d && <span className="not-italic text-[11px] text-outline"> · fournée du {d}</span>}
        </span>
      )}
    </li>
  );
}

function ListeRemarques({ remarques }: { remarques: Remarque[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {remarques.map((r) => (
        <RemarqueLigne key={r.cle} r={r} />
      ))}
    </ul>
  );
}

// En tête de la fournée : leçon, commentaire global, et « Autres remarques »
// (étape non retrouvée — jamais perdues en silence).
export function DerniereFoisEnTete() {
  const v = useLecons();
  if (!v) return null;
  const { lecons } = v;
  if (!lecons.generales.length && !lecons.autres.length) return null;
  return (
    <div className="no-print mb-6 p-3 bg-surface-container-low border-l-4 border-secondary rounded flex flex-col gap-2">
      <p className="flex items-center gap-1.5 font-label-md text-[12px] uppercase tracking-widest text-secondary">
        <span className="material-symbols-outlined text-[18px]">history</span>
        {titreDerniereFois(v.reference)}
      </p>
      {lecons.generales.length > 0 && (
        <div className="text-sm">
          <ListeRemarques remarques={lecons.generales} />
        </div>
      )}
      {lecons.autres.length > 0 && (
        <details>
          <summary className="cursor-pointer font-label-md text-[11px] uppercase tracking-widest text-on-surface-variant">
            Autres remarques de la dernière fois ({lecons.autres.length})
          </summary>
          <div className="mt-2 flex flex-col gap-2 text-sm italic text-on-surface-variant">
            {lecons.autres.map((c, k) => (
              <div key={k}>
                <p className="not-italic font-bold text-on-surface">{c.titre}</p>
                <ListeRemarques remarques={c.remarques} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

// Sous la date d'une étape : discret, repliable (ouvert par défaut).
export function DerniereFoisEtape({ stepId }: { stepId: number }) {
  const v = useLecons();
  const c = v?.lecons.parEtape[stepId];
  if (!c) return null;
  return (
    <details open className="no-print text-sm italic text-on-surface-variant border-l-2 border-outline-variant pl-3">
      <summary className="cursor-pointer not-italic flex items-center gap-1 text-[12px] font-label-md text-on-surface-variant list-none [&::-webkit-details-marker]:hidden">
        <span className="material-symbols-outlined text-[16px]">history</span>
        {titreDerniereFois(v?.reference ?? null)}
      </summary>
      <div className="mt-1">
        <ListeRemarques remarques={c.remarques} />
      </div>
    </details>
  );
}

// Fiche recette, pour son auteur : les retours de ses fournées, étape par
// étape, avec le lien pour corriger l'étape et « Corrigé » pour l'écarter.
export function RetoursAuteur({
  recipeId,
  etapes,
  compact = false,
}: {
  recipeId: string;
  etapes: { id: number; title: string | null }[];
  // Dans le panneau « Lancer une fournée » : marge réduite.
  compact?: boolean;
}) {
  const v = useLecons();
  if (!v || !v.remarques.length) return null;
  const { lecons } = v;
  return (
    <details open className={`no-print group border border-outline-variant ${compact ? '' : 'mb-12'}`}>
      <summary className="flex items-center justify-between p-4 cursor-pointer bg-surface-container-low list-none">
        <span className="flex items-center gap-2 font-label-md text-label-md text-primary">
          <span className="material-symbols-outlined text-[18px]">history</span>
          RETOURS DE MES FOURNÉES ({v.remarques.length})
        </span>
        <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div className="p-4 bg-white flex flex-col gap-4 text-sm">
        <p className="text-xs text-on-surface-variant">
          Remarques de votre dernière fournée et celles que vous avez gardées. Une fois l&apos;étape corrigée, décochez
          l&apos;épingle pour retirer la remarque ; épinglée, elle est rappelée d&apos;une fournée à l&apos;autre.
        </p>
        {lecons.generales.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="font-bold text-on-surface">Retours global recette</p>
            <ListeRemarques remarques={lecons.generales} />
          </div>
        )}
        {etapes.map((e, i) => {
          const c = lecons.parEtape[e.id];
          if (!c) return null;
          return (
            <div key={e.id} className="flex flex-col gap-1">
              <p className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-on-surface">
                  Étape {i + 1} · {e.title || 'Sans titre'}
                </span>
                {v.auteur && (
                  <Link href={`/creer?id=${recipeId}#sec-etape-${i + 1}`} className="text-[12px] text-primary underline underline-offset-2">
                    Modifier cette étape
                  </Link>
                )}
              </p>
              <div className="italic text-on-surface-variant">
                <ListeRemarques remarques={c.remarques} />
              </div>
            </div>
          );
        })}
        {lecons.autres.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="font-label-md text-[11px] uppercase tracking-widest text-on-surface-variant">Étapes qui n&apos;existent plus dans la recette</p>
            {lecons.autres.map((c, k) => (
              <div key={k}>
                <p className="font-bold text-on-surface">{c.titre}</p>
                <div className="italic text-on-surface-variant">
                  <ListeRemarques remarques={c.remarques} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}
