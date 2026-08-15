'use client';

// Grille du carnet — un seul plan de travail filtré (cf. CarnetToolbar pour
// les pastilles). Le filtrage et le tri sont déjà faits côté serveur
// (lib/carnet.ts `applyCarnetFilters`, appliqué par app/carnet/page.tsx) :
// ce composant ne fait que rendre la liste reçue, avec un gabarit de carte
// différent selon la provenance de chaque élément (README « Mon carnet » —
// mes recettes portent statut/actions, les recettes des autres portent
// auteur/note, jamais les deux).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { formatDate, formatTime } from '@/lib/format';
import { effectiveTimes } from '@/lib/recipe-view';
import { FavoriteHeart } from '@/components/FavoriteHeart';
import { MaryseIcon } from '@/components/MaryseIcon';
import { AllergenPictosView } from '@/components/recipe/AllergenPictosView';
import { PlanBadgeIcon } from '@/components/recipe/PlanBadgeIcon';
import { useCarnetTransition } from '@/components/carnet/CarnetProvider';
import type { CarnetItem } from '@/lib/carnet';

// Délai avant d'afficher le fouet pour une navigation de tri/recherche : un
// rafraîchissement quasi instantané ne doit pas produire de clignotement —
// même délai que NavigationSpinner et SearchResults.
const NAV_SHOW_DELAY_MS = 120;

const STATUS: Record<string, { label: string; badge: string }> = {
  published: { label: 'Publiée', badge: 'bg-green-700' },
  pending: { label: 'En attente', badge: 'bg-secondary/90' },
  draft: { label: 'Brouillon', badge: 'bg-secondary/90' },
  rejected: { label: 'Refusée', badge: 'bg-error/90' },
};

