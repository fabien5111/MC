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
import { formatDate } from '@/lib/format';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { CheckoutWaiverDialog } from '@/components/plans/CheckoutWaiverDialog';
import {
  annualSaving,
  diffRights,
  formatRight,
  hasYearlyOption,
  rightScore,
  type Grid,
} from '@/lib/entitlements';
import type { PendingRequest } from '@/lib/entitlements-data';

export function PlansPage({
  grid,
  planIds,
  connecte,
  currentPlanCode,
  essaiActif,
  trialConsumed,
  trialDays,
  pending,
  abonnementStripe,
}: {
  grid: Grid;
  planIds: Record<string, number>;
  connecte: boolean;
  currentPlanCode: string | null;
  // Abonnement courant de type TRIAL (§12 de docs/abonnements.md — la
  // colonne visible n'est alors pas forcément « Pro » mais un plan
  // technique d'essai, ex. « Essai Plan Pro ») : conditionne le remplacement
  // de « Rétrograder » par « Annuler mon essai » / « S'abonner ».
  essaiActif: boolean;
  trialConsumed: boolean;
  trialDays: number;
  pending: PendingRequest | null;
  // L'abonnement courant est un abonnement Stripe (`provider = 'stripe'`),
  // donc modifiable en ligne. Faux pour un essai, un don administrateur ou
  // un reliquat de l'ancienne simulation : ceux-là n'ont rien à changer chez
  // Stripe, et gardent le parcours de demande traité à la main.
  abonnementStripe: boolean;
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

  // Bascule masquée pour un abonné Stripe : un changement de FORMULE ne
  // change pas de PÉRIODICITÉ (la route la lit sur l'abonnement), et laisser
  // la bascule afficher un tarif annuel à un abonné mensuel — ou l'inverse —
  // ferait annoncer un montant qui n'est pas celui qui sera prélevé.
  // Changer de périodicité reste hors périmètre de la phase 1.
  const bascule = hasYearlyOption(plans) && !abonnementStripe;
  const currentIndex = plans.findIndex((p) => p.code === currentPlanCode);

  async function essayer(planCode: string, planLabel: string) {
    const ok = await dialog.confirm(
      `Essai gratuit de ${trialDays} jours sur ${planLabel}, sans moyen de paiement — un seul essai possible par ` +
        `membre, toutes formules confondues. Continuer ?`,
      { okLabel: 'Démarrer mon essai', cancelLabel: 'Annuler' },
    );
    if (!ok) return;
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
      await dialog.alert(`Essai démarré : profitez de ${trialDays} jours de ${planLabel} gratuitement.`);
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

  // Souscription réelle (JEP-29) : ouvre une session Stripe Checkout après
  // acceptation de la renonciation au droit de rétractation. Remplace
  // l'ancienne simulation par code (`mc_simulate_subscribe`, §13 de
  // docs/abonnements.md) — retirée avec ce lot, comme annoncé.
  //
  // N'écrit RIEN elle-même : `subscriptions` n'est mis à jour que par le
  // webhook, une fois le paiement réellement confirmé (cf.
  // app/api/webhooks/stripe/route.ts). Un membre qui ferme l'onglet Stripe
  // n'est pas abonné.
  const [waiverPlan, setWaiverPlan] = useState<{ code: string; label: string; mode: 'souscription' | 'montee' } | null>(null);

  // Plan passé en argument plutôt que relu dans l'état : la fenêtre est
  // fermée juste avant l'appel, et dépendre de la valeur encore capturée par
  // la fermeture serait une subtilité de plus à retenir pour rien.
  async function demarrerAbonnement(code: string, renonciationAcceptee: boolean) {
    setBusy(true);
    try {
      const r = await fetch('/api/abonnement/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          plan: code,
          periodicite: annuel ? 'YEARLY' : 'MONTHLY',
          renonciationRetractation: renonciationAcceptee,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.url) {
        dialog.alert(data?.erreur || "Impossible d'ouvrir la page de paiement, réessayez.");
        return;
      }
      // Redirection pleine page vers Stripe Checkout : pas de router.push, on
      // quitte l'application le temps du paiement. `busy` reste vrai jusqu'au
      // départ effectif, pour ne pas laisser la page cliquable entre-temps.
      window.location.href = data.url;
    } catch {
      dialog.alert('Connexion impossible, réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function changerFormule(planCode: string, planLabel: string, renonciationAcceptee: boolean) {
    setBusy(true);
    try {
      const r = await fetch('/api/abonnement/changer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Pas de périodicité transmise : la route la lit sur l'abonnement
        // lui-même. L'envoyer d'ici ferait dépendre une facturation de la
        // position d'une bascule d'affichage.
        body: JSON.stringify({
          plan: planCode,
          renonciationRetractation: renonciationAcceptee,
          // Jeton par CLIC : deux envois du même clic ne débitent qu'une fois,
          // une reprise après « changez de carte » repart à neuf.
          jeton: crypto.randomUUID(),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        dialog.alert(data?.erreur || "Le changement de formule n'a pas pu aboutir.");
        return;
      }
      await dialog.alert(
        data?.immediat
          ? // Comme au retour de Checkout : le paiement est fait, mais c'est le
            // webhook qui pose le palier. Annoncer « vous êtes passé à X »
            // alors que la grille rafraîchie affiche encore l'ancienne formule
            // ferait douter le membre de ce qu'il vient de payer.
            `Paiement accepté — la différence a été facturée au prorata. Votre formule ${planLabel} ` +
              `s'active dans quelques instants.`
          : `Changement programmé : vous gardez votre formule actuelle jusqu'au ${formatDate(data?.effetLe)}, ` +
              `puis vous passerez à ${planLabel}.`,
      );
      router.refresh();
    } catch {
      // Même filet que `demarrerAbonnement` : sans lui, un échec réseau
      // éteignait le voile sans un mot, et remontait en rejet non capturé
      // par le `void` de l'appelant.
      dialog.alert('Connexion impossible, réessayez.');
    } finally {
      setBusy(false);
    }
  }

  async function retrograder(planCode: string) {
    if (!currentPlanCode) return;
    const changements = diffRights(grid.rights[currentPlanCode] ?? {}, grid.rights[planCode] ?? {}).filter(
      (c) => !c.favorable,
    );
    // `diffRights` vient du back-office (§8.1), où toute baisse de quota
    // entre deux VERSIONS d'un même plan mérite d'être signalée à l'admin —
    // même sans perte d'accès. Ici, entre deux PLANS distincts, un quota
    // simplement réduit (illimité → 5, 20/mois → 10/mois) n'est pas une
    // perte : le membre garde la fonctionnalité. Seul un score à -1
    // (`rightScore`, droit `NO`) est une vraie disparition — distinguer les
    // deux, sans quoi « vous perdrez » ment sur ce qui reste accessible
    // (constaté le 22/09 en testant une descente Pro → Plus : « Ajustement
    // par IA » et « Partager mon carnet » listés comme perdus alors qu'ils
    // restent utilisables, seulement à un quota moindre).
    const libelle = (c: (typeof changements)[number]) => {
      const f = grid.features.find((x) => x.key === c.featureKey);
      return f?.label ?? null;
    };
    const perdu = changements
      .filter((c) => rightScore(c.after) === -1)
      .map(libelle)
      .filter((v): v is string => !!v)
      .map((label) => `— ${label}`);
    const reduit = changements
      .filter((c) => rightScore(c.after) !== -1)
      .map(libelle)
      .filter((v): v is string => !!v)
      .map((label) => `— ${label}`);
    const blocs = [
      perdu.length ? `Vous perdrez :\n${perdu.join('\n')}` : null,
      reduit.length ? `Vos quotas seront réduits pour :\n${reduit.join('\n')}` : null,
    ].filter((b): b is string => !!b);
    const texte = blocs.length
      ? `En repassant à ${planCode} :\n\n${blocs.join('\n\n')}\n\nContinuer ?`
      : `Repasser à ${planCode} ?`;
    const plan = plans.find((p) => p.code === planCode);
    const complement = abonnementStripe
      ? '\n\nVous gardez votre formule actuelle jusqu’à son échéance ; aucun remboursement au prorata.'
      : '';
    const ok = await dialog.confirm(texte + complement);
    if (!ok) return;
    if (abonnementStripe) {
      // Redescendre vers la formule GRATUITE n'est pas un changement de
      // tarif : elle n'a pas de prix chez Stripe, il n'y a rien à programmer.
      // C'est une résiliation — l'abonnement s'arrête à l'échéance et le
      // membre retombe sur la formule par défaut, ce que la ligne DEFAULT
      // assure déjà toute seule.
      if (plan?.isDefault) await resilier();
      else await changerFormule(planCode, plan?.label ?? planCode, false);
      return;
    }
    await demander(planCode, annuel ? 'YEARLY' : 'MONTHLY');
  }

  async function resilier() {
    setBusy(true);
    try {
      const r = await fetch('/api/abonnement/resilier', { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        dialog.alert(data?.erreur || "La résiliation n'a pas pu aboutir.");
        return;
      }
      await dialog.alert(
        data?.finPeriode
          ? `Résiliation enregistrée : vous gardez votre formule jusqu'au ${formatDate(data.finPeriode)}.`
          : 'Résiliation enregistrée.',
      );
      router.refresh();
    } catch {
      dialog.alert('Connexion impossible, réessayez.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <LoadingOverlay visible={busy} />
      {waiverPlan && (
        <CheckoutWaiverDialog
          planLabel={waiverPlan.label}
          introduction={
            waiverPlan.mode === 'montee'
              ? `La différence avec votre formule actuelle sera facturée immédiatement, au prorata du temps ` +
                `restant sur la période en cours, sur votre moyen de paiement enregistré.`
              : 'Vous allez être redirigé vers notre prestataire de paiement (Stripe) pour finaliser votre abonnement.'
          }
          libelleAction={waiverPlan.mode === 'montee' ? 'Confirmer le changement' : 'Continuer vers le paiement'}
          onClose={() => setWaiverPlan(null)}
          onConfirm={() => {
            const { code, label, mode } = waiverPlan;
            setWaiverPlan(null);
            if (mode === 'montee') void changerFormule(code, label, true);
            else void demarrerAbonnement(code, true);
          }}
        />
      )}
      <h1 className="mb-2 text-center font-display text-3xl text-primary md:text-4xl">Nos formules</h1>
      <p className="mb-8 text-center text-sm text-on-surface-variant">
        Un essai gratuit de {trialDays} jours, sans moyen de paiement, sur les formules qui le proposent — un seul
        essai par membre, toutes formules confondues.
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
            {/* Trois `<tr>` plutôt qu'un seul avec un bloc flex par colonne :
                l'ancienne version empilait titre + accroche + prix + bouton
                dans une seule cellule par formule, alignés par un
                `flex-col justify-between` — ça alignait bien les titres en
                haut et les boutons en bas, mais le PRIX, lui, suit
                directement l'accroche dans le flux : une accroche plus
                longue sur une colonne (ex. « Essai Plan Pro », qui passe sur
                deux lignes) décale son prix vers le bas sans décaler celui
                des colonnes voisines. Une ligne de tableau par nature de
                contenu aligne chaque ligne indépendamment des autres — la
                hauteur d'une ligne suit sa cellule la plus haute, jamais
                celle de la ligne suivante — donc prix et boutons restent à
                la même hauteur d'une colonne à l'autre quelle que soit la
                longueur de l'accroche. */}
            <tr>
              <th className="w-1/4 p-4 pb-1 text-left align-top" />
              {plans.map((p) => (
                <th key={p.code} className="p-4 pb-1 text-center align-top">
                  <p className="font-label-md text-[17px] text-primary">{p.label}</p>
                  {p.tagline && <p className="mt-0.5 text-xs text-on-surface-variant">{p.tagline}</p>}
                </th>
              ))}
            </tr>
            <tr>
              <th className="w-1/4 px-4 pb-1 text-left align-top" />
              {plans.map((p) => {
                const tarif = annuel ? p.priceYearly : p.priceMonthly;
                const eco = bascule ? annualSaving(p.priceMonthly, p.priceYearly) : null;
                return (
                  <th key={p.code} className="px-4 pb-1 text-center align-top">
                    <p className="font-headline-md text-2xl">
                      {tarif === null ? (p.isDefault ? 'Gratuit' : '—') : tarif === 0 ? 'Gratuit' : `${tarif.toFixed(2)} €`}
                      {tarif !== null && tarif > 0 && (
                        <span className="text-sm font-normal text-on-surface-variant">
                          {' '}
                          / {annuel ? 'an' : 'mois'}
                        </span>
                      )}
                    </p>
                    {annuel && eco !== null && <p className="text-xs text-tertiary">Soit {eco} % d’économie</p>}
                  </th>
                );
              })}
            </tr>
            <tr>
              <th className="w-1/4 px-4 pb-4 text-left align-top" />
              {plans.map((p) => {
                const tarif = annuel ? p.priceYearly : p.priceMonthly;
                return (
                  <th key={p.code} className="px-4 pb-4 text-center align-top">
                    <BoutonPlan
                      plan={p}
                      connecte={connecte}
                      estCourant={p.code === currentPlanCode}
                      inferieur={currentIndex >= 0 && p.orderIndex < plans[currentIndex].orderIndex}
                      essaiActif={essaiActif}
                      trialConsumed={trialConsumed}
                      // Sans tarif configuré pour cette formule, « S'abonner »
                      // n'a rien à proposer — jamais affiché dans ce cas
                      // (un essai reste possible, lui, sans moyen de paiement).
                      aUnTarif={tarif !== null}
                      onEssayer={() => essayer(p.code, p.label)}
                      onAbonner={() =>
                        setWaiverPlan({
                          code: p.code,
                          label: p.label,
                          mode: abonnementStripe ? 'montee' : 'souscription',
                        })
                      }
                      onRetrograder={() => retrograder(p.code)}
                    />
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
              // JEP-55 : un plan inactif ne peut apparaître dans `plans` que
              // s'il est le plan courant du membre affiché (filtre au-dessus,
              // `p.active || p.code === currentPlanCode`) — c'est donc,
              // structurellement, la colonne d'un plan technique d'essai
              // (§12 docs/abonnements.md), jamais une formule qu'on peut
              // souscrire. Pas de champ dédié à ajouter : l'invariant existe
              // déjà.
              const texte = formatRight(right, f, !p.active);
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
  essaiActif,
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
  // Abonnement courant de type TRIAL : « Rétrograder » (pensé pour une
  // vraie rétrogradation d'abonnement payant, avec file d'attente admin)
  // n'a pas de sens ici — la formule par défaut propose d'annuler l'essai,
  // les autres de souscrire directement (§ conversation du 01/09).
  essaiActif: boolean;
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
  const clsSecondaire = `${cls} border border-outline-variant text-primary hover:bg-surface-container`;
  const clsPrincipal = `${cls} bg-primary text-on-primary hover:shadow-lg`;

  if (estCourant) {
    return (
      <button type="button" disabled className={`${cls} bg-surface-container text-on-surface-variant`}>
        Votre plan actuel
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
        <Link href="/connexion?inscription=1" className={`block text-center ${clsSecondaire}`}>
          Créer un compte
        </Link>
      );
    }
    return (
      <Link href="/connexion?next=/plans" className={`block text-center ${clsPrincipal}`}>
        {plan.trialAllowed ? 'Essayer' : "S'abonner"}
      </Link>
    );
  }
  if (essaiActif) {
    // La formule par défaut n'a pas de tarif : le seul geste possible est
    // de renoncer à l'essai, jamais réimplémenté ici (doctrine §10 —
    // « actions dupliquées vers /plans, pas réimplémentées », dans l'autre
    // sens) — l'action réelle (confirmation, date de fin) vit dans « Mon
    // forfait », seul endroit qui connaît déjà l'abonnement en détail.
    if (plan.isDefault) {
      return (
        <Link href="/reglages" className={`block text-center ${clsSecondaire}`}>
          Annuler mon essai
        </Link>
      );
    }
    if (!aUnTarif) return null;
    return (
      <button type="button" onClick={onAbonner} className={clsPrincipal}>
        S&apos;abonner
      </button>
    );
  }
  if (inferieur) {
    return (
      <button type="button" onClick={onRetrograder} className={clsSecondaire}>
        Rétrograder
      </button>
    );
  }
  if (plan.trialAllowed && !trialConsumed) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={onEssayer} className={clsPrincipal}>
          Essayer gratuitement
        </button>
        {aUnTarif && (
          <button type="button" onClick={onAbonner} className={clsSecondaire}>
            S&apos;abonner
          </button>
        )}
      </div>
    );
  }
  if (!aUnTarif) return null;
  return (
    <button type="button" onClick={onAbonner} className={clsPrincipal}>
      S&apos;abonner
    </button>
  );
}
