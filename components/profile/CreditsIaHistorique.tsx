'use client';

// « Historique des crédits IA » (JEP-405) — ce que le membre a consommé, quand
// et pour quoi, sous la jauge de « Mon forfait ». Lecture seule : le journal
// s'écrit au débit (`mc_debiter_credits`), jamais depuis cet écran.
//
// Une ligne par ACTION (un import photo de 3 pages n'est pas quatre lignes) ;
// une période par dotation, la plus récente dépliée. Le total d'une période est
// la consommation de la jauge. Un appel IA qui a échoué est montré « rendu » :
// les crédits sont restitués, et le membre voit qu'il n'a rien perdu.
import { useState } from 'react';
import Link from 'next/link';
import { SettingsCard } from '@/components/profile/SettingsCard';
import { HelpBlockSlot } from '@/components/help/HelpBlockSlot';
import { useHelpBlocks } from '@/components/help/useHelpBlocks';
import type { VisibleHelpBlock } from '@/lib/help';
import { lignesCoutIA, libelleCredits } from '@/lib/credits-ia';
import { libelleDebutPeriode, lienOperation, type PeriodeCredits } from '@/lib/credits-historique';
import { formatDateHeure } from '@/lib/format';

/** Opérations montrées d'abord dans une période ; « Voir plus » en ajoute autant. */
const PAGE = 30;

// Le tarif rappelé en tête vient de la grille (`lignesCoutIA`), comme la page
// des plans : jamais recopié ici.
const TARIF = ['ajustement_ia_mensuel', 'import_ia_mensuel', 'mode_projet_ia_mensuel']
  .flatMap((cle) => lignesCoutIA(cle) ?? [])
  .filter((l) => l.label);

export function CreditsIaHistorique({
  periodes,
  importsExistants,
  helpBlocks = [],
}: {
  periodes: PeriodeCredits[];
  importsExistants: string[];
  helpBlocks?: VisibleHelpBlock[];
}) {
  const help = useHelpBlocks(helpBlocks);
  const existants = new Set(importsExistants);
  const enCours = periodes[0];

  return (
    <SettingsCard icon="toll" title="Historique des crédits IA" count={enCours?.operations.length ?? 0} id="credits-ia">
      <p className="mb-2 text-sm text-on-surface-variant">
        Chaque action d’IA consomme des crédits de votre dotation du mois. Un appel qui échoue ne vous est pas débité.{' '}
        <HelpBlockSlot blockKey="reglages.credits_ia" help={help} className="ml-1 align-middle" />
      </p>
      <p className="mb-6 text-[13px] text-on-surface-variant">
        Ajustement par IA : {libelleCredits(1)} IA · import par texte ou PDF : 3 à 9 crédits IA selon la longueur · import
        par photos : 5 à 26 crédits IA (2 + 3 par page).{' '}
        <Link href="/plans" className="text-primary underline">
          Voir le détail
        </Link>
      </p>

      {periodes.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Aucune action d’IA pour le moment.</p>
      ) : (
        <div className="space-y-3">
          {periodes.map((p, i) => (
            <Periode key={p.debut} periode={p} courante={i === 0} existants={existants} />
          ))}
        </div>
      )}
    </SettingsCard>
  );
}

function Periode({
  periode,
  courante,
  existants,
}: {
  periode: PeriodeCredits;
  courante: boolean;
  existants: ReadonlySet<string>;
}) {
  const [visibles, setVisibles] = useState(PAGE);
  const ops = periode.operations;

  return (
    <details open={courante} className="rounded-lg border border-outline-variant">
      <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <span className="font-label-md text-[14px] text-on-surface">
          {courante ? 'Période en cours' : 'Période'} · depuis le {libelleDebutPeriode(periode.debut)}
        </span>
        <span className="text-[13px] font-semibold text-primary">{libelleCredits(periode.total)} IA utilisé{periode.total > 1 ? 's' : ''}</span>
      </summary>
      <ul className="divide-y divide-outline-variant/60 border-t border-outline-variant/60">
        {ops.slice(0, visibles).map((o) => {
          const lien = lienOperation(o, existants);
          return (
            <li key={o.groupe} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-on-surface">
                  {lien ? (
                    <Link href={lien} className="text-primary underline">
                      {o.libelle}
                    </Link>
                  ) : (
                    o.libelle
                  )}
                </span>
                <span className="block text-[12px] text-on-surface-variant">{formatDateHeure(o.date)}</span>
              </span>
              <span className="shrink-0 text-right">
                {o.statut === 'rendu' ? (
                  <span className="text-[13px] text-on-surface-variant">
                    <s>{o.rendus}</s> rendu{o.rendus > 1 ? 's' : ''} (échec)
                  </span>
                ) : (
                  <>
                    <span className="font-semibold text-on-surface">−{o.credits}</span>
                    {o.statut === 'partiel' && (
                      <span className="block text-[12px] text-on-surface-variant">dont {o.rendus} rendu{o.rendus > 1 ? 's' : ''}</span>
                    )}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {ops.length > visibles && (
        <button
          type="button"
          onClick={() => setVisibles((v) => v + PAGE)}
          className="w-full border-t border-outline-variant/60 px-4 py-2.5 text-[13px] text-primary hover:bg-surface-container-low"
        >
          Voir plus ({ops.length - visibles})
        </button>
      )}
    </details>
  );
}
