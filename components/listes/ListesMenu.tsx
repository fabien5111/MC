'use client';

// Pastille « Mes listes » du carnet (JEP-376) : un clic ouvre la liste
// déroulante des listes personnelles — « Nouvelle liste » en tête, puis une
// ligne par liste, « Nom (n) », avec ses pictos renommer et supprimer calés à
// droite. Choisir une liste l'affiche (`?scope=listes&liste=<id>`).
//
// Toutes les écritures passent par `/api/listes` (droit vérifié côté
// serveur) ; ici l'interface ne fait que refléter les droits. Sans le droit
// `listes_recettes` (rétrogradation), les listes restent consultables et
// supprimables ; créer et renommer sont grisés.
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@/lib/use-mutation';
import { useDialog } from '@/components/Dialog';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { carnetParamsToQueryString, type CarnetParams } from '@/lib/carnet-params';
import { NOM_LISTE_MAX, plafondListesAtteint, type ListeResume } from '@/lib/recipe-lists';

export function ListesMenu({
  params,
  listes,
  selectionId,
  peutListes,
  max,
  className = '',
}: {
  params: CarnetParams;
  listes: ListeResume[];
  selectionId: string | null;
  peutListes: boolean;
  max: number | null;
  className?: string;
}) {
  const router = useRouter();
  const dialog = useDialog();
  const { busy, mutate } = useMutation();
  const [navigation, startTransition] = useTransition();
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement>(null);

  // Fermeture au clic hors du menu et par Échap.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => e.key === 'Escape' && setOuvert(false);
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', echap);
    };
  }, [ouvert]);

  const actif = params.scope === 'listes';
  const selection = listes.find((l) => l.id === selectionId) ?? null;
  const plafond = plafondListesAtteint(listes.length, max);

  const hrefListe = (id: string) => `/carnet?${carnetParamsToQueryString({ ...params, scope: 'listes', liste: id })}`;

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
    setOuvert(false);
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
    setOuvert(false);
    const nom = await dialog.prompt('Nouveau nom de la liste', {
      required: true,
      singleLine: true,
      maxLength: NOM_LISTE_MAX,
      defaultValue: l.nom,
    });
    if (!nom?.trim() || nom.trim() === l.nom) return;
    await mutate(ecrire(`/api/listes/${l.id}`, 'PATCH', { nom }), { errorLabel: 'Liste non renommée' });
  }

  async function supprimer(l: ListeResume) {
    setOuvert(false);
    // Liste affichée supprimée : la page retombe d'elle-même sur la première
    // (identifiant inconnu = première liste, cf. app/carnet/page.tsx).
    await mutate(ecrire(`/api/listes/${l.id}`, 'DELETE'), {
      confirm: `Supprimer la liste « ${l.nom} » ? Les recettes qu’elle contient restent dans votre carnet ; seule la liste disparaît.`,
      errorLabel: 'Liste non supprimée',
    });
  }

  const PICTO =
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-on-surface-variant';

  return (
    <div ref={racine} className={`relative ${className}`}>
      <LoadingOverlay visible={busy || navigation} />
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        className={`flex items-center gap-1 whitespace-nowrap rounded-pill px-4 py-1.5 font-label-md text-[12.5px] transition-all ${
          actif
            ? 'bg-primary text-on-primary'
            : 'border border-outline-variant text-on-surface-variant hover:border-primary hover:text-primary'
        }`}
      >
        {actif && selection ? `Mes listes : ${selection.nom}` : 'Mes listes'}{' '}
        <span className="opacity-60">{actif && selection ? selection.nombre : listes.length}</span>
        <span className="material-symbols-outlined text-[16px]" aria-hidden>
          {ouvert ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {ouvert && (
        <div
          role="menu"
          className="absolute left-0 top-full z-30 mt-2 flex w-80 max-w-[calc(100vw-32px)] flex-col rounded-lg border border-outline-variant bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={creer}
            disabled={busy || !peutListes || plafond}
            title={!peutListes ? 'Créer des listes n’est pas inclus dans votre formule.' : plafond ? `Votre formule permet ${max} listes.` : undefined}
            className="flex items-center gap-2 px-4 py-2.5 text-left text-[14px] font-semibold text-primary hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              {peutListes ? 'add' : 'block'}
            </span>
            Nouvelle liste
          </button>
          {(listes.length > 0 || !peutListes || plafond) && <div className="my-1 border-t border-outline-variant/60" />}

          {listes.map((l) => {
            const courante = actif && l.id === selectionId;
            return (
              <div key={l.id} role="none" className={`flex items-center gap-1 pl-4 pr-2 ${courante ? 'bg-surface-container-low' : ''}`}>
                <Link
                  role="menuitem"
                  href={hrefListe(l.id)}
                  scroll={false}
                  onClick={() => setOuvert(false)}
                  aria-current={courante ? 'true' : undefined}
                  className={`min-w-0 flex-1 truncate py-2 text-[14px] hover:text-primary ${courante ? 'font-semibold text-primary' : 'text-on-surface'}`}
                >
                  {l.nom} <span className="text-on-surface-variant">({l.nombre})</span>
                </Link>
                <button
                  type="button"
                  onClick={() => renommer(l)}
                  disabled={busy || !peutListes}
                  aria-label={`Renommer la liste ${l.nom}`}
                  title="Renommer"
                  className={PICTO}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden>edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => supprimer(l)}
                  disabled={busy}
                  aria-label={`Supprimer la liste ${l.nom}`}
                  title="Supprimer"
                  className={PICTO}
                >
                  <span className="material-symbols-outlined text-[18px] text-error" aria-hidden>delete</span>
                </button>
              </div>
            );
          })}

          {plafond && peutListes && (
            <p className="px-4 py-2 text-[12px] text-on-surface-variant">
              Vous avez atteint les {max} listes de votre formule. Supprimez-en une pour en créer une autre.
            </p>
          )}
          {!peutListes && (
            <p className="px-4 py-2 text-[12px] text-on-surface-variant">
              Votre formule n’inclut pas les listes : celles que vous avez restent consultables, et vous pouvez les vider ou
              les supprimer.{' '}
              <Link href="/plans" prefetch={false} className="font-semibold text-primary underline">
                Voir les formules
              </Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
