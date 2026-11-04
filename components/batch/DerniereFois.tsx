'use client';

// « La dernière fois » (JEP-381) : remarques des fournées précédentes d'une
// recette, et l'épingle qui les garde ou les écarte. Logique : `lib/batch-lecons.ts`.
//
// Un seul fournisseur (`LeconsProvider`) tient les choix du membre en état
// local (écriture optimiste, sans resynchronisation serveur) et calcule ce
// qui s'affiche ; les présentations le lisent par contexte :
//   • `RetoursAuteur` — le bloc « Retours de mes fournées » : fiche recette,
//     panneau « Lancer une fournée » et en tête de la fournée (Préparer, Pâtisser) ;
//   • `DerniereFoisEtape` — sous la date de chaque étape (Préparer, Pâtisser) ;
//   • `ChoixRemarque` — l'épingle, aussi posée dans le résumé.
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useDialog } from '@/components/Dialog';
import { useReadOnly } from '@/components/ImpersonationProvider';
import { enregistrerChoix } from '@/lib/batch-lecons-client';
import { fmtNum } from '@/lib/recipe-plan';
import { ingredientKey } from '@/lib/ingredient-name';
import { normSearch } from '@/lib/text-search';
import {
  cleRemarque,
  coefficientEcart,
  dateCourte,
  masseGrammes,
  leconsPrecedentes,
  libelleCoefficient,
  coefFournee,
  ligneDecision,
  remarquesAffichees,
  remarquesDeSousEtape,
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
  // Bascule l'épingle (écrit seulement ce qui diffère du défaut). `portee` :
  // écran d'édition en cours (`PorteeEdition`), qui peut couper la question.
  basculer: (r: Remarque, portee?: Portee | null) => void | Promise<void>;
};

const LeconsContext = createContext<Valeur | null>(null);

// Écran d'édition (fenêtre « Modifier cette préparation », `/creer`) : la
// confirmation du désépinglage porte une case « ne plus afficher ce message »,
// retenue tant que l'écran reste monté — rien n'est stocké. Rouvrir l'écran
// (une autre préparation, la même, une autre recette) la rétablit.
type Portee = { silence: boolean; couper: () => void };
const PorteeContext = createContext<Portee | null>(null);

export function PorteeEdition({ children }: { children: React.ReactNode }) {
  const [silence, setSilence] = useState(false);
  const valeur = useMemo(() => ({ silence, couper: () => setSilence(true) }), [silence]);
  return <PorteeContext.Provider value={valeur}>{children}</PorteeContext.Provider>;
}

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

  // Ce qui était affiché à l'ouverture de la page : une remarque désépinglée
  // reste visible (picto éteint) jusqu'au prochain rechargement.
  const [decisionsOuverture] = useState(decisionsInitiales);
  const remarques = useMemo(() => {
    const vivantes = remarquesAffichees(reference, decisions);
    const parCleVivante = new Map(vivantes.map((x) => [x.cle, x]));
    const base = remarquesAffichees(reference, decisionsOuverture);
    const vues = new Set(base.map((x) => x.cle));
    return [...base.map((x) => parCleVivante.get(x.cle) ?? x), ...vivantes.filter((x) => !vues.has(x.cle))];
  }, [reference, decisions, decisionsOuverture]);
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
    async (r: Remarque, portee?: Portee | null) => {
      const cible = !epinglee(r);
      // Désépingler : confirmer, et dire ce qui se passe — sauf si l'écran
      // d'édition en cours a coupé la question.
      if (!cible && !portee?.silence) {
        const ok = await dialog.confirm(
          'Ce commentaire ne s’affichera plus lors de vos prochaines fournées.\n\nIl reste visible jusqu’au prochain rechargement de la page, et vous pouvez le réépingler d’ici là.',
          {
            okLabel: 'Ne plus l’afficher',
            cancelLabel: 'Annuler',
            ...(portee
              ? { caseACocher: { libelle: 'Ne plus afficher ce message pour les modifications en cours', siCocheeEtConfirme: portee.couper } }
              : {}),
          },
        );
        if (!ok) return;
      }
      const defaut = parDefaut(r);
      decider(r, cible === defaut ? null : cible ? 'gardee' : 'ecartee');
    },
    [epinglee, parDefaut, decider, dialog],
  );

  const valeur = useMemo<Valeur>(
    () => ({ reference, remarques, lecons, auteur, gestion, epinglee, basculer }),
    [reference, remarques, lecons, auteur, gestion, epinglee, basculer],
  );
  return <LeconsContext.Provider value={valeur}>{children}</LeconsContext.Provider>;
}

