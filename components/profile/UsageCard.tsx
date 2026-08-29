'use client';

// « Mon forfait » (spec §9.3, étendu sur demande) : état de l'abonnement,
// une jauge par limite applicable, et les trois actions qui en découlent —
// annuler, passer à une formule supérieure, démarrer un essai.
//
// Composant client (et non plus Server Component pur) : l'annulation en
// libre-service a besoin d'un état local (en cours / fait) et d'une boîte de
// confirmation. Les données restent entièrement fournies par la page
// serveur — aucune lecture propre ici.
//
// Pas de `SettingsCard` (bloc repliable) : contrairement aux relations
// révocables (abonnements, partages), c'est une information d'état que le
// membre doit voir d'un coup d'œil, pas une liste qu'il consulte rarement.
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDate } from '@/lib/format';
import { gaugeLevel, isOverLimit, overLimitMessage, type Grid } from '@/lib/entitlements';
import type { CurrentPlan, UsageLine } from '@/lib/entitlements-data';

const COULEUR_JAUGE: Record<string, string> = {
  normal: 'bg-primary',
  attention: 'bg-secondary',
  atteint: 'bg-error',
};

const TYPE_LABEL: Record<string, string> = { TRIAL: 'Essai', PAID: 'Abonnement', GIFT: 'Abonnement offert' };

// `mc_cancel_own_subscription` n'est pas encore dans lib/database.types.ts
// tant que la migration n'a pas été appliquée puis régénérée — appel non
// typé en attendant, même motif que `mc_publish_plan_version` dans
// PlansManager.
function rpc(): (fn: string) => PromiseLike<{ data: string | null; error: { message: string } | null }> {
  return createClient().rpc as unknown as (fn: string) => PromiseLike<{ data: string | null; error: { message: string } | null }>;
}

