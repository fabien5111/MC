'use client';

// « Mon forfait » (spec §9.3, étendu sur demande) : état de l'abonnement,
// une jauge par limite applicable, et les actions qui en découlent —
// annuler (abonnement ou essai), s'abonner, passer à une formule
// supérieure, démarrer un essai.
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
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDate, formatDateHeure } from '@/lib/format';
import { gaugeLevel, isOverLimit, overLimitMessage, type Grid } from '@/lib/entitlements';
import type { CurrentPlan, UsageLine } from '@/lib/entitlements-data';
import type { ChangementProgramme } from '@/lib/billing-data';

const COULEUR_JAUGE: Record<string, string> = {
  normal: 'bg-primary',
  attention: 'bg-secondary',
  atteint: 'bg-error',
};

const TYPE_LABEL: Record<string, string> = { TRIAL: 'Essai', PAID: 'Abonnement', GIFT: 'Abonnement offert' };

export function UsageCard({
  usage,
  grid,
  currentPlan,
  trialConsumed,
  hasStripeCustomer,
  changementProgramme,
}: {
  usage: UsageLine[];
  grid: Grid;
  currentPlan: CurrentPlan | null;
  // Essai déjà consommé (tous plans confondus, §7.2) — conditionne le bouton
  // « Essayer », qui ne doit jamais être proposé une seconde fois.
  trialConsumed: boolean;
  // Un client Stripe existe pour ce membre (billing_customers) — conditionne
  // « Factures et moyen de paiement ». Survit à la fin d'un abonnement : un
  // membre qui s'est déjà abonné une fois garde ce bouton même redevenu
  // gratuit, pour mettre à jour une carte avant de se réabonner.
  hasStripeCustomer: boolean;
  // Descente en gamme programmée (échéancier Stripe), lue en direct par la
  // page serveur (`getChangementProgramme`) — jamais recalculée ici. `null`
  // s'il n'y a rien de programmé.
  changementProgramme: ChangementProgramme | null;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);
  // Le voile est partagé par l'annulation et l'ouverture du portail : un
  // libellé figé sur « Annulation… » mentirait sur la seconde.
  const [busyLabel, setBusyLabel] = useState('Annulation…');
  const [justAnnule, setJustAnnule] = useState(false);
  const [finPeriodeAnnulee, setFinPeriodeAnnulee] = useState<string | null>(null);

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
  const estEssai = currentPlan?.type === 'TRIAL';
  // JEP-75 : l'heure de fin n'est ajoutée qu'à l'essai — un abonnement payant
  // se termine le plus souvent à une fin de mois calendaire posée par
  // `mc_cancel_own_subscription`, où une heure n'apporterait rien. Un essai,
  // lui, se termine exactement 7 (ou N) jours après son démarrage, à l'heure
  // près — une échéance qu'on peut manquer de quelques heures.
  const formatFin = estEssai ? formatDateHeure : formatDate;
  const planActuel = grid.plans.find((p) => p.code === currentPlan?.code);
  const hasHigherPlan = grid.plans.some((p) => p.active && (!planActuel || p.orderIndex > planActuel.orderIndex));
  const peutEssayer = !estPayant && !trialConsumed && grid.plans.some((p) => p.active && p.trialAllowed);
  // Convertir l'essai en abonnement payant n'est pas « passer à une formule
  // supérieure » (même niveau de droits, ex. Essai Pro → Pro) : un flag
  // séparé, indépendant de hasHigherPlan (souvent faux ici, le plan technique
  // d'essai étant placé après toutes les formules actives dans la grille).
  const peutSouscrire = estEssai;
  const cancelRequestedAt = currentPlan?.cancelRequestedAt ?? null;

  async function annuler() {
    if (!currentPlan) return;
    const echeance = currentPlan.endsAt ? formatDate(currentPlan.endsAt) : 'la fin du mois en cours';
    const ok = await dialog.confirm(
      `Vous perdrez les avantages de la formule ${currentPlan.label} le ${echeance} — vous repasserez ensuite à la ` +
        `formule Gratuite. Vous conservez l'accès jusqu'à cette date. Continuer ?`,
      { okLabel: estEssai ? 'Annuler mon essai' : 'Annuler mon abonnement', cancelLabel: 'Revenir' },
    );
    if (!ok) return;
    setBusyLabel('Annulation…');
    setBusy(true);
    try {
      const r = await fetch('/api/abonnement/resilier', { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        dialog.alert(data?.erreur || "La résiliation n'a pas pu aboutir.");
        return;
      }
      setJustAnnule(true);
      // `router.refresh()` seul : pour un abonnement Stripe, la ligne
      // `subscriptions` peut ne pas encore porter `cancel_requested_at` au
      // moment de ce rendu — c'est le webhook qui l'écrit, quasi
      // immédiatement mais pas synchrone. `justAnnule` porte l'affichage en
      // attendant, avec la date rendue par Stripe lui-même (`data.finPeriode`),
      // jamais une valeur qui pourrait encore être l'ancienne.
      if (data.finPeriode) setFinPeriodeAnnulee(data.finPeriode);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function gererMoyenPaiement() {
    setBusyLabel('Ouverture du portail…');
    setBusy(true);
    try {
      const r = await fetch('/api/abonnement/portail', { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.url) {
        dialog.alert(data?.erreur || "Impossible d'ouvrir le portail de facturation, réessayez.");
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 border border-outline-variant bg-surface-container-lowest p-8 md:p-10">
      <LoadingOverlay visible={busy} label={busyLabel} />
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[22px] text-primary">speed</span>
          <h2 className="font-headline-md text-headline-md text-primary">
            Mon forfait — {currentPlan?.label ?? 'Gratuit'}
          </h2>
        </div>
        {(peutEssayer ||
          hasHigherPlan ||
          peutSouscrire ||
          estPayant ||
          hasStripeCustomer) && (
          <div className="flex flex-wrap items-center gap-2">
            {peutEssayer && (
              <Link
                href="/plans"
                className="rounded-pill border border-primary px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary hover:text-white"
              >
                Essayer une formule payante
              </Link>
            )}
            {hasHigherPlan && (
              <Link
                href="/plans"
                className="rounded-pill border border-primary px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary hover:text-white"
              >
                Passer à une formule supérieure
              </Link>
            )}
            {peutSouscrire && (
              <Link
                href="/plans"
                className="rounded-pill border border-primary px-4 py-2 font-label-md text-label-md text-primary transition-colors hover:bg-primary hover:text-white"
              >
                S&apos;abonner
              </Link>
            )}
            {estPayant && (
              // Sans ce lien, un abonné déjà sur la formule la plus haute
              // (`hasHigherPlan` faux, donc pas de « Passer à une formule
              // supérieure ») n'avait plus aucun chemin vers `/plans` pour
              // redescendre — seuls « Annuler » et « Gérer mon moyen de
              // paiement » restaient. Toujours affiché pour un abonné payant,
              // même quand une formule supérieure existe déjà par ailleurs :
              // « Passer à » ne mène qu'à la montée, celui-ci à l'écran entier.
              <Link
                href="/plans"
                className="rounded-pill border border-outline-variant px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                Voir toutes les formules
              </Link>
            )}
            {estPayant && !cancelRequestedAt && !justAnnule && (
              <button
                type="button"
                onClick={annuler}
                className="rounded-pill border border-error px-4 py-2 font-label-md text-label-md text-error transition-colors hover:bg-error hover:text-white"
              >
                {estEssai ? 'Annuler mon essai' : 'Annuler mon abonnement'}
              </button>
            )}
            {hasStripeCustomer && (
              <button
                type="button"
                onClick={gererMoyenPaiement}
                className="rounded-pill border border-outline-variant px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                Factures et moyen de paiement
              </button>
            )}
          </div>
        )}
      </div>

      {estPayant && (
        <p className="mb-6 text-sm text-on-surface-variant">
          {cancelRequestedAt || justAnnule ? (
            <>
              Annulé — {TYPE_LABEL[currentPlan!.type] ?? 'Abonnement'} conservé jusqu&apos;au{' '}
              {formatFin(finPeriodeAnnulee ?? currentPlan!.endsAt) || '—'}, sans reconduction ensuite.
            </>
          ) : (
            <>
              {TYPE_LABEL[currentPlan!.type] ?? 'Abonnement'} —{' '}
              {currentPlan!.endsAt
                ? `se termine le ${formatFin(currentPlan!.endsAt)}${
                    // Sous 48 h, l'heure déjà affichée dit tout : un
                    // décompte arrondi au jour supérieur (`Math.ceil`) à
                    // côté d'une heure précise ferait lire « (1 jour) » pour
                    // une échéance dans 3 heures comme dans 23 — et
                    // `daysLeft <= 2`, pas `<= 1` : une échéance dans 30 h
                    // (donc sous 48 h) arrondit déjà à 2 jours
                    // (`Math.ceil(30 / 24) === 2`), pas à 1.
                    currentPlan!.daysLeft !== null && !(estEssai && currentPlan!.daysLeft <= 2)
                      ? ` (${currentPlan!.daysLeft} jour${currentPlan!.daysLeft > 1 ? 's' : ''})`
                      : ''
                  }`
                : 'sans date de fin'}
              .
            </>
          )}
        </p>
      )}

      {estPayant && changementProgramme && !cancelRequestedAt && !justAnnule && (
        // Descente en gamme programmée : sans cette ligne, rien ne le
        // signale une fois le message de confirmation disparu — un membre ne
        // pouvait pas revérifier qu'un changement était pris en compte
        // (constaté le 22/09 en testant §3.2 du plan de test JEP-29).
        <p className="mb-6 text-sm text-on-surface-variant">
          Passage à <strong>{changementProgramme.planLabel}</strong> programmé le{' '}
          {formatDate(changementProgramme.effectiveAt)}.
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
        {approcheOuDepasse && !peutEssayer && !hasHigherPlan && !peutSouscrire && (
          <Link href="/plans" className="font-label-md text-[13px] text-primary underline">
            Voir les formules
          </Link>
        )}
      </div>
    </section>
  );
}
