'use client';

// « Partages de mes recettes » des réglages — uniquement les partages
// unitaires (`recipe_shares`), jamais ceux qui viennent d'un partage de
// carnet (`book_shares`, déjà sa propre carte) : un même membre peut donc
// apparaître ici ET dans « Partages de mon carnet » sans doublon fonctionnel,
// ce sont deux accès distincts et révocables indépendamment. Regroupé par
// recette (motif `getRecipeShareInfo`, une recette peut avoir plusieurs
// destinataires directs).
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { MemberAvatar } from '@/components/share/MemberPicker';
import { formatDate } from '@/lib/format';
import type { RecipeShareGiven } from '@/lib/shares';
import { SettingsCard } from '@/components/profile/SettingsCard';

export function RecipeSharesCard({ ownerId, given }: { ownerId: string; given: RecipeShareGiven[] }) {
  const { mutate, busy } = useMutation();
  const [items, setItems] = useState(given.filter((i) => i.recipe));

  async function revoke(item: RecipeShareGiven) {
    if (!item.recipe) return;
    const recipeId = item.recipe.id;
    const recipeTitle = item.recipe.title;
    const ok = await mutate(
      () =>
        createClient()
          .from('recipe_shares' as never)
          .delete()
          .eq('recipe_id', recipeId)
          .eq('owner_id', ownerId)
          .eq('shared_with_id', item.member.id),
      { confirm: `Retirer le partage de « ${recipeTitle} » avec ${item.member.full_name || 'ce membre'} ?`, refresh: false },
    );
    if (ok) setItems((prev) => prev.filter((i) => !(i.recipe?.id === recipeId && i.member.id === item.member.id)));
  }

  const groups = new Map<string, { title: string; entries: RecipeShareGiven[] }>();
  for (const item of items) {
    if (!item.recipe) continue;
    const g = groups.get(item.recipe.id);
    if (g) g.entries.push(item);
    else groups.set(item.recipe.id, { title: item.recipe.title, entries: [item] });
  }

  return (
    <SettingsCard icon="receipt_long" title="Partages de mes recettes" count={items.length}>
      <LoadingOverlay visible={busy} label="Mise à jour…" />
      <p className="font-body-md text-[12px] text-on-surface-variant italic mb-4">
        Uniquement les partages accordés recette par recette — un membre avec qui votre carnet entier est partagé
        peut avoir accès à d&apos;autres recettes sans apparaître ici (cf. « Partages de mon carnet »).
      </p>
      {groups.size === 0 ? (
        <p className="font-body-md text-sm text-on-surface-variant italic">Aucune recette partagée à l&apos;unité.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/40">
          {[...groups.entries()].map(([recipeId, group]) => (
            <li key={recipeId} className="py-3">
              <Link href={`/recette/${recipeId}`} className="font-body-md text-sm font-semibold text-primary hover:underline">
                {group.title}
              </Link>
              <ul className="mt-2 flex flex-col gap-2">
                {group.entries.map((i) => (
                  <li key={i.member.id} className="flex items-center gap-3">
                    <Link href={`/u/${i.member.username || i.member.id}`} className="shrink-0">
                      <MemberAvatar member={i.member} size={28} />
                    </Link>
                    <span className="flex flex-col min-w-0 flex-1">
                      <Link
                        href={`/u/${i.member.username || i.member.id}`}
                        className="font-body-md text-sm text-on-surface truncate hover:text-primary hover:underline"
                      >
                        {i.member.full_name || 'Membre'}
                      </Link>
                      {i.created_at && (
                        <span className="font-body-md text-[12px] text-on-surface-variant">Depuis le {formatDate(i.created_at)}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => revoke(i)}
                      title="Retirer ce partage"
                      className="flex items-center justify-center w-8 h-8 rounded-full text-error hover:bg-error/10 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">link_off</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