export function CarnetContent({
  items,
  favIds,
  importsEnAttente,
  emptyMessage,
}: {
  items: CarnetItem[];
  favIds: string[];
  importsEnAttente: number;
  emptyMessage: string;
}) {
  const { mutate, busy } = useMutation();
  const { pending: navPending } = useCarnetTransition();
  const [navVisible, setNavVisible] = useState(false);
  useEffect(() => {
    if (!navPending) {
      setNavVisible(false);
      return;
    }
    const timer = setTimeout(() => setNavVisible(true), NAV_SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [navPending]);

  // Suppression optimiste : un simple ensemble d'ids retirés cette session,
  // superposé au rendu — jamais une copie de `items` en état local. Une copie
  // (`useState(items)` + resynchro par effet) peut masquer des props pourtant
  // à jour si un rendu intermédiaire est manqué ; un filtre posé sur les
  // props reçues ne peut, par construction, jamais afficher autre chose que
  // ce que le serveur vient d'envoyer.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const list = items.filter((i) => !removedIds.has(i.recipe.id));

  async function delRecipe(id: string, title: string) {
    const ok = await mutate(() => createClient().from('recipes').delete().eq('id', id), {
      confirm: `Supprimer « ${title} » ?\nCette action est définitive.`,
    });
    if (ok) setRemovedIds((prev) => new Set(prev).add(id));
  }

  // Révocation d'un partage reçu, par son destinataire (RLS `shared_with_id =
  // auth.uid()` en DELETE — cf. lib/shares.ts). Un partage « via le carnet »
  // couvre toutes les recettes de son auteur, pas seulement celle de la
  // carte cliquée : le retirer les fait toutes disparaître de ce scope au
  // prochain rendu serveur (`mutate` resynchronise), `removedIds` ne masque
  // ici que la carte cliquée en attendant.
  async function revokeShare(item: Extract<CarnetItem, { kind: 'other' }>) {
    if (!item.shared) return;
    const via = item.shared;
    const r = item.recipe;
    const confirmMsg =
      via.kind === 'book'
        ? `Retirer l’accès à tout le carnet partagé par ${r.profiles?.full_name || 'ce membre'} ?\nVous perdrez l’accès à toutes ses recettes partagées, pas seulement celle-ci.`
        : `Retirer le partage de « ${r.title} » ?`;
    const ok = await mutate(
      async () => {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return null;
        return via.kind === 'book'
          ? supabase
              .from('book_shares' as never)
              .delete()
              .eq('owner_id', via.ownerId)
              .eq('shared_with_id', user.id)
          : supabase
              .from('recipe_shares' as never)
              .delete()
              .eq('recipe_id', r.id)
              .eq('shared_with_id', user.id);
      },
      { confirm: confirmMsg },
    );
    if (ok) setRemovedIds((prev) => new Set(prev).add(r.id));
  }

  return (
    <>
      <LoadingOverlay visible={busy || navVisible} label="Traitement en cours…" />

      {importsEnAttente > 0 && (
        <Link
          href="/importer"
          prefetch={false}
          className="mt-6 flex items-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low px-4 py-3 transition-colors hover:border-primary"
        >
          <span className="material-symbols-outlined text-[20px] text-primary" aria-hidden>
            inbox
          </span>
          <span className="font-body-md text-sm text-on-surface">
            {importsEnAttente} import{importsEnAttente > 1 ? 's' : ''} en attente de relecture — un import n&apos;entre
            au carnet qu&apos;une fois relu.
          </span>
          <span className="material-symbols-outlined ml-auto text-[20px] text-on-surface-variant" aria-hidden>
            chevron_right
          </span>
        </Link>
      )}

      {list.length > 0 ? (
        <div className="grid grid-cols-1 gap-8 py-8 md:grid-cols-2 lg:grid-cols-3">
          {list.map((item) =>
            item.kind === 'mine' ? (
              <MineCard key={item.recipe.id} item={item} favIds={favIds} onDelete={delRecipe} />
            ) : (
              <OtherCard key={item.recipe.id} item={item} favIds={favIds} onRevokeShare={revokeShare} />
            ),
          )}
        </div>
      ) : (
        <p className="py-16 text-center italic text-on-surface-variant">{emptyMessage}</p>
      )}
    </>
  );
}

function MineCard({
  item,
  favIds,
  onDelete,
}: {
  item: Extract<CarnetItem, { kind: 'mine' }>;
  favIds: string[];
  onDelete: (id: string, title: string) => void;
}) {
  const r = item.recipe;
  const st = STATUS[r.status] || STATUS.draft;
  const times = effectiveTimes(r);
  return (
    <div className="group relative border border-outline-variant bg-surface-container-lowest transition-all duration-500 hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/recette/${r.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-container">
          {r.hero_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
            <img
              src={r.hero_image_url}
              alt={r.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl">cake</span>
            </div>
          )}
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
            <span className={`${st.badge} rounded px-2 py-1 font-label-md text-[10px] text-white`}>{st.label}</span>
            <span className="rounded bg-white/90 px-2 py-1 font-label-md text-[10px] text-primary">
              {r.is_public === false ? 'Privée' : 'Publique'}
            </span>
          </div>
        </div>
      </Link>
      <Link
        href={`/recette/${r.id}?planifier=1`}
        title="Planifier cette recette"
        prefetch={false}
        className="absolute right-[9rem] top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
      >
        <PlanBadgeIcon />
      </Link>
      <Link
        href={`/creer?id=${r.id}`}
        title="Modifier"
        prefetch={false}
        className="absolute right-[6.25rem] top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
      >
        <span className="material-symbols-outlined text-[20px] text-primary">edit_note</span>
      </Link>
      <FavoriteHeart recipeId={r.id} initialFav={favIds.includes(r.id)} className="top-3 right-14" />
      <button
        type="button"
        title="Supprimer"
        onClick={() => onDelete(r.id, r.title)}
        className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
      >
        <span className="material-symbols-outlined text-[20px] text-error">delete</span>
      </button>
      <div className="p-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {(r.difficulties?.level || 0) > 0 && (
              <span className="flex shrink-0 items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <MaryseIcon key={i} size={14} className={i <= (r.difficulties?.level || 0) ? 'text-primary' : 'text-outline-variant'} />
                ))}
              </span>
            )}
            {r.recipe_types?.name && (
              <span className="truncate font-label-md text-xs uppercase tracking-widest text-secondary">
                {r.recipe_types.name}
              </span>
            )}
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs text-on-surface-variant">
            {formatTime(times.total || times.prep)}
          </span>
        </div>
        <Link href={`/recette/${r.id}`}>
          <h3 className="mb-2 font-headline-md text-xl text-on-surface transition-colors group-hover:text-primary">
            {r.title}
          </h3>
        </Link>
        {r.description && <p className="mb-4 line-clamp-2 text-sm text-on-surface-variant">{r.description}</p>}
        <AllergenPictosView items={r.allergenItems} className="mb-4" iconClassName="w-6 h-6" />
        <span className="text-xs text-secondary">
          {formatDate(r.created_at)}
          {r.rating_avg ? ' · ' + Number(r.rating_avg).toFixed(1) + ' ★' : ''}
        </span>
      </div>
    </div>
  );
}