export function UsageCard({
  usage,
  grid,
  currentPlan,
  trialConsumed,
}: {
  usage: UsageLine[];
  grid: Grid;
  currentPlan: CurrentPlan | null;
  // Essai déjà consommé (tous plans confondus, §7.2) — conditionne le bouton
  // « Essayer », qui ne doit jamais être proposé une seconde fois.
  trialConsumed: boolean;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  const [justAnnule, setJustAnnule] = useState(false);

  const parCle = new Map(grid.features.map((f) => [f.key, f]));
  const lignes = usage
    .map((u) => ({ u, feature: parCle.get(u.featureKey) }))
    .filter((l): l is { u: UsageLine; feature: (typeof grid.features)[number] } => !!l.feature)
    .sort((a, b) => a.feature.sectionOrder - b.feature.sectionOrder || a.feature.orderIndex - b.feature.orderIndex);

  // Un lien vers les plans seulement si quelque chose le justifie (§9.3) :
  // pas de sollicitation permanente pour un membre loin de ses limites.
  const approcheOuDepasse = lignes.some(
    ({ u }) => !u.unlimited && u.limitValue !== null && (gaugeLevel(u.usage, u.limitValue) !== 'normal' || isOverLimit(u.usage, u.limitValue)),
  );

  const estPayant = !!currentPlan && currentPlan.type !== 'DEFAULT';
  const planActuel = grid.plans.find((p) => p.code === currentPlan?.code);
  const hasHigherPlan = grid.plans.some((p) => p.active && (!planActuel || p.orderIndex > planActuel.orderIndex));
  const peutEssayer = !estPayant && !trialConsumed && grid.plans.some((p) => p.active && p.trialAllowed);
  const cancelRequestedAt = currentPlan?.cancelRequestedAt ?? null;

  async function annuler() {
    if (!currentPlan) return;
    const echeance = currentPlan.endsAt ? formatDate(currentPlan.endsAt) : 'la fin du mois en cours';
    const ok = await dialog.confirm(
      `Vous perdrez les avantages de la formule ${currentPlan.label} le ${echeance} — vous repasserez ensuite à la ` +
        `formule Gratuite. Vous conservez l'accès jusqu'à cette date. Continuer ?`,
      { okLabel: 'Annuler mon abonnement', cancelLabel: 'Revenir' },
    );
    if (!ok) return;
    setBusy(true);
    try {
      const { error } = await rpc()('mc_cancel_own_subscription');
      if (error) {
        dialog.alert('Erreur : ' + error.message);
        return;
      }
      setJustAnnule(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 border border-outline-variant bg-surface-container-lowest p-8 md:p-10">
      <LoadingOverlay visible={busy} label="Annulation…" />
      <div className="mb-2 flex items-center gap-3">
        <span className="material-symbols-outlined text-[22px] text-primary">speed</span>
        <h2 className="font-headline-md text-headline-md text-primary">
          Mon forfait — {currentPlan?.label ?? 'Gratuit'}
        </h2>
      </div>

      {estPayant && (
        <p className="mb-6 text-sm text-on-surface-variant">
          {cancelRequestedAt || justAnnule ? (
            <>
              Annulé — {TYPE_LABEL[currentPlan!.type] ?? 'Abonnement'} conservé jusqu&apos;au{' '}
              {currentPlan!.endsAt ? formatDate(currentPlan!.endsAt) : '—'}, sans reconduction ensuite.
            </>
          ) : (
            <>
              {TYPE_LABEL[currentPlan!.type] ?? 'Abonnement'} —{' '}
              {currentPlan!.endsAt
                ? `se termine le ${formatDate(currentPlan!.endsAt)}${
                    currentPlan!.daysLeft !== null ? ` (${currentPlan!.daysLeft} jour${currentPlan!.daysLeft > 1 ? 's' : ''})` : ''
                  }`
                : 'sans date de fin'}
              .
            </>
          )}
        </p>
      )}

      {lignes.length === 0 ? (
        <p className="text-sm italic text-on-surface-variant">Aucune limite applicable à votre formule.</p>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lignes.map(({ u, feature }) => {
            const illimite = u.unlimited || u.limitValue === null;
            const depasse = !illimite && isOverLimit(u.usage, u.limitValue);
            const niveau = illimite ? 'normal' : gaugeLevel(u.usage, u.limitValue);
            const pourcentage = illimite ? 0 : Math.min(100, (u.usage / Math.max(u.limitValue!, 1)) * 100);

            return (
              <div key={u.featureKey} className="rounded-lg border border-outline-variant bg-surface p-4">
                <p className="font-headline-md text-2xl text-on-surface">
                  {u.usage}
                  {!illimite && <span className="text-on-surface-variant"> / {u.limitValue}</span>}
                </p>
                <p className="mt-0.5 text-xs text-on-surface-variant">
                  {feature.label}
                  {feature.unit ? ` (${feature.unit})` : ''}
                  {illimite && ' · illimité'}
                </p>
                {!illimite && (
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-outline-variant/40">
                    <div
                      className={`h-full rounded-full transition-all ${COULEUR_JAUGE[niveau]}`}
                      style={{ width: `${pourcentage}%` }}
                    />
                  </div>
                )}
                {depasse && (
                  <p className="mt-1.5 text-xs text-error">{overLimitMessage(u.usage, u.limitValue!, feature.unit)}</p>
                )}
                {u.limitType === 'FLOW' && u.periodEnd && (
                  <p className="mt-1 text-[11px] text-on-surface-variant">Se recharge le {formatDate(u.periodEnd)}.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {peutEssayer && (
          <Link href="/plans" className="font-label-md text-[13px] text-primary underline">
            Essayer une formule payante
          </Link>
        )}
        {hasHigherPlan && (
          <Link href="/plans" className="font-label-md text-[13px] text-primary underline">
            Passer à une formule supérieure
          </Link>
        )}
        {approcheOuDepasse && !peutEssayer && !hasHigherPlan && (
          <Link href="/plans" className="font-label-md text-[13px] text-primary underline">
            Voir les formules
          </Link>
        )}
        {estPayant && !cancelRequestedAt && !justAnnule && (
          <button type="button" onClick={annuler} className="font-label-md text-[13px] text-error underline">
            Annuler mon abonnement
          </button>
        )}
      </div>
    </section>
  );
}
