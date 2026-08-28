'use client';

// Paramétrage des plans d'abonnement (spec §8.1) : identité, tarifs et grille
// des droits, une colonne par plan.
//
// Trois principes portés par cet écran :
//
// 1. **L'identité n'est pas versionnée.** Le libellé, l'accroche et l'ordre
//    vivent sur `plans` ; les renommer ne crée aucune version et ne change
//    aucun droit — c'est la contrainte forte de la spécification (§3.1), et
//    c'est le `code`, invisible ici sauf en lecture seule, qui porte la
//    logique.
// 2. **Rien n'est enregistré à la volée.** Les modifications restent locales
//    jusqu'à « Publier », qui affiche un récapitulatif lisible avant
//    d'écrire. Une limite abaissée par erreur, enregistrée à la frappe,
//    serait déjà partie en base.
// 3. **Le récapitulatif dit qui est touché et comment.** Une modification
//    favorable s'applique tout de suite aux abonnés en cours ; une
//    défavorable ne les atteint pas. Le décompte des membres accompagne les
//    deux, parce que c'est la seule information qui rende la décision
//    concrète.
//
// `mc_publish_plan_version` n'est pas encore dans lib/database.types.ts tant
// que la migration n'a pas été régénérée : l'appel passe par un cast local,
// même motif que `ads` dans PartnersManager.
import { Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { revalidateReference } from '@/lib/revalidate-reference';
import {
  coherenceIssues,
  diffRights,
  formatRight,
  type Grid,
  type GridFeature,
  type GridRight,
} from '@/lib/entitlements';
import type { AdminGrid } from '@/lib/plans-admin';

type Identite = { label: string; tagline: string; orderIndex: number; active: boolean; trialAllowed: boolean };
type Tarifs = { monthly: string; yearly: string; currency: string };

const nombreOuNull = (v: string): number | null => {
  const n = Number.parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function PlansManager({ grid }: { grid: AdminGrid }) {
  const router = useRouter();
  const dialog = useDialog();
  const [busy, setBusy] = useState(false);

  const [identites, setIdentites] = useState<Record<string, Identite>>(() =>
    Object.fromEntries(
      grid.plans.map((p) => [
        p.code,
        {
          label: p.label,
          tagline: p.tagline ?? '',
          orderIndex: p.orderIndex,
          active: p.active,
          trialAllowed: p.trialAllowed,
        },
      ]),
    ),
  );
  const [tarifs, setTarifs] = useState<Record<string, Tarifs>>(() =>
    Object.fromEntries(
      grid.plans.map((p) => [
        p.code,
        {
          monthly: p.priceMonthly === null ? '' : String(p.priceMonthly),
          yearly: p.priceYearly === null ? '' : String(p.priceYearly),
          currency: p.currency,
        },
      ]),
    ),
  );
  const [droits, setDroits] = useState<Record<string, Record<string, GridRight>>>(() =>
    JSON.parse(JSON.stringify(grid.rights)),
  );

  // Grille telle qu'elle serait publiée : c'est elle que le contrôle de
  // cohérence inspecte, pas celle qui est en base. L'avertissement doit
  // apparaître pendant la saisie, pas après l'enregistrement.
  const projet: Grid = useMemo(
    () => ({
      plans: grid.plans.map((p) => ({
        ...p,
        label: identites[p.code].label,
        tagline: identites[p.code].tagline || null,
        orderIndex: identites[p.code].orderIndex,
        active: identites[p.code].active,
        trialAllowed: identites[p.code].trialAllowed,
        priceMonthly: nombreOuNull(tarifs[p.code].monthly),
        priceYearly: nombreOuNull(tarifs[p.code].yearly),
        currency: tarifs[p.code].currency,
      })),
      features: grid.features,
      rights: droits,
    }),
    [grid.plans, grid.features, identites, tarifs, droits],
  );

  const alertes = useMemo(() => coherenceIssues(projet), [projet]);
  const sections = useMemo(() => {
    const map = new Map<string, GridFeature[]>();
    for (const f of grid.features) {
      const liste = map.get(f.section) ?? [];
      liste.push(f);
      map.set(f.section, liste);
    }
    return [...map.entries()];
  }, [grid.features]);

  function setDroit(code: string, key: string, patch: Partial<GridRight>) {
    setDroits((prev) => ({ ...prev, [code]: { ...prev[code], [key]: { ...prev[code][key], ...patch } } }));
  }

  // Plans dont quelque chose de versionné a changé (droits ou tarifs).
  const modifies = useMemo(
    () =>
      grid.plans.filter((p) => {
        const changementDroits = diffRights(grid.rights[p.code] ?? {}, droits[p.code] ?? {}).length > 0;
        const t = tarifs[p.code];
        return (
          changementDroits ||
          nombreOuNull(t.monthly) !== p.priceMonthly ||
          nombreOuNull(t.yearly) !== p.priceYearly ||
          t.currency !== p.currency
        );
      }),
    [grid.plans, grid.rights, droits, tarifs],
  );

  async function publier() {
    // Récapitulatif avant écriture : ce qui change, pour quel plan, dans quel
    // sens, et combien de membres sont concernés.
    const lignes: string[] = [];
    for (const p of grid.plans) {
      const changements = diffRights(grid.rights[p.code] ?? {}, droits[p.code] ?? {});
      const t = tarifs[p.code];
      const tarifChange =
        nombreOuNull(t.monthly) !== p.priceMonthly ||
        nombreOuNull(t.yearly) !== p.priceYearly ||
        t.currency !== p.currency;
      if (!changements.length && !tarifChange) continue;

      const membres = grid.subscribers[p.code] ?? 0;
      lignes.push(`— ${identites[p.code].label} (${membres} membre${membres > 1 ? 's' : ''})`);
      if (tarifChange) lignes.push('   • tarifs modifiés');

      const favorables = changements.filter((c) => c.favorable);
      const defavorables = changements.filter((c) => !c.favorable);
      for (const c of favorables) {
        const f = grid.features.find((x) => x.key === c.featureKey);
        lignes.push(`   ↑ ${f?.label ?? c.featureKey} : ${f ? formatRight(c.after, f) : ''} — appliqué tout de suite`);
      }
      for (const c of defavorables) {
        const f = grid.features.find((x) => x.key === c.featureKey);
        const protege = p.isDefault
          ? 'appliqué tout de suite (plan par défaut)'
          : `${membres} abonné${membres > 1 ? 's' : ''} conserve${membres > 1 ? 'nt' : ''} ses conditions`;
        lignes.push(`   ↓ ${f?.label ?? c.featureKey} : ${f ? formatRight(c.after, f) : ''} — ${protege}`);
      }
    }

    if (!lignes.length) {
      await dialog.alert("Aucune modification de droits ou de tarifs. L'identité des plans, elle, s'enregistre sans créer de version.");
    }

    const critiques = alertes.filter((a) => a.severity === 'critique');
    const entete = critiques.length
      ? `⚠ ${critiques.length} quota de flux sans valeur : la consommation restera illimitée.\n\n`
      : '';
    const ok = await dialog.confirm(`${entete}${lignes.join('\n') || 'Identité des plans uniquement.'}\n\nPublier ?`, {
      okLabel: 'Publier',
    });
    if (!ok) return;

    const motif = await dialog.prompt('Motif de la modification (obligatoire, conservé au journal) :', {
      required: true,
    });
    if (!motif) return;

    setBusy(true);
    try {
      const supabase = createClient();
      for (const p of grid.plans) {
        const t = tarifs[p.code];
        const { error } = await (
          supabase.rpc as unknown as (
            fn: string,
            args: Record<string, unknown>,
          ) => PromiseLike<{ error: { message: string } | null }>
        )('mc_publish_plan_version', {
          p_plan_id: grid.planIds[p.code],
          p_label: identites[p.code].label.trim(),
          p_tagline: identites[p.code].tagline.trim() || null,
          p_order_index: identites[p.code].orderIndex,
          p_active: identites[p.code].active,
          p_trial_allowed: identites[p.code].trialAllowed,
          p_price_monthly: nombreOuNull(t.monthly),
          p_price_yearly: nombreOuNull(t.yearly),
          p_currency: t.currency || 'EUR',
          p_rights: grid.features.map((f) => ({
            feature_key: f.key,
            value: droits[p.code][f.key]?.value ?? 'NO',
            limit_value: droits[p.code][f.key]?.limitValue ?? null,
            unlimited: droits[p.code][f.key]?.unlimited ?? false,
          })),
          p_reason: motif,
        });
        if (error) {
          await dialog.alert(`Publication de « ${identites[p.code].label} » : ${error.message}`);
          setBusy(false);
          return;
        }
      }
      // La grille est servie par le cache de référence : sans invalidation,
      // la page publique afficherait l'ancienne jusqu'à une heure.
      await revalidateReference('plans');
      await revalidateReference('plan_versions');
      await revalidateReference('features');
      await revalidateReference('plan_features');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 lg:p-10">
      <LoadingOverlay visible={busy} label="Publication…" />
      <h1 className="mb-2 font-display text-3xl text-primary">Plans d’abonnement</h1>
      <p className="mb-8 max-w-3xl text-sm text-on-surface-variant">
        Le code technique d’un plan est immuable et n’est jamais montré aux membres : renommer un plan ne
        change aucun droit. Les modifications restent locales tant que vous n’avez pas publié.
      </p>

      {alertes.length > 0 && (
        <div className="mb-8 rounded-lg border border-outline-variant bg-surface-container p-4">
          <p className="mb-2 font-label-md text-[15px]">Contrôle de cohérence</p>
          <ul className="space-y-1 text-sm">
            {alertes.map((a, i) => (
              <li key={i} className={a.severity === 'critique' ? 'text-error' : 'text-on-surface-variant'}>
                {a.severity === 'critique' ? '⚠ ' : '• '}
                {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="w-1/3 p-2 text-left align-bottom" />
              {grid.plans.map((p) => (
                <th key={p.code} className="p-2 text-left align-bottom">
                  <span className="block text-[11px] uppercase tracking-wide text-on-surface-variant">{p.code}</span>
                  <input
                    className="mt-1 w-full rounded border border-outline-variant bg-surface p-1.5 font-label-md"
                    value={identites[p.code].label}
                    onChange={(e) =>
                      setIdentites((s) => ({ ...s, [p.code]: { ...s[p.code], label: e.target.value } }))
                    }
                  />
                  <input
                    className="mt-1 w-full rounded border border-outline-variant bg-surface p-1.5 text-xs"
                    placeholder="Accroche"
                    value={identites[p.code].tagline}
                    onChange={(e) =>
                      setIdentites((s) => ({ ...s, [p.code]: { ...s[p.code], tagline: e.target.value } }))
                    }
                  />
                  <label className="mt-2 flex items-center gap-1.5 text-xs font-normal">
                    <input
                      type="checkbox"
                      checked={identites[p.code].active}
                      onChange={(e) =>
                        setIdentites((s) => ({ ...s, [p.code]: { ...s[p.code], active: e.target.checked } }))
                      }
                    />
                    Proposé
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-normal">
                    <input
                      type="checkbox"
                      checked={identites[p.code].trialAllowed}
                      onChange={(e) =>
                        setIdentites((s) => ({ ...s, [p.code]: { ...s[p.code], trialAllowed: e.target.checked } }))
                      }
                    />
                    Essai autorisé
                  </label>
                  <span className="mt-1 block text-xs font-normal text-on-surface-variant">
                    {grid.subscribers[p.code] ?? 0} membre{(grid.subscribers[p.code] ?? 0) > 1 ? 's' : ''}
                  </span>
                </th>
              ))}
            </tr>
            <tr className="border-b border-outline-variant">
              <th className="p-2 text-left font-label-md">Tarifs</th>
              {grid.plans.map((p) => (
                <th key={p.code} className="p-2 text-left font-normal">
                  <div className="flex gap-1">
                    <input
                      className="w-20 rounded border border-outline-variant bg-surface p-1.5"
                      placeholder="/ mois"
                      inputMode="decimal"
                      value={tarifs[p.code].monthly}
                      onChange={(e) => setTarifs((s) => ({ ...s, [p.code]: { ...s[p.code], monthly: e.target.value } }))}
                    />
                    <input
                      className="w-20 rounded border border-outline-variant bg-surface p-1.5"
                      placeholder="/ an"
                      inputMode="decimal"
                      value={tarifs[p.code].yearly}
                      onChange={(e) => setTarifs((s) => ({ ...s, [p.code]: { ...s[p.code], yearly: e.target.value } }))}
                    />
                  </div>
                  <span className="mt-1 block text-xs text-on-surface-variant">
                    Tarif annuel vide : l’option annuelle disparaît de la page publique.
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sections.map(([section, features]) => (
              <Fragment key={section}>
                <tr className="bg-surface-container">
                  <td colSpan={grid.plans.length + 1} className="p-2 font-label-md text-[15px] text-primary">
                    {section}
                  </td>
                </tr>
                {features.map((f) => (
                  <tr key={f.key} className="border-b border-outline-variant/50">
                    <td className="p-2 align-top">
                      <span className={f.visible ? '' : 'text-on-surface-variant line-through'}>{f.label}</span>
                      {!f.visible && <span className="ml-2 text-xs text-on-surface-variant">(masquée)</span>}
                      {f.limitType !== 'NONE' && (
                        <span className="ml-2 text-xs text-on-surface-variant">
                          {f.limitType === 'FLOW' ? 'quota' : 'plafond'}
                          {f.unit ? ` · ${f.unit}` : ''}
                        </span>
                      )}
                    </td>
                    {grid.plans.map((p) => (
                      <td key={p.code} className="p-2 align-top">
                        <CaseDroit
                          feature={f}
                          right={droits[p.code][f.key]}
                          onChange={(patch) => setDroit(p.code, f.key, patch)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={publier}
          className="rounded-full bg-primary px-6 py-2.5 font-label-md text-on-primary disabled:opacity-50"
          disabled={busy}
        >
          Publier
        </button>
        <span className="text-sm text-on-surface-variant">
          {modifies.length === 0
            ? 'Aucune nouvelle version à créer.'
            : `${modifies.length} plan${modifies.length > 1 ? 's' : ''} verra une nouvelle version.`}
        </span>
      </div>
    </div>
  );
}

/**
 * Une case de la grille. Le sélecteur n'offre que ce que le type de la
 * fonctionnalité autorise : « Oui » sur une ligne plafonnable, ou « Limité »
 * sur une ligne qui ne l'est pas, sont refusés par la base — autant ne pas
 * les proposer.
 */
function CaseDroit({
  feature,
  right,
  onChange,
}: {
  feature: GridFeature;
  right: GridRight | undefined;
  onChange: (patch: Partial<GridRight>) => void;
}) {
  const valeur = right?.value ?? 'NO';
  const plafonnable = feature.limitType !== 'NONE';

  return (
    <div className="space-y-1">
      <select
        className="w-full rounded border border-outline-variant bg-surface p-1.5"
        value={valeur}
        onChange={(e) => {
          const v = e.target.value as GridRight['value'];
          onChange(v === 'LIMIT' ? { value: v } : { value: v, limitValue: null, unlimited: false });
        }}
      >
        <option value="NO">Non</option>
        {plafonnable ? <option value="LIMIT">Limité</option> : <option value="YES">Oui</option>}
      </select>

      {valeur === 'LIMIT' && (
        <>
          <input
            className="w-full rounded border border-outline-variant bg-surface p-1.5 disabled:opacity-40"
            inputMode="numeric"
            placeholder="valeur"
            disabled={right?.unlimited ?? false}
            value={right?.limitValue === null || right?.limitValue === undefined ? '' : String(right.limitValue)}
            onChange={(e) => {
              const n = Number.parseInt(e.target.value, 10);
              onChange({ limitValue: Number.isFinite(n) && n >= 0 ? n : null });
            }}
          />
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={right?.unlimited ?? false}
              onChange={(e) => onChange({ unlimited: e.target.checked, limitValue: e.target.checked ? null : right?.limitValue ?? null })}
            />
            Illimité
          </label>
        </>
      )}
    </div>
  );
}
