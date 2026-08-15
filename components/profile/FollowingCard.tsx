'use client';

// « Mes abonnements » des réglages — suivre les pâtissiers suivis et arrêter
// de les suivre. `useMutation` (motif `ShareBookButton`) plutôt que l'écriture
// directe de `FollowButton` : ici on ne redirige personne vers la connexion
// (on est déjà connecté), et la garde d'impersonation en lecture seule doit
// s'appliquer comme pour toute autre écriture des réglages.
import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useMutation } from '@/lib/use-mutation';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import { MemberAvatar } from '@/components/share/MemberPicker';
import { formatDate } from '@/lib/format';
import type { FollowedMember } from '@/lib/follows';
import { SettingsCard } from '@/components/profile/SettingsCard';

export function FollowingCard({ userId, following }: { userId: string; following: FollowedMember[] }) {
  const { mutate, busy } = useMutation();
  const [items, setItems] = useState(following);

  async function unfollow(member: FollowedMember['member']) {
    const ok = await mutate(
      () => createClient().from('follows').delete().eq('follower_id', userId).eq('following_id', member.id),
      { confirm: `Ne plus suivre ${member.full_name || 'ce membre'} ?`, refresh: false },
    );
    if (ok) setItems((prev) => prev.filter((i) => i.member.id !== member.id));
  }

  return (
    <SettingsCard icon="how_to_reg" title="Mes abonnements" count={items.length}>
      <LoadingOverlay visible={busy} label="Mise à jour…" />
      {items.length === 0 ? (
        <p className="font-body-md text-sm text-on-surface-variant italic">Vous ne suivez encore aucun pâtissier.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/40">
          {items.map((i) => (
            <li key={i.member.id} className="flex items-center gap-3 py-3">
              <MemberAvatar member={i.member} size={36} />
              <Link href={`/u/${i.member.username || i.member.id}`} className="flex flex-col min-w-0 flex-1 group">
                <span className="font-body-md text-sm text-on-surface truncate group-hover:text-primary">
                  {i.member.full_name || 'Membre'}
                </span>
                {i.created_at && (
                  <span className="font-body-md text-[12px] text-on-surface-variant">Depuis le {formatDate(i.created_at)}</span>
                )}
              </Link>
              <button
                type="button"
                onClick={() => unfollow(i.member)}
                title="Ne plus suivre"
                className="flex items-center justify-center w-8 h-8 rounded-full text-error hover:bg-error/10 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">person_remove</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