// Un seul picto, l'épingle : « cette remarque doit-elle réapparaître ? ».
// Épinglée par défaut pour les remarques de la dernière fournée (et de la
// fournée d'origine d'un « Refaire »), non épinglée pour les plus anciennes.
// Un clic bascule ; le choix n'est écrit que s'il diffère du défaut.
export function ChoixRemarque({ r }: { r: Remarque }) {
  const v = useLecons();
  const portee = useContext(PorteeContext);
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
      onClick={() => v.basculer(r, portee)}
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
function RemarqueLigne({ r, sansDate = false }: { r: Remarque; sansDate?: boolean }) {
  const v = useLecons();
  const ancienne = v?.reference ? r.batchId !== v.reference.id : true;
  const d = ancienne && !sansDate ? dateCourte(r.date) : null;
  return (
    <li className="flex flex-col">
      {(r.nature === 'sous_etape' || r.nature === 'ingredient') && (
        <span className="not-italic font-normal text-primary">
          {r.libelle}
          {r.nature === 'ingredient' && r.ecart ? ` : ${r.ecart}` : ''}
        </span>
      )}
      {(r.texte || r.ecart || d || v?.gestion) && (
        <span>
          <ChoixRemarque r={r} />
          {r.nature === 'global' && <span className="not-italic font-normal text-primary">Commentaire global : </span>}
          {r.nature === 'etape' && r.ecart && (
            <>
              <span className="not-italic font-normal text-primary">Quantité obtenue : </span>
              <span>{r.ecart}</span>
              {r.texte && ' — '}
            </>
          )}
          {r.texte && (r.nature === 'etape' || r.nature === 'sous_etape' || r.nature === 'ingredient') && (
            <span className="not-italic font-normal text-primary">Mon commentaire : </span>
          )}
          {r.texte && <span className="whitespace-pre-line">{r.texte}</span>}
          {d && <span className="not-italic text-[11px] text-outline"> · fournée du {d}{coefFournee(r)}</span>}
        </span>
      )}
    </li>
  );
}

function ListeRemarques({ remarques, sansDate = false }: { remarques: Remarque[]; sansDate?: boolean }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {remarques.map((r) => (
        <RemarqueLigne key={r.cle} r={r} sansDate={sansDate} />
      ))}
    </ul>
  );
}

