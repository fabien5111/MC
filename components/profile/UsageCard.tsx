// « Mon utilisation » (spec §9.3) : une jauge par limite applicable au
// membre, dans l'ordre de la grille. Server Component pur — aucune
// interaction ici, seulement un lien conditionnel vers /plans.
//
// Pas de `SettingsCard` (bloc repliable) : contrairement aux relations
// révocables (abonnements, partages), c'est une information d'état que le
// membre doit voir d'un coup d'œil, pas une liste qu'il consulte rarement.
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import { gaugeLevel, isOverLimit, overLimitMessage, type GridFeature } from '@/lib/entitlements';
import type { UsageLine } from '@/lib/entitlements-data';
import type { CurrentPlan } from '@/lib/entitlements-data';

const COULEUR_JAUGE: Record<string, string> = {
  normal: 'bg-primary',
  attention: 'bg-secondary',
  atteint: 'bg-error',
};

export function UsageCard({
  usage,
  features,
  currentPlan,
}: {
  usage: UsageLine[];
  features: GridFeature[];
  currentPlan: CurrentPlan | null;
}) {
  const parCle = new Map(features.map((f) => [f.key, f]));
  const lignes = usage
    .map((u) => ({ u, feature: parCle.get(u.featureKey) }))
    .filter((l): l is { u: UsageLine; feature: GridFeature } => !!l.feature)
    .sort((a, b) => a.feature.sectionOrder - b.feature.sectionOrder || a.feature.orderIndex - b.feature.orderIndex);

  // Un lien vers les plans seulement si quelque chose le justifie (§9.3) :
  // pas de sollicitation permanente pour un membre loin de ses limites.
  const approcheOuDepasse = lignes.some(
    ({ u }) => !u.unlimited && u.limitValue !== null && (gaugeLevel(u.usage, u.limitValue) !== 'normal' || isOverLimit(u.usage, u.limitValue)),
  );

  return (
    <section className="mt-6 border border-outline-variant bg-surface-container-lowest p-8 md:p-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="material-symbols-outlined text-[22px] text-primary">speed</span>
        <h2 className="font-headline-md text-headline-md text-primary">Mon utilisation</h2>
        {currentPlan && (
          <span className="ml-auto text-xs text-on-surface-variant">Formule {currentPlan.label}</span>
        )}
      </div>

      {lignes.length === 0 ? (
        <p className="text-sm italic text-on-surface-variant">Aucune limite applicable à votre formule.</p>
      ) : (
        <ul className="space-y-5">
          {lignes.map(({ u, feature }) => {
            const illimite = u.unlimited || u.limitValue === null;
            const depasse = !illimite && isOverLimit(u.usage, u.limitValue);
            const niveau = illimite ? 'normal' : gaugeLevel(u.usage, u.limitValue);
            const pourcentage = illimite ? 0 : Math.min(100, (u.usage / Math.max(u.limitValue!, 1)) * 100);

            return (
              <li key={u.featureKey}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="font-body-md text-sm text-on-surface">{feature.label}</span>
                  <span className="shrink-0 text-xs text-on-surface-variant">
                    {u.usage}
                    {illimite ? '' : ` / ${u.limitValue}`}
                    {feature.unit ? ` ${feature.unit}` : ''}
                    {illimite && ' · illimité'}
                  </span>
                </div>
                {!illimite && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-outline-variant/40">
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
              </li>
            );
          })}
        </ul>
      )}

      {approcheOuDepasse && (
        <Link href="/plans" className="mt-6 inline-block font-label-md text-[13px] text-primary underline">
          Voir les formules
        </Link>
      )}
    </section>
  );
}
