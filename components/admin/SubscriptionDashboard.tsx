'use client';

// Tableau de bord des abonnements (spec §8.4) : répartition par plan,
// essais en cours, échéances à 30 jours, conversion des essais, historique
// des modifications de plans — plus la file des demandes d'abonnement du
// lot 6, qui n'avait jusqu'ici aucun écran pour être traitée.
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { formatDate } from '@/lib/format';
import type { SubscriptionDashboard as Data } from '@/lib/subscriptions-dashboard';

const ACTION_LABELS: Record<string, string> = {
  PLAN_MODIFIE: 'Grille ou tarifs modifiés',
  PLAN_IDENTITE_MODIFIEE: 'Identité modifiée',
};

export function SubscriptionDashboard({ data }: { data: Data }) {
  return (
    <div className="space-y-10">
      <h1 className="font-display text-3xl text-primary">Tableau de bord des abonnements</h1>

      <section>
        <h2 className="mb-3 font-label-md text-[15px] text-primary">Répartition des membres par plan</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {data.distribution.map((p) => (
            <div key={p.code} className="rounded-lg border border-outline-variant p-4">
              <p className="text-2xl font-semibold">{p.count}</p>
              <p className="text-sm text-on-surface-variant">
                {p.label} · {p.percent} %
              </p>
            </div>
          ))}
          <div className="rounded-lg border border-dashed border-outline-variant p-4">
            <p className="text-2xl font-semibold">{data.totalMembers}</p>
            <p className="text-sm text-on-surface-variant">Total des membres</p>
          </div>
        </div>
      </section>

      <PendingRequestsSection requests={data.pendingRequests} />

      <div className="grid gap-10 md:grid-cols-2">
        <section>
          <h2 className="mb-3 font-label-md text-[15px] text-primary">
            Essais en cours {data.trialsInProgress.length > 0 && `(${data.trialsInProgress.length})`}
          </h2>
          {data.trialsInProgress.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Aucun essai en cours.</p>
          ) : (
            <ul className="space-y-2">
              {data.trialsInProgress.map((t) => (
                <li key={t.userId} className="rounded border border-outline-variant p-3 text-sm">
                  <p className="font-semibold">{t.fullName || t.email}</p>
                  <p className="text-xs text-on-surface-variant">
                    Essai {t.planCode} — se termine le {formatDate(t.endsAt)} ({t.daysLeft} jour{t.daysLeft > 1 ? 's' : ''})
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-label-md text-[15px] text-primary">
            Échéances sous 30 jours {data.expiringSoon.length > 0 && `(${data.expiringSoon.length})`}
          </h2>
          <p className="mb-2 text-xs text-on-surface-variant">Liste de travail pour vos relances manuelles.</p>
          {data.expiringSoon.length === 0 ? (
            <p className="text-sm text-on-surface-variant">Aucune échéance proche.</p>
          ) : (
            <ul className="space-y-2">
              {data.expiringSoon.map((e) => (
                <li key={e.userId} className="rounded border border-outline-variant p-3 text-sm">
                  <p className="font-semibold">{e.fullName || e.email}</p>
                  <p className="text-xs text-on-surface-variant">
                    {e.planCode} ({e.type === 'TRIAL' ? 'essai' : e.type === 'PAID' ? 'payant' : 'offert'}) — se
                    termine le {formatDate(e.endsAt)} ({e.daysLeft} jour{e.daysLeft > 1 ? 's' : ''})
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-label-md text-[15px] text-primary">Conversion des essais (30 derniers jours)</h2>
        {data.trialConversion.ended === 0 ? (
          <p className="text-sm text-on-surface-variant">Aucun essai terminé sur la période.</p>
        ) : (
          <p className="text-sm">
            <span className="text-2xl font-semibold">{data.trialConversion.ratePercent} %</span>{' '}
            <span className="text-on-surface-variant">
              ({data.trialConversion.converted} converti{data.trialConversion.converted > 1 ? 's' : ''} sur{' '}
              {data.trialConversion.ended} essai{data.trialConversion.ended > 1 ? 's' : ''} terminé
              {data.trialConversion.ended > 1 ? 's' : ''})
            </span>
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-label-md text-[15px] text-primary">Historique des modifications de plans</h2>
        {data.planChanges.length === 0 ? (
          <p className="text-sm text-on-surface-variant">Aucune modification enregistrée.</p>
        ) : (
          <ul className="space-y-2">
            {data.planChanges.map((e) => (
              <li key={e.id} className="rounded border border-outline-variant p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{ACTION_LABELS[e.action] ?? e.action}</span>
                  <span className="text-xs text-on-surface-variant">{formatDate(e.createdAt)}</span>
                </div>
                <p className="text-xs text-on-surface-variant">
                  {e.adminName ?? 'Administrateur'}
                  {e.reason && <> — « {e.reason} »</>}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PendingRequestsSection({ requests }: { requests: Data['pendingRequests'] }) {
  const dialog = useDialog();
  const [rows, setRows] = useState(requests);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function traiter(id: number, statut: 'PROCESSED' | 'CANCELLED') {
    setBusyId(id);
    try {
      const {
        data: { user },
      } = await createClient().auth.getUser();
      const { error } = await createClient()
        .from('subscription_requests')
        .update({ status: statut, processed_at: new Date().toISOString(), processed_by: user?.id ?? null } as never)
        .eq('id', id);
      if (error) {
        dialog.alert('Erreur : ' + error.message);
        return;
      }
      setRows((prev) => prev.filter((r) => r.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <h2 className="mb-3 font-label-md text-[15px] text-primary">
        Demandes d’abonnement en attente {rows.length > 0 && `(${rows.length})`}
      </h2>
      <p className="mb-2 text-xs text-on-surface-variant">
        « S’abonner » et « Rétrograder » de la page publique des plans, en l’absence de paiement en ligne (V1) : à
        traiter manuellement, puis à attribuer depuis la fiche du membre (Admin → Membres).
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-on-surface-variant">Aucune demande en attente.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded border border-outline-variant p-3 text-sm">
              <div>
                <p className="font-semibold">{r.fullName || r.email}</p>
                <p className="text-xs text-on-surface-variant">
                  {r.planCode} ({r.periodicity === 'YEARLY' ? 'annuel' : 'mensuel'}) — demandé le {formatDate(r.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => traiter(r.id, 'PROCESSED')}
                  className="rounded-pill border border-outline-variant px-3 py-1.5 text-[12px] font-semibold text-primary hover:bg-surface-container disabled:opacity-40"
                >
                  Traitée
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => traiter(r.id, 'CANCELLED')}
                  className="rounded-pill border border-outline-variant px-3 py-1.5 text-[12px] font-semibold text-on-surface-variant hover:bg-surface-container disabled:opacity-40"
                >
                  Écarter
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