// Sous la date d'une étape : discret, repliable (ouvert par défaut).
// En fournée, les remarques de sous-étape et d'ingrédient ne sont plus ici :
// elles se posent sous la ligne qu'elles concernent (`RetoursSousEtape`,
// `RetoursIngredient`), comme dans l'éditeur. Reste le commentaire de l'étape.
export function DerniereFoisEtape({ stepId }: { stepId: number }) {
  const v = useLecons();
  const rs = (v?.lecons.parEtape[stepId]?.remarques ?? []).filter((r) => r.nature === 'etape');
  if (!rs.length) return null;
  return (
    <details open className="no-print text-sm italic font-normal text-primary border-l-2 border-primary/50 pl-3">
      <summary className="cursor-pointer not-italic flex items-center gap-1 text-[12px] font-label-md text-primary list-none [&::-webkit-details-marker]:hidden">
        <span className="material-symbols-outlined text-[16px]">history</span>
        Retours de mes fournées
      </summary>
      <div className="mt-1">
        <ListeRemarques remarques={rs} />
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
  ancrePrefixe,
}: {
  recipeId: string;
  etapes: { id: number; title: string | null }[];
  // Dans le panneau « Lancer une fournée » et en tête d'une fournée : marge réduite.
  compact?: boolean;
  // En fournée, les étapes ne sont pas celles de la recette (insertions,
  // remplacements) : pas de lien vers `/creer`, mais vers l'étape de la page
  // (ancre `<préfixe><id>`).
  ancrePrefixe?: string;
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
                {ancrePrefixe && (
                  <a href={`#${ancrePrefixe}${e.id}`} className="text-[12px] text-primary underline underline-offset-2">
                    Aller à l&apos;étape
                  </a>
                )}
                {v.auteur && !ancrePrefixe && (
                  <Link href={`/creer?id=${recipeId}#sec-etape-${i + 1}`} className="text-[12px] text-primary underline underline-offset-2">
                    Modifier cette étape
                  </Link>
                )}
              </p>
              <div className="italic font-normal text-primary">
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
                <div className="italic font-normal text-primary">
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

// ── Éditeur de recette (/creer) : remarques sous la ligne qu'elles concernent ──
// Lecture seule, dans la même provision que le bloc `RetoursAuteur`. L'étape est
// désignée par l'id qu'a donné `CreerForm` à l'étape courante (rang + 1).

// Sous une sous-étape : ses commentaires de fournée, appariés par le texte.
export function RetoursSousEtape({ stepId, texte }: { stepId: number; texte: string }) {
  const v = useLecons();
  const rs = remarquesDeSousEtape(v?.lecons.parEtape[stepId], texte);
  if (!rs.length) return null;
  return (
    <ul className="no-print mt-1 ml-8 flex flex-col gap-1 text-sm italic font-normal text-primary border-l-2 border-primary/50 pl-3">
      {rs.map((r) => (
        <li key={r.cle}>
          <ChoixRemarque r={r} />
          <span className="not-italic text-[12px] font-bold text-primary">Retours de mes fournées : </span>
          <span className="whitespace-pre-line">{r.texte}</span>
          {dateCourte(r.date) && <span className="not-italic text-[11px] text-outline"> · fournée du {dateCourte(r.date)}{coefFournee(r)}</span>}
        </li>
      ))}
    </ul>
  );
}

// Sous un ingrédient : écart de quantité avec le coefficient de la fournée et
// la quantité à coefficient 1, puis le commentaire.
export function RetoursIngredient({ stepId, ingredientId, enListe = false }: { stepId: number; ingredientId: number; enListe?: boolean }) {
  const v = useLecons();
  const rs = (v?.lecons.parEtape[stepId]?.remarques ?? []).filter((r) => r.nature === 'ingredient' && r.ingredientId === ingredientId);
  if (!rs.length) return null;
  const liste = (
    <ul className="no-print mt-1 flex flex-col gap-1 text-sm italic font-normal text-primary border-l-2 border-primary/50 pl-3">
      {rs.map((r) => {
        const quantite = libelleCoefficient(r) ?? r.ecart;
        return (
          <li key={r.cle}>
            <ChoixRemarque r={r} />
            <span className="not-italic text-[12px] font-bold text-primary">Retours de mes fournées : </span>
            {quantite && <span className="not-italic font-normal text-primary">{quantite}</span>}
            {quantite && r.texte && ' — '}
            {r.texte && <span className="whitespace-pre-line">{r.texte}</span>}
            {dateCourte(r.date) && <span className="not-italic text-[11px] text-outline"> · fournée du {dateCourte(r.date)}{coefFournee(r)}</span>}
          </li>
        );
      })}
    </ul>
  );
  // Dans une grille de lignes (<ul> en sous-grille) : une ligne pleine largeur.
  return enListe ? (
    <li className="pb-2" style={{ gridColumn: '1/-1' }}>
      {liste}
    </li>
  ) : (
    liste
  );
}

// Fenêtre d'édition d'une préparation (mode projet) : ses lignes n'ont pas
// d'identifiant. L'étape est retrouvée par l'id relu en base, sinon par son
// titre ; l'ingrédient par son nom (`ingredientKey`) et son unité.
export function useEtapeRetours(etapeId: number | null | undefined, titre: string | null): number | null {
  const v = useLecons();
  if (!v) return null;
  if (etapeId != null && v.lecons.parEtape[etapeId]) return etapeId;
  const t = normSearch(titre ?? '').trim();
  if (!t) return null;
  const trouve = Object.entries(v.lecons.parEtape).find(([, c]) => normSearch(c.titre).trim() === t);
  return trouve ? Number(trouve[0]) : null;
}

export function RetoursIngredientNom({ stepId, nom, unite }: { stepId: number; nom: string; unite: string | null }) {
  const v = useLecons();
  const k = ingredientKey(nom);
  const u = (unite ?? '').trim().toLowerCase();
  const rs = k
    ? (v?.lecons.parEtape[stepId]?.remarques ?? []).filter(
        (r) => r.nature === 'ingredient' && ingredientKey(r.libelle) === k && (r.unite ?? '').trim().toLowerCase() === u,
      )
    : [];
  if (!rs.length) return null;
  return (
    <ul className="no-print mt-1 flex flex-col gap-1 text-sm italic font-normal text-primary border-l-2 border-primary/50 pl-3">
      {rs.map((r) => {
        const quantite = libelleCoefficient(r) ?? r.ecart;
        return (
          <li key={r.cle}>
            <ChoixRemarque r={r} />
            <span className="not-italic text-[12px] font-bold text-primary">Retours de mes fournées : </span>
            {quantite && <span className="not-italic font-normal text-primary">{quantite}</span>}
            {quantite && r.texte && ' — '}
            {r.texte && <span className="whitespace-pre-line">{r.texte}</span>}
            {dateCourte(r.date) && <span className="not-italic text-[11px] text-outline"> · fournée du {dateCourte(r.date)}{coefFournee(r)}</span>}
          </li>
        );
      })}
    </ul>
  );
}

// Ajustement proposé à partir d'une quantité obtenue (« 50 g en trop ») :
// l'écran qui monte `RetoursEtape` donne les lignes ACTUELLES de l'étape et
// ce que fait le bouton (éditeur : réécrire les quantités du formulaire ;
// mode projet : préremplir le coefficient de la préparation).
export type AjustementEcart = {
  lignes: { quantity: string | number | null; unit: string | null }[];
  libelle: string;
  onAjuster: (coef: number, r: Remarque) => void | Promise<void>;
  // Raison pour laquelle le geste n'est pas proposé ici (le coefficient est
  // alors seulement indiqué).
  indisponible?: string | null;
};

function PropositionEcart({ r, ajustement }: { r: Remarque; ajustement: AjustementEcart }) {
  const masse = masseGrammes(ajustement.lignes);
  const coef = coefficientEcart(r, masse.grammes);
  if (coef == null) return null;
  if (Math.abs(coef - 1) < 0.005) {
    return <p className="not-italic text-[12px] text-on-surface-variant">Les quantités actuelles tiennent déjà compte de cet écart.</p>;
  }
  const horsMasse = Math.max(r.nonPesees ?? 0, masse.nonPesees);
  return (
    <div className="not-italic mt-1 flex flex-col gap-1">
      {ajustement.indisponible ? (
        <p className="text-[12px] text-on-surface-variant">
          Soit ×{fmtNum(coef)} sur les ingrédients de cette étape. {ajustement.indisponible}
        </p>
      ) : (
        <button
          type="button"
          onClick={() => ajustement.onAjuster(coef, r)}
          className="self-start inline-flex items-center gap-1 rounded border border-primary px-2 py-1 text-[12px] font-label-md text-primary hover:bg-primary/5"
        >
          <span className="material-symbols-outlined text-[16px]">balance</span>
          {ajustement.libelle} (×{fmtNum(coef)})
        </button>
      )}
      {horsMasse > 0 && (
        <p className="text-[11px] text-outline">
          Calcul sur les seuls ingrédients en grammes — {horsMasse} ligne{horsMasse > 1 ? 's' : ''} dans une autre unité, ajustée
          {horsMasse > 1 ? 's' : ''} au même coefficient.
        </p>
      )}
    </div>
  );
}

// Sous le titre d'une étape de l'éditeur : son commentaire de fournée, et la
// quantité obtenue avec l'ajustement qu'elle appelle.
export function RetoursEtape({ stepId, ajustement }: { stepId: number; ajustement?: AjustementEcart }) {
  const v = useLecons();
  const rs = (v?.lecons.parEtape[stepId]?.remarques ?? []).filter((r) => r.nature === 'etape');
  if (!rs.length) return null;
  return (
    <ul className="no-print flex flex-col gap-1 text-sm italic font-normal text-primary border-l-2 border-primary/50 pl-3">
      {rs.map((r) => (
        <li key={r.cle}>
          <ChoixRemarque r={r} />
          <span className="not-italic text-[12px] font-bold text-primary">Retours de mes fournées : </span>
          {r.ecart && (
            <>
              <span className="not-italic font-normal">Quantité obtenue : </span>
              <span>{r.ecart}</span>
              {r.texte && ' — '}
            </>
          )}
          <span className="whitespace-pre-line">{r.texte}</span>
          {dateCourte(r.date) && <span className="not-italic text-[11px] text-outline"> · fournée du {dateCourte(r.date)}{coefFournee(r)}</span>}
          {ajustement && <PropositionEcart r={r} ajustement={ajustement} />}
        </li>
      ))}
    </ul>
  );
}

// Essais d'un projet : le bloc complet des retours d'UNE fournée (commentaire
// global, étapes, sous-étapes, ingrédients), en lecture seule — sans
// fournisseur, sans épingle ni date (tout vient du même essai).
export function RetoursEssai({ remarques }: { remarques: Remarque[] }) {
  if (!remarques.length) return null;
  const generales = remarques.filter((r) => r.nature === 'global');
  const groupes = new Map<string, { titre: string; ordre: number; remarques: Remarque[] }>();
  for (const r of remarques) {
    if (r.nature === 'global') continue;
    const cle = String(r.etapeId ?? r.etapeTitre ?? '');
    const g = groupes.get(cle) ?? { titre: r.etapeTitre ?? 'Étape', ordre: r.ordre, remarques: [] };
    g.remarques.push(r);
    groupes.set(cle, g);
  }
  const etapes = [...groupes.values()].sort((a, b) => a.ordre - b.ordre);
  return (
    <details className="no-print group mb-3 border border-outline-variant">
      <summary className="flex items-center justify-between p-3 cursor-pointer bg-surface-container-low list-none">
        <span className="flex items-center gap-2 font-label-md text-label-md text-primary">
          <span className="material-symbols-outlined text-[18px]">history</span>
          RETOURS DE CET ESSAI ({remarques.length})
        </span>
        <span className="material-symbols-outlined group-open:rotate-180 transition-transform">expand_more</span>
      </summary>
      <div className="p-3 bg-white flex flex-col gap-4 text-sm">
        {generales.length > 0 && (
          <div className="italic font-normal text-primary">
            <ListeRemarques remarques={generales} sansDate />
          </div>
        )}
        {etapes.map((e, k) => (
          <div key={k} className="flex flex-col gap-1">
            <p className="font-bold text-on-surface">{e.titre}</p>
            <div className="italic font-normal text-primary">
              <ListeRemarques remarques={e.remarques} sansDate />
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

// En-tête d'un volet d'étapes (mode projet) : combien de retours de fournée
// portent sur ces étapes. Rien tant qu'il n'y en a pas ; les remarques qui ne
// s'apparient à aucune étape (bloc de tête) ne sont pas comptées ici.
export function NombreRetours({
  stepIds,
  lignes,
}: {
  stepIds: number[];
  // Lignes actuellement affichées de chaque étape : sert à écarter du compte les
  // retours dont la ligne a été retouchée ou supprimée depuis la fournée.
  lignes?: { id: number; sousEtapes: string[]; ingredientIds: number[] }[];
}) {
  const v = useLecons();
  // Une remarque désépinglée reste affichée (picto éteint) jusqu'au rechargement,
  // mais ne compte plus : le nombre annonce ce qui sera rappelé.
  const toutes = stepIds.flatMap((id) => (v?.lecons.parEtape[id]?.remarques ?? []).filter((r) => !v?.gestion || v.epinglee(r)).map((r) => ({ id, r })));
  // Un retour dont la ligne a été retouchée ou supprimée depuis la fournée n'est
  // plus compté : il ne se pose sous aucune ligne de l'étape.
  const comptees = lignes
    ? toutes.filter(({ id, r }) => {
        const l = lignes.find((x) => x.id === id);
        if (!l) return true;
        if (r.nature === 'sous_etape') return l.sousEtapes.some((t) => remarquesDeSousEtape({ titre: '', remarques: [r] }, t).length);
        if (r.nature === 'ingredient') return r.ingredientId != null && l.ingredientIds.includes(r.ingredientId);
        return true;
      })
    : toutes;
  const n = comptees.length;
  if (!n) return null;
  return (
    <span className="text-primary">
      {' '}
      · {n} retour{n > 1 ? 's' : ''} de fournée
    </span>
  );
}