function OtherCard({
  item,
  favIds,
  onRevokeShare,
}: {
  item: Extract<CarnetItem, { kind: 'other' }>;
  favIds: string[];
  onRevokeShare: (item: Extract<CarnetItem, { kind: 'other' }>) => void;
}) {
  const r = item.recipe;
  const times = effectiveTimes(r);
  return (
    <div className="group relative border border-primary bg-surface-container-lowest transition-all duration-500 hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/recette/${r.id}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-surface-container">
          {r.hero_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- data-URL / cross-origin
            <img
              src={r.hero_image_url}
              alt={r.title}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl">cake</span>
            </div>
          )}
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
            {item.favorite && (
              <span className="rounded bg-white/90 px-2 py-1 font-label-md text-[10px] text-primary">Favori</span>
            )}
            {/* Statut connu seulement pour ce qui est partagé (favoris/abonnements
                ne portent que du déjà-publié) — même badge que MineCard, pour
                qu'un brouillon partagé se distingue au premier coup d'œil. Pas
                de « Partagée avec vous » à côté : le bouton de révocation
                (lien barré) ci-dessous porte déjà cette information. */}
            {item.shared && item.status && (
              <span className={`${(STATUS[item.status] || STATUS.draft).badge} rounded px-2 py-1 font-label-md text-[10px] text-white`}>
                {(STATUS[item.status] || STATUS.draft).label}
              </span>
            )}
          </div>
        </div>
      </Link>
      <Link
        href={`/recette/${r.id}?planifier=1`}
        title="Planifier cette recette"
        prefetch={false}
        className="absolute right-14 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
      >
        <PlanBadgeIcon />
      </Link>
      {item.shared && (
        <button
          type="button"
          title="Retirer ce partage"
          onClick={() => onRevokeShare(item)}
          className="absolute right-[6.25rem] top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow transition-transform hover:scale-110"
        >
          <span className="material-symbols-outlined text-[20px] text-error">link_off</span>
        </button>
      )}
      <FavoriteHeart recipeId={r.id} initialFav={favIds.includes(r.id)} className="top-3 right-3" />
      <div className="p-6">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {(r.difficulties?.level || 0) > 0 && (
              <span className="flex shrink-0 items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <MaryseIcon key={i} size={14} className={i <= (r.difficulties?.level || 0) ? 'text-primary' : 'text-outline-variant'} />
                ))}
              </span>
            )}
            {r.recipe_types?.name && (
              <span className="truncate font-label-md text-xs uppercase tracking-widest text-secondary">
                {r.recipe_types.name}
              </span>
            )}
          </div>
          <span className="shrink-0 whitespace-nowrap text-xs text-on-surface-variant">
            {formatTime(times.total || times.prep)}
          </span>
        </div>
        <Link href={`/recette/${r.id}`}>
          <h3 className="mb-2 font-headline-md text-xl text-on-surface transition-colors group-hover:text-primary">
            {r.title}
          </h3>
        </Link>
        {r.description && <p className="mb-4 line-clamp-2 text-sm text-on-surface-variant">{r.description}</p>}
        <AllergenPictosView items={r.allergenItems} className="mb-4" iconClassName="w-6 h-6" />
        <span className="text-xs text-secondary">
          <Link href={`/u/${r.profiles?.username || r.author_id}`} prefetch={false} className="hover:text-primary hover:underline">
            {r.profiles?.full_name || 'Auteur'}
          </Link>
          {item.subscription && item.publishedAt ? ' · publiée le ' + formatDate(item.publishedAt) : ''}
          {r.rating_avg ? ' · ' + Number(r.rating_avg).toFixed(1) + ' ★' : ''}
        </span>
      </div>
    </div>
  );
}
