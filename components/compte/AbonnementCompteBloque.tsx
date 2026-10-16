'use client';

// Gestes d'abonnement d'un compte suspendu ou désactivé (JEP-272) : le membre
// garde la main sur ce qu'il paie. Le portail Stripe (moyen de paiement,
// factures) et la résiliation à l'échéance passent par les routes habituelles,
// volontairement restées ouvertes à un compte bloqué (pas de
// `refusSiCompteBloque`) — les fermer reviendrait à l'empêcher d'arrêter ses
// prélèvements.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { useDialog } from '@/components/Dialog';
import { formatDate } from '@/lib/format';

type Props = {
  libelle: string;
  finPeriode: string | null;
  /** Résiliation déjà programmée chez Stripe : on n'offre plus de la demander. */
  resiliationProgrammee: boolean;
};

export function AbonnementCompteBloque({ libelle, finPeriode, resiliationProgrammee }: Props) {
  const router = useRouter();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState('');
  const [resilie, setResilie] = useState(resiliationProgrammee);

  async function ouvrirPortail() {
    setLabel('Ouverture du portail…');
    setBusy(true);
    try {
      const r = await fetch('/api/abonnement/portail', { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.url) {
        dialog.alert(data?.erreur || "Impossible d'ouvrir le portail de facturation, réessayez.");
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(false);
    }
  }

  async function resilier() {
    const echeance = finPeriode ? formatDate(finPeriode) : 'la fin de la période en cours';
    const ok = await dialog.confirm(
      `Votre abonnement ${libelle} prendra fin le ${echeance} et ne sera pas renouvelé. Continuer ?`,
      { okLabel: 'Résilier mon abonnement', cancelLabel: 'Revenir' },
    );
    if (!ok) return;
    setLabel('Résiliation…');
    setBusy(true);
    try {
      const r = await fetch('/api/abonnement/resilier', { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        dialog.alert(data?.erreur || "La résiliation n'a pas pu aboutir.");
        return;
      }
      setResilie(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-outline-variant px-4 py-3 space-y-3">
      <LoadingOverlay visible={busy} label={label} />
      <p className="font-label-md text-[10px] uppercase tracking-widest text-on-surface-variant">Votre abonnement</p>
      <p className="text-sm text-on-surface-variant">
        {resilie
          ? <>Votre abonnement <strong>{libelle}</strong> est résilié{finPeriode ? <> : il prendra fin le <strong>{formatDate(finPeriode)}</strong></> : null}.</>
          : <>Votre abonnement <strong>{libelle}</strong> reste actif et continue d&apos;être prélevé.</>}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={ouvrirPortail}
          className="font-label-md rounded-full border border-outline-variant px-4 py-2 text-sm hover:bg-surface-container-low"
        >
          Gérer mon abonnement (Stripe)
        </button>
        {!resilie && (
          <button
            type="button"
            onClick={resilier}
            className="font-label-md rounded-full border border-error px-4 py-2 text-sm text-error hover:bg-error/5"
          >
            Résilier mon abonnement
          </button>
        )}
      </div>
    </div>
  );
}
