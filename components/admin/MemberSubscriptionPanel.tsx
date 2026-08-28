'use client';

// Fiche membre — onglet Abonnement (spec §8.3) : bandeau d'état, historique
// complet, consommation actuelle et quatre actions administrateur.
//
// Chargé à la demande (`GET /api/admin/membres/[id]/abonnement`) plutôt que
// livré avec la liste : l'historique et les cinq comptages de consommation
// ne servent qu'au moment où l'administrateur ouvre CETTE fiche.
//
// **Toute mutation passe par une fonction serveur** (`mc_admin_*`,
// SECURITY DEFINER) et jamais par une écriture directe sur `subscriptions` :
// ce sont elles qui ferment l'abonnement actif avant d'en ouvrir un autre, et
// qui tiennent le journal. Un motif est de ce fait toujours demandé — la
// base le refuse sinon, mais mieux vaut ne jamais lui envoyer la requête vide.
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDate } from '@/lib/format';
import { gaugeLevel, isOverLimit } from '@/lib/entitlements';
import type { MemberSubscriptionOverview, SubscriptionRow } from '@/lib/subscriptions-admin';

// `mc_admin_*` ne sont pas encore dans lib/database.types.ts tant que la
// migration n'a pas été appliquée puis régénérée — appel non typé en
// attendant, même motif que `mc_publish_plan_version` dans PlansManager.
function rpc(): (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> {
  return createClient().rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null }>;
}

const TYPE_LABELS: Record<string, string> = { DEFAULT: 'Gratuit', TRIAL: 'Essai', PAID: 'Payant', GIFT: 'Offert' };
const STATUS_LABELS: Record<string, string> = { ACTIVE: 'Actif', EXPIRED: 'Expiré', CANCELLED: 'Annulé' };

