'use client';

// Portée « Mes listes » du carnet (JEP-376, lots 2 et 3) : choisir la liste
// affichée, et gérer ses listes personnelles — créer, renommer, déplacer d'un
// cran, supprimer. Toutes les écritures passent par `/api/listes` (droit
// vérifié côté serveur) ; ici, l'interface ne fait que refléter les droits.
//
// Sans le droit `listes_recettes` (rétrogradation), les listes restent
// consultables et supprimables ; créer, renommer et déplacer sont grisés.
import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { LockedAction } from '@/components/LockedAction';
import { carnetParamsToQueryString, type CarnetParams } from '@/lib/carnet-params';
import { NOM_LISTE_MAX, plafondListesAtteint, type ListeResume } from '@/lib/recipe-lists';

const BOUTON =
  'flex items-center gap-1 rounded-pill border border-outline-variant px-3 py-1.5 text-[12.5px] font-semibold text-on-surface-variant transition-colors hover:border-primary hover:text-primary disabled:opacity-50 disabled:hover:border-outline-variant disabled:hover:text-on-surface-variant';

export function ListesBar({
  params,
  listes,
  selection,
  peutListes,
  max,
  indisponibles,
}: {
  params: CarnetParams;
  listes: ListeResume[];
  selection: ListeResume | null;
  peutListes: boolean;
  max: number | null;
  indisponibles: number;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const { busy, mutate } = useMutation();
  const [navigation, startTransition] = useTransition();

  const hrefListe = (id: string) => {
    const qs = carnetParamsToQueryString({ ...params, scope: 'listes', liste: id });
    return `/carnet?${qs}`;
  };

  const ecrire = (url: string, method: string, corps?: unknown) => async () => {
    const res = await fetch(url, {
      method,
      headers: corps ? { 'Content-Type': 'application/json' } : undefined,
      body: corps ? JSON.stringify(corps) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? { error: null, json } : { error: { message: json?.erreur || 'Enregistrement impossible.' }, json };
  };

  async function creer() {
    const nom = await dialog.prompt('Nom de la nouvelle liste', {
      required: true,
      singleLine: true,
      maxLength: NOM_LISTE_MAX,
      placeholder: 'Noël, À tester, Examen blanc…',
    });
    if (!nom?.trim()) return;
    let id: string | null = null;
    const ok = await mutate(
      async () => {
        const r = await ecrire('/api/listes', 'POST', { nom })();
        if (!r.error) id = (r.json as { liste: ListeResume }).liste.id;
        return r;
      },
      { errorLabel: 'Liste non créée', refresh: false },
    );
    // La nouvelle liste s'ouvre aussitôt : une navigation, qui relit le serveur.
    if (ok && id) startTransition(() => router.replace(hrefListe(id as string), { scroll: false }));
  }

  async function renommer(l: ListeResume) {
    const nom = await dialog.prompt('Nouveau nom de la liste', {
      required: true,
      singleLine: true,
      maxLength: NOM_LISTE_MAX,
      defaultValue: l.nom,
    });
    if (!nom?.trim() || nom.trim() === l.nom) return;
    await mutate(ecrire(`/api/listes/${l.id}`, 'PATCH', { nom }), { errorLabel: 'Liste non renommée' });
  }

  async function deplacer(l: ListeResume, sens: 'haut' | 'bas') {
    await mutate(ecrire(`/api/listes/${l.id}`, 'PATCH', { sens }), { errorLabel: 'Liste non déplacée' });
  }

  async function supprimer(l: ListeResume) {
    // Après suppression, la page retombe d'elle-même sur la première liste
    // (identifiant inconnu = première liste, cf. app/carnet/page.tsx).
    await mutate(ecrire(`/api/listes/${l.id}`, 'DELETE'), {
      confirm: `Supprimer la liste « ${l.nom} » ? Les recettes qu’elle contient restent dans votre carnet ; seule la liste disparaît.`,
      errorLabel: 'Liste non supprimée',
    });
  }

  const plafond = plafondListesAtteint(listes.length, max);
  const i = selection ? listes.findIndex((l) => l.id === selection.id) : -1;

  return (
    <div className="mt-6 flex flex-col gap-4 rounded-lg border border-outline-variant bg-surface-container-low px-5 py-4">
      <LoadingOverlay visible={busy || navigation} />
      <div className="flex flex-wrap items-center gap-2">
        {listes.map((l) => {
          const actif = selection?.id === l.id;
          return (
            <Link
              key={l.id}
              href={hrefListe(l.id)}
              scroll={false}
              aria-current={actif ? 'true' : undefined}
              className={`whitespace-nowrap rounded-pill px-4 py-1.5 font-label-md text-[12.5px] transition-all ${
                actif
                  ? 'bg-primary text-on-primary'
                  : 'border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
              }`}
            >
              {l.nom} <span className="opacity-60">{l.nombre}</span>
            </Link>
          );
        })}
        {peutListes ? (
          <button type="button" onClick={creer} disabled={busy || plafond} className={BOUTON} title={plafond ? `Votre formule permet ${max} listes.` : undefined}>
            <span className="material-symbols-outlined text-[16px]" aria-hidden>add</span>
            Nouvelle liste
          </button>
        ) : (
          <LockedAction
            label="Nouvelle liste"
            message="Créer des listes de recettes n'est pas inclus dans votre formule."
            className="whitespace-nowrap rounded-pill border border-outline-variant px-3 py-1.5 text-[12.5px]"
          >
            Nouvelle liste
          </LockedAction>
        )}
      </div>

      {plafond && peutListes && (
        <p className="text-[13px] text-on-surface-variant">
          Vous avez atteint les {max} listes de votre formule. Supprimez-en une pour en créer une autre.
        </p>
      )}

      {selection && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-4">
          <div className="min-w-0 text-[14px]">
            <p className="font-semibold text-primary">{selection.nom}</p>
            <p className="text-on-surface-variant">
              Les recettes que vous y avez rangées avec le bouton « Listes » d’une fiche recette.
              {indisponibles > 0 &&
                (indisponibles === 1
                  ? ' 1 recette n’est plus accessible (supprimée, dépubliée ou devenue privée).'
                  : ` ${indisponibles} recettes ne sont plus accessibles (supprimées, dépubliées ou devenues privées).`)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => deplacer(selection, 'haut')} disabled={busy || !peutListes || i <= 0} className={BOUTON} aria-label="Déplacer la liste vers la gauche" title="Déplacer vers la gauche">
              <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_back</span>
            </button>
            <button type="button" onClick={() => deplacer(selection, 'bas')} disabled={busy || !peutListes || i < 0 || i >= listes.length - 1} className={BOUTON} aria-label="Déplacer la liste vers la droite" title="Déplacer vers la droite">
              <span className="material-symbols-outlined text-[16px]" aria-hidden>arrow_forward</span>
            </button>
            <button type="button" onClick={() => renommer(selection)} disabled={busy || !peutListes} className={BOUTON}>
              <span className="material-symbols-outlined text-[16px]" aria-hidden>edit</span>
              Renommer
            </button>
            <button type="button" onClick={() => supprimer(selection)} disabled={busy} className={BOUTON}>
              <span className="material-symbols-outlined text-[16px] text-error" aria-hidden>delete</span>
              Supprimer
            </button>
          </div>
        </div>
      )}

      {!peutListes && listes.length > 0 && (
        <p className="text-[13px] text-on-surface-variant">
          Votre formule n’inclut plus les listes : elles restent consultables, et vous pouvez en retirer des recettes ou les
          supprimer.{' '}
          <Link href="/plans" prefetch={false} className="font-semibold text-primary underline">
            Voir les formules
          </Link>
        </p>
      )}
    </div>
  );
}
