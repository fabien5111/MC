'use client';

// Page publique des plans (spec §9.1, §9.2) — entièrement générée depuis la
// grille : ajouter une fonctionnalité en back-office la fait apparaître ici
// sans une ligne de code (critère d'acceptation 8).
//
// `'use client'` pour deux raisons, toutes deux liées à l'interaction, jamais
// à la donnée (qui vient intégralement des props, rendu serveur) :
//  - la bascule mensuel/annuel ;
//  - les boutons d'action, qui écrivent (`mc_start_trial`,
//    `subscription_requests`) et doivent réagir sans recharger la page.
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import {
  annualSaving,
  diffRights,
  formatRight,
  hasYearlyOption,
  type Grid,
} from '@/lib/entitlements';
import type { PendingRequest } from '@/lib/entitlements-data';

export function PlansPage({
  grid,
  planIds,
  connecte,
  currentPlanCode,
  trialConsumed,
  trialDays,
  pending,
}: {
  grid: Grid;
  planIds: Record<string, number>;
  connecte: boolean;
  currentPlanCode: string | null;
  trialConsumed: boolean;
  trialDays: number;
  pending: PendingRequest | null;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const [annuel, setAnnuel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [demandeEnCours, setDemandeEnCours] = useState(pending);

  const plans = useMemo(
    () => [...grid.plans].filter((p) => p.active || p.code === currentPlanCode).sort((a, b) => a.orderIndex - b.orderIndex),
    [grid.plans, currentPlanCode],
  );
  const sections = useMemo(() => {
    const visibles = grid.features.filter((f) => f.visible);
    const map = new Map<string, typeof visibles>();
    for (const f of visibles) {
      const liste = map.get(f.section) ?? [];
      liste.push(f);
      map.set(f.section, liste);
    }
    return [...map.entries()].sort(([, a], [, b]) => a[0].sectionOrder - b[0].sectionOrder);
  }, [grid.features]);

  const bascule = hasYearlyOption(plans);
  const currentIndex = plans.findIndex((p) => p.code === currentPlanCode);

  async function essayer(planCode: string) {
    setBusy(true);
    try {
      const r = await fetch('/api/plans/essayer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan: planCode }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        dialog.alert(data?.erreur || "L'essai n'a pas pu démarrer.");
        return;
      }
      await dialog.alert(`Essai démarré : profitez de ${trialDays} jours de ${planCode} gratuitement.`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function demander(planCode: string, periodicite: 'MONTHLY' | 'YEARLY') {
    if (demandeEnCours) {
      dialog.alert(
        `Vous avez déjà une demande en attente pour ${demandeEnCours.planCode}. Un administrateur va la traiter.`,
      );
      return;
    }
    const planId = planIds[planCode];
    if (!planId) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push('/connexion?next=/plans');
        return;
      }
      const { data, error } = await supabase
        .from('subscription_requests')
        .insert({ user_id: user.id, plan_id: planId, periodicity: periodicite } as never)
        .select('id, created_at')
        .single();
      if (error || !data) {
        dialog.alert('Erreur : ' + (error?.message ?? 'demande refusée'));
        return;
      }
      setDemandeEnCours({ id: (data as { id: number }).id, planCode, createdAt: (data as { created_at: string }).created_at });
      await dialog.alert('Votre demande a été transmise. Un administrateur la traitera prochainement.');
    } finally {
      setBusy(false);
    }
  }

  async function retrograder(planCode: string) {
    if (!currentPlanCode) return;
    const changements = diffRights(grid.rights[currentPlanCode] ?? {}, grid.rights[planCode] ?? {}).filter(
      (c) => !c.favorable,
    );
    const perdu = changements
      .map((c) => {
        const f = grid.features.find((x) => x.key === c.featureKey);
        return f ? `— ${f.label}` : null;
      })
      .filter((v): v is string => !!v);
    const texte = perdu.length
      ? `En repassant à ${planCode}, vous perdrez :\n${perdu.join('\n')}\n\nContinuer ?`
      : `Repasser à ${planCode} ?`;
    const ok = await dialog.confirm(texte);
    if (!ok) return;
    await demander(planCode, annuel ? 'YEARLY' : 'MONTHLY');
  }

  return (
    <div>
      <LoadingOverlay visible={busy} />
      <h1 className="mb-2 text-center font-display text-3xl text-primary md:text-4xl">Nos formules</h1>
      <p className="mb-8 text-center text-sm text-on-surface-variant">
        Un essai gratuit de {trialDays} jours, sans moyen de paiement, sur les formules qui le proposent.
      </p>

      {bascule && (
        <div className="mb-10 flex items-center justify-center gap-3">
          <span className={!annuel ? 'font-semibold text-primary' : 'text-on-surface-variant'}>Mensuel</span>
          <button
            type="button"
            role="switch"
            aria-checked={annuel}
            onClick={() => setAnnuel((v) => !v)}
            className={`relative h-7 w-12 rounded-full transition-colors ${annuel ? 'bg-primary' : 'bg-outline-variant'}`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${annuel ? 'translate-x-6' : 'translate-x-1'}`}
            />
          </button>
          <span className={annuel ? 'font-semibold text-primary' : 'text-on-surface-variant'}>Annuel</span>
        </div>
      )}

      {demandeEnCours && (
        <p className="mb-6 rounded-lg bg-surface-container p-3 text-center text-sm text-on-surface-variant">
          Demande en attente pour {demandeEnCours.planCode} — un administrateur va la traiter.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-1/4 p-4 text-left align-bottom" />
              {plans.map((p) => {
                const tarif = annuel ? p.priceYearly : p.priceMonthly;
                const eco = bascule ? annualSaving(p.priceMonthly, p.priceYearly) : null;
                return (
                  <th key={p.code} className="p-4 text-center align-bottom">
                    <p className="font-label-md text-[17px] text-primary">{p.label}</p>
                    {p.tagline && <p className="mt-0.5 text-xs text-on-surface-variant">{p.tagline}</p>}
                    <p className="mt-3 font-headline-md text-2xl">
                      {tarif === null ? (p.isDefault ? 'Gratuit' : '—') : tarif === 0 ? 'Gratuit' : `${tarif.toFixed(2)} €`}
                      {tarif !== null && tarif > 0 && (
                        <span className="text-sm font-normal text-on-surface-variant">
                          {' '}
                          / {annuel ? 'an' : 'mois'}
                        </span>
                      )}
                    </p>
                    {annuel && eco !== null && <p className="text-xs text-tertiary">Soit {eco} % d’économie</p>}
                    <div className="mt-4">
                      <BoutonPlan
                        plan={p}
                        connecte={connecte}
                        estCourant={p.code === currentPlanCode}
                        inferieur={currentIndex >= 0 && p.orderIndex < plans[currentIndex].orderIndex}
                        trialConsumed={trialConsumed}
                        // Sans tarif configuré pour cette formule, « S'abonner »
                        // n'a rien à proposer — jamais affiché dans ce cas
                        // (un essai reste possible, lui, sans moyen de paiement).
                        aUnTarif={tarif !== null}
                        onEssayer={() => essayer(p.code)}
                        onAbonner={() => demander(p.code, annuel ? 'YEARLY' : 'MONTHLY')}
                        onRetrograder={() => retrograder(p.code)}
                      />
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sections.map(([section, features]) => (
              <FragmentSection key={section} section={section} features={features} plans={plans} grid={grid} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentSection({
  section,
  features,
  plans,
  grid,
}: {
  section: string;
  features: Grid['features'];
  plans: Grid['plans'];
  grid: Grid;
}) {
  return (
    <>
      <tr className="bg-surface-container">
        <td colSpan={plans.length + 1} className="p-3 font-label-md text-[14px] text-primary">
          {section}
        </td>
      </tr>
      {[...features]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((f) => (
          <tr key={f.key} className="border-b border-outline-variant/50">
            <td className="p-3 text-on-surface-variant" title={f.description ?? undefined}>
              {f.label}
            </td>
            {plans.map((p) => {
              const right = grid.rights[p.code]?.[f.key];
              const texte = formatRight(right, f);
              return (
                <td key={p.code} className="p-3 text-center">
                  {right?.value === 'NO' ? (
                    <span className="text-on-surface-variant/50">—</span>
                  ) : right?.value === 'YES' ? (
                    <span className="material-symbols-outlined align-middle text-tertiary">check</span>
                  ) : (
                    <span className="font-semibold text-on-surface">{texte}</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
}

function BoutonPlan({
  plan,
  connecte,
  estCourant,
  inferieur,
  trialConsumed,
  aUnTarif,
  onEssayer,
  onAbonner,
  onRetrograder,
}: {
  plan: Grid['plans'][number];
  connecte: boolean;
  estCourant: boolean;
  inferieur: boolean;
  trialConsumed: boolean;
  // Un tarif est configuré pour cette formule (périodicité affichée) —
  // sans lui, « S'abonner » n'a rien à proposer et ne s'affiche jamais.
  // L'essai, lui, ne demande aucun moyen de paiement : il reste possible.
  aUnTarif: boolean;
  onEssayer: () => void;
  onAbonner: () => void;
  onRetrograder: () => void;
}) {
  const cls =
    'w-full rounded-pill px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50';

  if (estCourant) {
    return (
      <button type="button" disabled className={`${cls} bg-surface-container text-on-surface-variant`}>
        Votre plan
      </button>
    );
  }
  if (!connecte) {
    // Ni essai ni tarif à proposer (la formule par défaut, typiquement) :
    // le geste qui reste est de rejoindre le site, pas de « s'abonner » à
    // une formule gratuite par construction — même lien que « Créer un
    // compte » de l'en-tête.
    if (!plan.trialAllowed && !aUnTarif) {
      return (
        <Link href="/connexion?inscription=1" className={`${cls} block border border-outline-variant text-center text-primary hover:bg-surface-container`}>
          Créer un compte
        </Link>
      );
    }
    return (
      <Link href="/connexion?next=/plans" className={`${cls} block bg-primary text-center text-on-primary hover:shadow-lg`}>
        {plan.trialAllowed ? 'Essayer' : "S'abonner"}
      </Link>
    );
  }
  if (inferieur) {
    return (
      <button type="button" onClick={onRetrograder} className={`${cls} border border-outline-variant text-primary hover:bg-surface-container`}>
        Rétrograder
      </button>
    );
  }
  if (plan.trialAllowed && !trialConsumed) {
    return (
      <button type="button" onClick={onEssayer} className={`${cls} bg-primary text-on-primary hover:shadow-lg`}>
        Essayer gratuitement
      </button>
    );
  }
  if (!aUnTarif) return null;
  return (
    <button type="button" onClick={onAbonner} className={`${cls} bg-primary text-on-primary hover:shadow-lg`}>
      S&apos;abonner
    </button>
  );
}