export function MemberSubscriptionPanel({
  memberId,
  memberLabel,
  onClose,
}: {
  memberId: string;
  memberLabel: string;
  onClose: () => void;
}) {
  const dialog = useDialog();
  const [data, setData] = useState<MemberSubscriptionOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function recharger() {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/membres/${memberId}/abonnement`);
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    recharger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  async function appeler(fn: string, args: Record<string, unknown>, succes: string) {
    setBusy(true);
    try {
      const { error } = await rpc()(fn, args);
      if (error) {
        dialog.alert('Erreur : ' + error.message);
        return;
      }
      await recharger();
      await dialog.alert(succes);
    } finally {
      setBusy(false);
    }
  }

  async function attribuer(changerDePlan: boolean) {
    if (!data) return;
    const code = await dialog.prompt(
      `${changerDePlan ? 'Nouveau plan' : 'Plan à attribuer'} (${data.availablePlans.map((p) => p.code).join(' / ')}) :`,
      { required: true },
    );
    if (!code) return;
    if (!data.availablePlans.some((p) => p.code === code.trim().toUpperCase())) {
      dialog.alert('Code de plan inconnu.');
      return;
    }
    const type = await dialog.prompt('Type (TRIAL / PAID / GIFT) :', { required: true, placeholder: 'PAID' });
    if (!type || !['TRIAL', 'PAID', 'GIFT'].includes(type.trim().toUpperCase())) {
      dialog.alert('Type invalide.');
      return;
    }
    const finStr = await dialog.prompt('Date de fin (AAAA-MM-JJ, vide = sans fin) :');
    if (finStr === null) return;
    const motif = await dialog.prompt('Motif (obligatoire, conservé au journal) :', { required: true });
    if (!motif) return;

    await appeler(
      'mc_admin_grant_subscription',
      {
        p_user_id: memberId,
        p_plan_code: code.trim().toUpperCase(),
        p_type: type.trim().toUpperCase(),
        p_periodicity: 'NONE',
        p_starts_at: new Date().toISOString(),
        p_ends_at: finStr.trim() ? new Date(`${finStr.trim()}T23:59:59`).toISOString() : null,
        p_reason: motif,
      },
      changerDePlan ? 'Plan changé.' : 'Abonnement attribué.',
    );
  }

  async function prolonger() {
    if (!data?.current || data.current.type === 'DEFAULT') return;
    const finStr = await dialog.prompt('Nouvelle date de fin (AAAA-MM-JJ) :', { required: true });
    if (!finStr) return;
    const motif = await dialog.prompt('Motif (obligatoire) :', { required: true });
    if (!motif) return;
    await appeler(
      'mc_admin_extend_subscription',
      { p_subscription_id: data.current.id, p_new_ends_at: new Date(`${finStr.trim()}T23:59:59`).toISOString(), p_reason: motif },
      'Abonnement prolongé.',
    );
  }

  async function annuler() {
    if (!data?.current || data.current.type === 'DEFAULT') return;
    const immediat = await dialog.confirm(
      'Effet immédiat (le droit s’éteint tout de suite) ?\nAnnuler cette confirmation propose l’effet à échéance à la place.',
      { okLabel: 'Immédiat', cancelLabel: 'À échéance' },
    );
    const motif = await dialog.prompt('Motif (obligatoire) :', { required: true });
    if (!motif) return;
    await appeler(
      'mc_admin_cancel_subscription',
      { p_subscription_id: data.current.id, p_immediate: immediat, p_reason: motif },
      immediat ? 'Abonnement annulé immédiatement.' : 'Abonnement annulé à échéance.',
    );
  }

  async function reinitialiserEssai() {
    const motif = await dialog.prompt('Motif de la réinitialisation (obligatoire) :', { required: true });
    if (!motif) return;
    await appeler('mc_admin_reset_trial', { p_user_id: memberId, p_reason: motif }, 'Éligibilité à l’essai réinitialisée.');
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-lg bg-surface-bright border-l border-outline-variant z-50 flex flex-col">
        <LoadingOverlay visible={busy} label="Enregistrement…" />
        <div className="flex items-center justify-between px-8 py-6 border-b border-outline-variant">
          <h3 className="font-headline-md text-xl font-semibold">Abonnement — {memberLabel}</h3>
          <button onClick={onClose} className="text-on-surface-variant hover:text-primary">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
          {loading || !data ? (
            <p className="text-sm text-on-surface-variant">Chargement…</p>
          ) : (
            <>
              <section className="rounded-lg border border-outline-variant p-4">
                {data.current ? (
                  <>
                    <p className="font-label-md text-[15px]">
                      {data.current.planLabel} — {TYPE_LABELS[data.current.type] ?? data.current.type}
                    </p>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      Depuis le {formatDate(data.current.startsAt)}
                      {data.current.endsAt
                        ? ` — se termine le ${formatDate(data.current.endsAt)}${
                            data.daysLeft !== null ? ` (${data.daysLeft} jour${data.daysLeft > 1 ? 's' : ''})` : ''
                          }`
                        : ' — sans date de fin'}
                    </p>
                    {data.current.type === 'TRIAL' && (
                      <p className="mt-1 text-xs font-semibold text-secondary">Essai gratuit en cours</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-on-surface-variant">Aucun abonnement.</p>
                )}
              </section>

              <section className="flex flex-wrap gap-2">
                <button type="button" onClick={() => attribuer(false)} className={btn}>
                  Attribuer
                </button>
                {data.current && data.current.type !== 'DEFAULT' && (
                  <>
                    <button type="button" onClick={() => attribuer(true)} className={btn}>
                      Changer de plan
                    </button>
                    <button type="button" onClick={prolonger} className={btn}>
                      Prolonger
                    </button>
                    <button type="button" onClick={annuler} className={btnDanger}>
                      Annuler
                    </button>
                  </>
                )}
                <button type="button" onClick={reinitialiserEssai} disabled={!data.trialConsumed} className={btn}>
                  Réinitialiser l’essai
                </button>
              </section>
              {!data.trialConsumed && (
                <p className="-mt-4 text-xs text-on-surface-variant">Aucun essai consommé à réinitialiser.</p>
              )}

              <section>
                <h4 className="mb-2 font-label-md text-[13px] text-primary">Consommation actuelle</h4>
                {data.usage.length === 0 ? (
                  <p className="text-sm text-on-surface-variant">Aucune limite applicable.</p>
                ) : (
                  <ul className="space-y-2">
                    {data.usage.map((u) => {
                      const niveau = u.unlimited ? 'normal' : gaugeLevel(u.usage, u.limitValue);
                      const depasse = !u.unlimited && isOverLimit(u.usage, u.limitValue);
                      return (
                        <li key={u.featureKey} className="text-sm">
                          <div className="flex items-center justify-between">
                            <span>{u.featureKey}</span>
                            <span
                              className={
                                niveau === 'atteint' || depasse
                                  ? 'text-error font-semibold'
                                  : niveau === 'attention'
                                    ? 'text-secondary font-semibold'
                                    : 'text-on-surface-variant'
                              }
                            >
                              {u.usage} / {u.unlimited || u.limitValue === null ? '∞' : u.limitValue}
                            </span>
                          </div>
                          {depasse && (
                            <p className="text-xs text-error">
                              Dépassement consécutif à une rétrogradation — l’existant est conservé.
                            </p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section>
                <h4 className="mb-2 font-label-md text-[13px] text-primary">Historique</h4>
                <ul className="space-y-2">
                  {data.history.map((h) => (
                    <LigneHistorique key={h.id} ligne={h} />
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function LigneHistorique({ ligne }: { ligne: SubscriptionRow }) {
  return (
    <li className="rounded border border-outline-variant p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold">
          {ligne.planLabel} — {TYPE_LABELS[ligne.type] ?? ligne.type}
        </span>
        <span className="text-on-surface-variant">{STATUS_LABELS[ligne.status] ?? ligne.status}</span>
      </div>
      <p className="mt-1 text-on-surface-variant">
        {formatDate(ligne.startsAt)} → {ligne.endsAt ? formatDate(ligne.endsAt) : 'sans fin'}
      </p>
      {ligne.reason && <p className="mt-1 italic text-on-surface-variant">« {ligne.reason} »</p>}
    </li>
  );
}

const btn =
  'rounded-pill border border-outline-variant px-4 py-2 text-[12.5px] font-semibold text-primary transition-colors hover:bg-surface-container disabled:opacity-40';
const btnDanger =
  'rounded-pill border border-error px-4 py-2 text-[12.5px] font-semibold text-error transition-colors hover:bg-error/5';
